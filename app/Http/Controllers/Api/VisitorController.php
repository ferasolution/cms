<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use App\Services\GateLog;
use App\Models\Visitor;
use App\Models\VisitorPass;
use App\Models\Watchlist;
use App\Support\Activity;
use App\Support\Settings;
use App\Support\Uploads;
use Illuminate\Http\Request;

/**
 * Gate log. Flow: guard records arrival → household is notified and approves / rejects from the app
 * (or the guard admits directly, e.g. with a valid QR pass) → expected departure is set →
 * overstay alerts → guard confirms the actual exit.
 */
class VisitorController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $q = Visitor::with(['house', 'logger:id,name', 'responder:id,name', 'pass:id,code'])->latest('id');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        }
        match ($request->query('status')) {
            'inside' => $q->where('status', 'inside'),
            'awaiting' => $q->where('status', 'awaiting'),
            'exited' => $q->where('status', 'exited'),
            'rejected' => $q->where('status', 'rejected'),
            'overstay' => $q->where('status', 'inside')->where('expected_exit_at', '<', now()),
            default => null,
        };
        if ($c = $request->query('category')) {
            $q->where('category', $c);
        }
        if (($h = $request->query('house_id')) && ! $u->isResident()) {
            $q->where('house_id', $h);
        }

        return $this->paginate($q, $request, ['name', 'cnic', 'phone', 'vehicle_no', 'purpose']);
    }

    private function rules(): array
    {
        return [
            'house_id' => 'nullable|exists:houses,id',
            'name' => 'required|string|max:120',
            'cnic' => 'nullable|string|max:20',
            'phone' => 'nullable|string|max:30',
            'category' => 'required|in:visitor,guest,worker,relative,friend,delivery,staff,emergency,contractor,other',
            'purpose' => 'required|string|max:255',
            'vehicle_no' => 'nullable|string|max:30',
            'vehicle_type' => 'nullable|in:car,bike,rickshaw,van,truck,suv,other',
            'persons' => 'nullable|integer|min:1|max:500',
            'gate' => 'nullable|string|max:50',
            'remarks' => 'nullable|string|max:1000',
            'stay_minutes' => 'nullable|integer|min:5|max:4320',
            'request_approval' => 'nullable|boolean',
            'pass_code' => 'nullable|string|max:20',
            'photo' => 'nullable|image|max:5120',
            'video' => 'nullable|file|mimetypes:video/mp4,video/webm,video/quicktime,video/3gpp|max:51200',
        ];
    }

    /** Check CNIC / phone / vehicle against the blacklist & watchlist. */
    public static function watchlistMatch(?string $cnic, ?string $phone, ?string $vehicle): ?Watchlist
    {
        $norm = fn ($v) => $v ? preg_replace('/[^A-Z0-9]/', '', strtoupper($v)) : null;
        [$c, $p, $v] = [$norm($cnic), $norm($phone), $norm($vehicle)];
        if (! $c && ! $p && ! $v) {
            return null;
        }

        return Watchlist::where(fn ($q) => $q->whereNull('until')->orWhereDate('until', '>=', now()))->get()
            ->first(fn ($w) => ($c && $norm($w->cnic) === $c) || ($p && $norm($w->phone) === $p) || ($v && $norm($w->vehicle_no) === $v));
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate($this->rules());
        $pass = null;
        if (! empty($data['pass_code'])) {
            $pass = VisitorPass::where('code', strtoupper(trim($data['pass_code'])))->first();
            abort_unless($pass && $pass->status === 'active' && now()->between($pass->valid_from, $pass->valid_until), 422, 'This pass is not valid right now.');
            $data['house_id'] = $data['house_id'] ?? $pass->house_id;
        }

        $hit = self::watchlistMatch($data['cnic'] ?? null, $data['phone'] ?? null, $data['vehicle_no'] ?? null);
        if ($hit && $hit->level === 'blocked') {
            abort(422, 'BLOCKED: this person / vehicle is on the blacklist — '.$hit->reason);
        }

        $stay = (int) ($data['stay_minutes'] ?? $pass?->max_stay_minutes ?? Settings::get('visitor_max_stay_minutes'));
        $needsApproval = ! $pass && ! empty($data['house_id']) && ($data['request_approval'] ?? (bool) Settings::get('visitor_approval_required'))
            && ! in_array($data['category'], ['emergency', 'staff'], true);

        $data['photo_path'] = Uploads::store($request->file('photo'), 'visitors');
        $data['video_path'] = Uploads::store($request->file('video'), 'visitors');
        $vehicleId = ! empty($data['vehicle_no']) ? Vehicle::where('plate', strtoupper($data['vehicle_no']))->value('id') : null;
        if (! empty($data['vehicle_no'])) {
            $data['vehicle_no'] = strtoupper(trim($data['vehicle_no']));
        }
        unset($data['photo'], $data['video'], $data['stay_minutes'], $data['request_approval'], $data['pass_code']);

        $visitor = Visitor::create($data + [
            'status' => $needsApproval ? 'awaiting' : 'inside',
            'entry_at' => $needsApproval ? null : now(),
            'expected_exit_at' => $needsApproval ? null : now()->addMinutes($stay),
            'logged_by' => $request->user()->id,
            'persons' => $data['persons'] ?? 1,
            'pass_id' => $pass?->id,
            'vehicle_id' => $vehicleId,
            'watchlist_hit' => (bool) $hit,
            'token' => GateLog::token('GV', Visitor::class, 'token'),
            'access_type' => $data['category'] === 'emergency' ? 'emergency' : 'temporary',
        ]);
        $visitor->setAttribute('stay_minutes', $stay);
        if ($visitor->status === 'inside') {
            GateLog::visitorVehicleIn($visitor);
        }
        if ($pass) {
            $pass->update($pass->multi_use ? ['used_at' => now()] : ['status' => 'used', 'used_at' => now()]);
        }
        $visitor->load('house');
        $where = $visitor->house ? ' for '.$visitor->house->label : '';

        if ($hit) {
            Activity::alertModule('security', 2, '⚠ Watchlist match: '.$visitor->name, $hit->reason, 'danger', '/security', $visitor->house_id);
            Activity::alertAdmins('security', 'Watchlist match at gate', $visitor->name.$where.' — '.$hit->reason, 'warning', '/security', $visitor->house_id);
        }
        if ($needsApproval) {
            Activity::log('security', 'arrival', ucfirst($visitor->category)." {$visitor->name} at gate{$where} — waiting for approval", $visitor);
            Activity::alertModule('security', 2, 'Waiting for approval: '.$visitor->name, ($visitor->house?->label ? 'House '.$visitor->house->label.' · ' : '').$visitor->purpose, 'info', '/security?tab=approvals', $visitor->house_id);
            Activity::alertHouse($visitor->house_id, 'security', '🔔 Visitor at gate: '.$visitor->name,
                ucfirst($visitor->category).' · '.$visitor->purpose.'. Open Security to approve or reject.', 'warning', '/security?tab=approvals');
        } else {
            Activity::log('security', 'entry', ucfirst($visitor->category)." {$visitor->name} entered{$where}".($pass ? ' with QR pass '.$pass->code : '')." — {$visitor->purpose}", $visitor);
            Activity::alertHouse($visitor->house_id, 'security', 'Visitor entered: '.$visitor->name, ucfirst($visitor->category).' · '.$visitor->purpose, 'info', '/security');
        }

        return $visitor;
    }

    /** Household (or security / admin) approves or rejects a visitor waiting at the gate. */
    public function respond(Request $request, Visitor $visitor)
    {
        $u = $request->user();
        abort_unless(($u->isResident() && $u->house_id && $u->house_id === $visitor->house_id) || $u->canManage('security'), 403);
        abort_if($visitor->status !== 'awaiting', 422, 'This visitor is no longer waiting.');
        $data = $request->validate(['decision' => 'required|in:approve,reject', 'stay_minutes' => 'nullable|integer|min:5|max:4320', 'note' => 'nullable|string|max:255']);
        $stay = (int) ($data['stay_minutes'] ?? Settings::get('visitor_max_stay_minutes'));
        $ok = $data['decision'] === 'approve';
        $visitor->update([
            'status' => $ok ? 'inside' : 'rejected',
            'entry_at' => $ok ? now() : null,
            'expected_exit_at' => $ok ? now()->addMinutes($stay) : null,
            'responded_by' => $u->id, 'responded_at' => now(), 'response_note' => $data['note'] ?? null,
            'overstay_alerted_at' => null,
        ]);
        if ($ok) {
            GateLog::visitorVehicleIn($visitor);
        }
        $who = $u->isResident() ? 'household' : $u->name;
        Activity::log('security', $ok ? 'approved' : 'rejected', "{$visitor->name} ".($ok ? 'approved' : 'rejected')." by {$who}".($ok ? ' for '.intdiv($stay, 60).'h '.($stay % 60).'m' : ''), $visitor);
        Activity::alertModule('security', 2, ($ok ? '✅ Allow entry: ' : '⛔ Do not allow: ').$visitor->name,
            ($visitor->house?->label ?? '').(! empty($data['note']) ? ' · '.$data['note'] : ''), $ok ? 'success' : 'danger', '/security', $visitor->house_id);

        return $visitor->load('house', 'responder');
    }

    public function update(Request $request, Visitor $visitor)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate($this->rules());
        if ($request->hasFile('photo')) {
            $data['photo_path'] = Uploads::store($request->file('photo'), 'visitors');
        }
        if ($request->hasFile('video')) {
            $data['video_path'] = Uploads::store($request->file('video'), 'visitors');
        }
        if (! empty($data['stay_minutes']) && $visitor->entry_at) {
            $data['expected_exit_at'] = $visitor->entry_at->copy()->addMinutes((int) $data['stay_minutes']);
            $data['overstay_alerted_at'] = null;
        }
        unset($data['photo'], $data['video'], $data['stay_minutes'], $data['request_approval'], $data['pass_code']);
        $visitor->update($data);
        Activity::log('security', 'update', "Updated visitor record of {$visitor->name}", $visitor);

        return $visitor->load('house');
    }

    /** Guard confirms the actual departure. */
    public function checkout(Request $request, Visitor $visitor)
    {
        $this->authorizeManage($request, 'security');
        abort_if($visitor->status !== 'inside', 422, 'Visitor is not inside.');
        $visitor->update(['exit_at' => now(), 'status' => 'exited', 'exit_by' => $request->user()->id, 'exit_gate' => $request->input('gate') ?: $visitor->gate]);
        GateLog::visitorVehicleOut($visitor);
        $mins = (int) $visitor->entry_at->diffInMinutes($visitor->exit_at);
        $over = $visitor->expected_exit_at && $visitor->exit_at->greaterThan($visitor->expected_exit_at) ? ' (overstayed '.(int) $visitor->expected_exit_at->diffInMinutes($visitor->exit_at).'m)' : '';
        Activity::log('security', 'exit', "{$visitor->name} exited after ".intdiv($mins, 60).'h '.($mins % 60).'m'.$over.($request->boolean('scanned') ? ' (QR slip scanned)' : ''), $visitor);
        Activity::alertHouse($visitor->house_id, 'security', 'Visitor left: '.$visitor->name, 'Stayed '.intdiv($mins, 60).'h '.($mins % 60).'m'.$over, 'info', '/security?tab=log');

        return $visitor->load('house');
    }

    /** One visitor — used for the printable gate slip. */
    public function show(Request $request, Visitor $visitor)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        abort_if($u->isResident() && $visitor->house_id !== $u->house_id, 403);
        if (! $visitor->token) {
            $visitor->update(['token' => GateLog::token('GV', Visitor::class, 'token')]);
        }

        return $visitor->load('house', 'logger:id,name', 'responder:id,name', 'exiter:id,name')->toArray() + ['receipt_footer' => Settings::get('gate_receipt_footer'), 'community' => Settings::get('community_name')];
    }

    /** Temporary access: give more time (household for own visitor, or security). */
    public function extend(Request $request, Visitor $visitor)
    {
        $u = $request->user();
        abort_unless(($u->isResident() && $u->house_id && $u->house_id === $visitor->house_id) || $u->canManage('security'), 403);
        abort_if($visitor->status !== 'inside', 422, 'Visitor is not inside.');
        $m = (int) $request->validate(['minutes' => 'required|integer|min:5|max:4320'])['minutes'];
        $base = $visitor->expected_exit_at && $visitor->expected_exit_at->isFuture() ? $visitor->expected_exit_at : now();
        $visitor->update(['expected_exit_at' => $base->copy()->addMinutes($m), 'overstay_alerted_at' => null]);
        Activity::log('security', 'extend', "Access of {$visitor->name} extended by {$m} min (until ".$visitor->expected_exit_at->format('h:i A').')', $visitor);
        Activity::alertModule('security', 2, 'Access extended: '.$visitor->name, 'Now allowed until '.$visitor->expected_exit_at->format('h:i A'), 'info', '/security?tab=temporary', $visitor->house_id);

        return $visitor->load('house');
    }

    /** Temporary access: end it now — guards are told to escort the visitor out. */
    public function revoke(Request $request, Visitor $visitor)
    {
        $u = $request->user();
        abort_unless(($u->isResident() && $u->house_id && $u->house_id === $visitor->house_id) || $u->canManage('security'), 403);
        abort_if($visitor->status !== 'inside', 422, 'Visitor is not inside.');
        $visitor->update(['expected_exit_at' => now(), 'revoked_by' => $u->id, 'overstay_alerted_at' => now()]);
        $why = trim((string) $request->input('reason'));
        Activity::log('security', 'revoke', "Access of {$visitor->name} revoked".($why ? " — {$why}" : ''), $visitor);
        Activity::alertModule('security', 2, '⛔ Access revoked: '.$visitor->name, ($visitor->house?->label ? 'Plot '.$visitor->house->label.' · ' : '').'Please make sure the visitor leaves.'.($why ? ' '.$why : ''), 'danger', '/security?tab=temporary', $visitor->house_id);

        return $visitor->load('house');
    }

    /** Admit a waiting visitor directly from the gate (e.g. household confirmed by phone). */
    public function admit(Request $request, Visitor $visitor)
    {
        $request->merge(['decision' => 'approve']);

        return $this->respond($request, $visitor);
    }

    public function destroy(Request $request, Visitor $visitor)
    {
        abort_unless($request->user()->canApprove('security'), 403, 'You need Manage access on Security to delete visitor records.');
        Activity::log('security', 'delete', "Deleted visitor record of {$visitor->name}");
        $visitor->delete();

        return response()->noContent();
    }

    public function stats(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $base = fn () => $u->isResident() ? Visitor::where('house_id', $u->house_id ?? 0) : Visitor::query();
        $today = now()->toDateString();

        return [
            'inside' => $base()->where('status', 'inside')->count(),
            'awaiting' => $base()->where('status', 'awaiting')->count(),
            'overstay' => $base()->where('status', 'inside')->where('expected_exit_at', '<', now())->count(),
            'today' => $base()->whereDate('created_at', $today)->count(),
            'by_category' => $base()->whereDate('created_at', '>=', now()->subDays(30))->selectRaw('category, count(*) c')->groupBy('category')->pluck('c', 'category'),
            'avg_stay_minutes' => (int) round($base()->whereNotNull('exit_at')->where('entry_at', '>=', now()->subDays(30))->get()->avg(fn ($v) => $v->entry_at->diffInMinutes($v->exit_at)) ?? 0),
            'hourly' => collect(range(0, 23))->map(fn ($h) => 0)->replace(
                $base()->whereDate('entry_at', $today)->get(['entry_at'])->groupBy(fn ($v) => (int) $v->entry_at->format('G'))->map->count()->all()
            )->values(),
        ];
    }
}
