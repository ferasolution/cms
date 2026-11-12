<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Camera;
use App\Models\DomesticStaff;
use App\Models\Employee;
use App\Models\GuardShift;
use App\Models\PatrolCheckpoint;
use App\Models\PatrolRound;
use App\Models\PatrolScan;
use App\Models\SosAlert;
use App\Models\StaffEntry;
use App\Models\VehicleLog;
use App\Models\Visitor;
use App\Services\GateLog;
use App\Support\Activity;
use App\Support\Settings;
use App\Support\Uploads;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * Security operations: vehicle register, domestic staff, emergency priority entry, CCTV,
 * guard patrol checkpoints and guard shifts with handover.
 */
class SecurityOpsController extends Controller
{
    private function staffOnly(Request $request): void
    {
        $this->authorizeManage($request, 'security');
    }

    private function supervisor(Request $request): void
    {
        abort_unless($request->user()->canApprove('security'), 403, 'Only the security supervisor (Manage access) can do this.');
    }

    public static function gates(): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) Settings::get('gate_names')))));
    }

    /** Live numbers for the Security header. */
    public function overview(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $res = $u->isResident();
        $hid = $u->house_id ?? 0;
        $cps = PatrolCheckpoint::where('active', true)->with('lastScan')->get();
        $interval = (int) Settings::get('patrol_interval_minutes') ?: 120;
        $covered = $cps->filter(fn ($c) => $c->lastScan && $c->lastScan->scanned_at->gt(now()->subMinutes($interval)))->count();

        return [
            'gates' => self::gates(),
            'vehicles_inside' => VehicleLog::where('status', 'inside')->when($res, fn ($q) => $q->where('house_id', $hid))->count(),
            'staff_inside' => StaffEntry::whereNull('exit_at')->when($res, fn ($q) => $q->where('house_id', $hid))->count(),
            'temporary' => Visitor::where('status', 'inside')->whereNotNull('expected_exit_at')->when($res, fn ($q) => $q->where('house_id', $hid))->count(),
            'emergency_inside' => Visitor::where('status', 'inside')->where('access_type', 'emergency')->count(),
            'staff_pending' => DomesticStaff::where('verification', 'pending')->when($res, fn ($q) => $q->where('house_id', $hid))->count(),
            'on_duty' => $res ? null : GuardShift::where('status', 'on_duty')->count(),
            'patrol_coverage' => $res || ! $cps->count() ? null : round($covered / $cps->count() * 100),
            'cameras' => $res ? null : Camera::where('active', true)->count(),
        ];
    }

    // ===================== Vehicle register =====================

    public function vehicleLogs(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $q = VehicleLog::with(['house', 'visitor:id,name,token', 'logger:id,name'])->latest('entry_at');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }
        if ($k = $request->query('kind')) {
            $q->where('kind', $k);
        }

        return $this->paginate($q, $request, ['plate', 'driver'], 30);
    }

    /** Guard records a plate at the gate: enters if outside, exits if it is already inside. */
    public function vehicleMove(Request $request)
    {
        $this->staffOnly($request);
        $d = $request->validate(['plate' => 'required|string|max:30', 'vehicle_type' => 'nullable|string|max:20', 'kind' => 'nullable|in:resident,visitor,staff,emergency,service',
            'house_id' => 'nullable|exists:houses,id', 'driver' => 'nullable|string|max:120', 'gate' => 'nullable|string|max:50', 'direction' => 'nullable|in:in,out']);
        $norm = GateLog::plate($d['plate']);
        $open = VehicleLog::where('status', 'inside')->get()->first(fn ($l) => GateLog::plate($l->plate) === $norm);
        $dir = $d['direction'] ?? ($open ? 'out' : 'in');
        if ($dir === 'out') {
            abort_unless($open, 422, 'This vehicle is not recorded inside.');
            $open->update(['status' => 'exited', 'exit_at' => now()]);
            Activity::log('security', 'vehicle_out', "Vehicle {$open->plate} left".(! empty($d['gate']) ? ' via '.$d['gate'] : ''), $open);

            return ['action' => 'exit', 'log' => $open->load('house')];
        }
        abort_if($open, 422, 'This vehicle is already inside since '.$open?->entry_at?->format('h:i A').'.');
        $hit = VisitorController::watchlistMatch(null, null, $d['plate']);
        if ($hit && $hit->level === 'blocked') {
            abort(422, 'BLOCKED vehicle — '.$hit->reason);
        }
        unset($d['direction']);
        $log = GateLog::enter($d + ['watchlist_hit' => (bool) $hit]);
        Activity::log('security', 'vehicle_in', ucfirst($log->kind)." vehicle {$log->plate} entered".($log->house ? ' → '.$log->house->label : ''), $log);
        if ($hit) {
            Activity::alertModule('security', 3, '⚠ Watchlist vehicle entered: '.$log->plate, $hit->reason, 'danger', '/security?tab=vehicles', $log->house_id);
        }

        return ['action' => 'entry', 'log' => $log->load('house')];
    }

    // ===================== Domestic staff =====================

    /** Is this staff member allowed in right now? Returns [ok, reason]. */
    public static function staffCheck(DomesticStaff $s): array
    {
        if (! $s->active) {
            return [false, 'Staff card is deactivated'];
        }
        if ($s->verification === 'rejected') {
            return [false, 'Verification REJECTED'.($s->verification_note ? ' — '.$s->verification_note : '')];
        }
        if ($s->valid_until && $s->valid_until->endOfDay()->isPast()) {
            return [false, 'Card expired on '.$s->valid_until->format('d M Y')];
        }
        if ($s->verification === 'pending') {
            return [true, 'Not yet verified by security — allow only with household confirmation'];
        }
        $off = self::offSchedule($s);

        return [true, $off ?: 'Verified · on schedule'];
    }

    public static function offSchedule(DomesticStaff $s): ?string
    {
        if ($s->work_days) {
            $days = array_map(fn ($d) => substr(ucfirst(strtolower(trim($d))), 0, 3), explode(',', $s->work_days));
            if (! in_array(now()->format('D'), $days, true)) {
                return 'Not a working day ('.$s->work_days.')';
            }
        }
        if ($s->time_from && $s->time_to) {
            $t = now()->format('H:i');
            [$a, $b] = [substr($s->time_from, 0, 5), substr($s->time_to, 0, 5)];
            $in = $a <= $b ? ($t >= Carbon::parse($a)->subMinutes(30)->format('H:i') && $t <= $b) : ($t >= $a || $t <= $b);
            if (! $in) {
                return "Outside working hours ({$a}–{$b})";
            }
        }

        return null;
    }

    public function staff(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $q = DomesticStaff::with(['house', 'inside', 'verifier:id,name'])->orderByRaw("case verification when 'pending' then 0 else 1 end")->orderBy('name');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        }
        foreach (['verification', 'type', 'house_id'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }
        if ($request->query('inside')) {
            $q->whereHas('inside');
        }

        return $this->paginate($q, $request, ['name', 'cnic', 'phone', 'code'], 30);
    }

    private function staffRules(): array
    {
        return ['name' => 'required|string|max:120', 'type' => 'required|in:maid,driver,gardener,cook,nanny,guard,cleaner,tutor,other', 'cnic' => 'required|string|max:20',
            'phone' => 'nullable|string|max:30', 'address' => 'nullable|string|max:255', 'house_id' => 'nullable|exists:houses,id', 'work_days' => 'nullable|string|max:60',
            'time_from' => 'nullable|date_format:H:i', 'time_to' => 'nullable|date_format:H:i', 'valid_until' => 'nullable|date', 'active' => 'boolean',
            'photo' => 'nullable|image|max:5120', 'cnic_photo' => 'nullable|image|max:5120', 'police_doc' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:8192'];
    }

    private function staffFiles(Request $request, array &$d): void
    {
        foreach (['photo' => 'photo_path', 'cnic_photo' => 'cnic_photo_path', 'police_doc' => 'police_doc_path'] as $in => $col) {
            if ($request->hasFile($in)) {
                $d[$col] = Uploads::store($request->file($in), 'staff');
            }
            unset($d[$in]);
        }
    }

    public function storeStaff(Request $request)
    {
        $u = $request->user();
        abort_unless($u->canManage('security') || ($u->isResident() && $u->house_id), 403);
        $d = $request->validate($this->staffRules());
        if ($u->isResident()) {
            $d['house_id'] = $u->house_id;
        }
        $hit = VisitorController::watchlistMatch($d['cnic'], $d['phone'] ?? null, null);
        if ($hit && $hit->level === 'blocked') {
            abort(422, 'This '.\App\Support\Settings::idLabel().' / phone is blacklisted by security — '.$hit->reason);
        }
        $this->staffFiles($request, $d);
        $s = DomesticStaff::create($d + ['code' => GateLog::token('DS', DomesticStaff::class, 'code'), 'created_by' => $u->id, 'verification' => 'pending']);
        $s->load('house');
        Activity::log('security', 'staff', "Registered {$s->type} {$s->name}".($s->house ? ' for '.$s->house->label : '').' — verification pending', $s);
        Activity::alertModule('security', 3, 'Verify domestic staff: '.$s->name, ucfirst($s->type).($s->house ? ' · '.\App\Support\Settings::unit().' '.$s->house->label : '').' · '.\App\Support\Settings::idLabel().' '.$s->cnic, $hit ? 'warning' : 'info', '/security?tab=staff', $s->house_id);

        return $s;
    }

    public function updateStaff(Request $request, DomesticStaff $staff)
    {
        $u = $request->user();
        abort_unless($u->canManage('security') || ($u->isResident() && $u->house_id === $staff->house_id), 403);
        $d = $request->validate($this->staffRules());
        if ($u->isResident()) {
            $d['house_id'] = $u->house_id;
            if ($d['cnic'] !== $staff->cnic || $d['name'] !== $staff->name) {
                $d['verification'] = 'pending';   // identity changed → verify again
            }
        }
        $this->staffFiles($request, $d);
        $staff->update($d);
        Activity::log('security', 'staff', "Updated staff record of {$staff->name}", $staff);

        return $staff->load('house', 'inside');
    }

    public function verifyStaff(Request $request, DomesticStaff $staff)
    {
        $this->supervisor($request);
        $d = $request->validate(['verification' => 'required|in:verified,rejected,pending', 'note' => 'nullable|string|max:255']);
        $staff->update(['verification' => $d['verification'], 'verification_note' => $d['note'] ?? null, 'verified_by' => $request->user()->id, 'verified_at' => now()]);
        Activity::log('security', 'staff_verify', "{$staff->name} → {$d['verification']}", $staff);
        Activity::alertHouse($staff->house_id, 'security', ($d['verification'] === 'verified' ? '✅ Staff verified: ' : '⛔ Staff not verified: ').$staff->name, $d['note'] ?? 'Security has reviewed the documents.', $d['verification'] === 'verified' ? 'success' : 'warning', '/security?tab=staff');

        return $staff->load('house', 'inside', 'verifier:id,name');
    }

    public function destroyStaff(Request $request, DomesticStaff $staff)
    {
        $u = $request->user();
        abort_unless($u->canApprove('security') || ($u->isResident() && $u->house_id === $staff->house_id), 403);
        Activity::log('security', 'staff', "Removed staff {$staff->name}");
        $staff->delete();

        return response()->noContent();
    }

    /** Gate: staff member comes in or goes out (toggles). */
    public function staffMove(Request $request, DomesticStaff $staff)
    {
        $this->staffOnly($request);
        $open = $staff->entries()->whereNull('exit_at')->latest('entry_at')->first();
        $gate = $request->input('gate');
        if ($open) {
            $open->update(['exit_at' => now()]);
            Activity::log('security', 'staff_out', "{$staff->name} ({$staff->type}) left after ".$open->entry_at->diffForHumans(now(), true), $open);

            return ['action' => 'exit', 'entry' => $open, 'staff' => $staff->load('house', 'inside')];
        }
        [$ok, $reason] = self::staffCheck($staff);
        abort_unless($ok || $request->boolean('force'), 422, 'Not allowed: '.$reason);
        $off = self::offSchedule($staff);
        $e = StaffEntry::create(['domestic_staff_id' => $staff->id, 'house_id' => $staff->house_id, 'entry_at' => now(), 'gate' => $gate, 'off_schedule' => (bool) $off || $staff->verification !== 'verified', 'logged_by' => $request->user()->id]);
        Activity::log('security', 'staff_in', "{$staff->name} ({$staff->type}) entered".($staff->house ? ' → '.$staff->house->label : '').($off ? " — {$off}" : ''), $e);
        if (Settings::get('staff_notify_household')) {
            Activity::alertHouse($staff->house_id, 'security', ucfirst($staff->type).' arrived: '.$staff->name, $off ? '⚠ '.$off : 'Entered at '.now()->format('h:i A'), $off ? 'warning' : 'info', '/security?tab=staff');
        }
        if ($off || $staff->verification !== 'verified') {
            Activity::alertModule('security', 3, 'Staff entry needs attention: '.$staff->name, ($off ?: 'Not verified').($staff->house ? ' · '.\App\Support\Settings::unit().' '.$staff->house->label : ''), 'warning', '/security?tab=staff', $staff->house_id);
        }

        return ['action' => 'entry', 'entry' => $e, 'staff' => $staff->load('house', 'inside')];
    }

    public function staffEntries(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $q = StaffEntry::with(['staff:id,name,type,code,photo_path', 'house', 'logger:id,name'])->latest('entry_at');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        }
        if ($id = $request->query('staff_id')) {
            $q->where('domestic_staff_id', $id);
        }

        return $this->paginate($q, $request, [], 30);
    }

    // ===================== Emergency priority access =====================

    public function emergencyEntry(Request $request)
    {
        $this->staffOnly($request);
        $d = $request->validate(['service' => 'required|in:ambulance,fire,police,rescue,utility,other', 'house_id' => 'nullable|exists:houses,id', 'location' => 'nullable|string|max:150',
            'vehicle_no' => 'nullable|string|max:30', 'crew' => 'nullable|integer|min:1|max:100', 'contact' => 'nullable|string|max:120', 'notes' => 'nullable|string|max:500', 'gate' => 'nullable|string|max:50']);
        $labels = ['ambulance' => '🚑 Ambulance', 'fire' => '🚒 Fire brigade', 'police' => '🚓 Police', 'rescue' => '🛟 Rescue', 'utility' => '⚡ Utility emergency', 'other' => '⚠ Emergency service'];
        $v = Visitor::create([
            'house_id' => $d['house_id'] ?? null, 'name' => $labels[$d['service']].(! empty($d['contact']) ? ' — '.$d['contact'] : ''), 'category' => 'emergency', 'access_type' => 'emergency',
            'emergency_service' => $d['service'], 'purpose' => $d['notes'] ?? ('Emergency '.$d['service'].(! empty($d['location']) ? ' at '.$d['location'] : '')), 'vehicle_no' => isset($d['vehicle_no']) ? strtoupper($d['vehicle_no']) : null,
            'vehicle_type' => in_array($d['service'], ['ambulance', 'fire'], true) ? 'truck' : 'car', 'persons' => $d['crew'] ?? 1, 'gate' => $d['gate'] ?? (self::gates()[0] ?? 'Main Gate'),
            'remarks' => $d['location'] ?? null, 'status' => 'inside', 'entry_at' => now(), 'expected_exit_at' => now()->addHours(3), 'logged_by' => $request->user()->id,
            'token' => GateLog::token('GV', Visitor::class, 'token'),
        ]);
        GateLog::visitorVehicleIn($v);
        $v->load('house');
        $where = $v->house ? ''.\App\Support\Settings::unit().' '.$v->house->label.($v->house->street ? ', '.$v->house->street : '') : ($d['location'] ?? 'inside the community');
        $sos = $v->house_id ? SosAlert::where('house_id', $v->house_id)->whereIn('status', ['active', 'responding'])->latest('id')->first() : null;
        Activity::log('security', 'emergency_entry', "PRIORITY ENTRY: {$labels[$d['service']]} → {$where}".($sos ? " (SOS #{$sos->id})" : ''), $v);
        Activity::alertModule('security', 2, '🚨 PRIORITY ENTRY: '.$labels[$d['service']], 'Clear the way → '.$where.'. Open the map for the route.', 'danger', $v->house_id ? '/map?house='.$v->house_id.'&route=1' : '/security?tab=emergency', $v->house_id);
        Activity::alertAdmins('security', 'Emergency service entered: '.$labels[$d['service']], $where, 'danger', $v->house_id ? '/map?house='.$v->house_id.'&route=1' : '/security?tab=emergency', $v->house_id);
        Activity::alertHouse($v->house_id, 'security', $labels[$d['service']].' has entered the gate', 'Security is guiding them to your house.', 'warning', '/emergency');
        if ($sos && $sos->status === 'active') {
            $sos->update(['status' => 'responding', 'responded_by' => $request->user()->id, 'responded_at' => now()]);
            Activity::log('emergency', 'responding', "SOS #{$sos->id}: {$d['service']} entered the gate", $sos);
        }

        return $v;
    }

    // ===================== CCTV =====================

    public function cameras(Request $request)
    {
        $this->staffOnly($request);

        return Camera::orderBy('sort')->orderBy('id')->get()->map(fn ($c) => $this->camOut($c, $request->user()->canApprove('security')));
    }

    private function camOut(Camera $c, bool $full): array
    {
        $a = $c->toArray();
        if (! $full) {
            unset($a['playback_url']);
        }

        return $a;
    }

    private function camRules(): array
    {
        return ['name' => 'required|string|max:120', 'location' => 'nullable|string|max:150', 'gate' => 'nullable|string|max:50', 'stream_type' => 'required|in:hls,mjpeg,snapshot,embed,demo',
            'stream_url' => 'nullable|string|max:2000', 'playback_url' => 'nullable|string|max:2000', 'refresh_seconds' => 'nullable|integer|min:1|max:60',
            'map_x' => 'nullable|numeric', 'map_y' => 'nullable|numeric', 'active' => 'boolean', 'sort' => 'nullable|integer'];
    }

    public function storeCamera(Request $request)
    {
        $this->supervisor($request);
        $c = Camera::create($request->validate($this->camRules()));
        Activity::log('security', 'camera', "Added camera {$c->name}", $c);

        return $c;
    }

    public function updateCamera(Request $request, Camera $camera)
    {
        $this->supervisor($request);
        $camera->update($request->validate($this->camRules()));
        Activity::log('security', 'camera', "Updated camera {$camera->name}", $camera);

        return $camera;
    }

    public function destroyCamera(Request $request, Camera $camera)
    {
        $this->supervisor($request);
        Activity::log('security', 'camera', "Removed camera {$camera->name}");
        $camera->delete();

        return response()->noContent();
    }

    /** Footage links around a moment (e.g. a visitor's entry or an incident) from the cameras at that gate. */
    public function footage(Request $request)
    {
        $this->staffOnly($request);
        $d = $request->validate(['at' => 'required|date', 'gate' => 'nullable|string|max:50', 'before' => 'nullable|integer|min:0|max:120', 'after' => 'nullable|integer|min:0|max:240']);
        $at = Carbon::parse($d['at']);
        $s = $at->copy()->subMinutes($d['before'] ?? 2);
        $e = $at->copy()->addMinutes($d['after'] ?? 5);
        $cams = Camera::where('active', true)->when($d['gate'] ?? null, fn ($q, $g) => $q->where(fn ($w) => $w->where('gate', $g)->orWhereNull('gate')))->orderByRaw('case when gate is null then 1 else 0 end')->orderBy('sort')->get();
        $fill = fn (?string $t) => $t ? strtr($t, [
            '{start}' => $s->toIso8601String(), '{end}' => $e->toIso8601String(), '{start_hik}' => $s->utc()->format('Ymd\THis\Z'), '{end_hik}' => $e->utc()->format('Ymd\THis\Z'),
            '{start_unix}' => $s->timestamp, '{end_unix}' => $e->timestamp, '{date}' => $at->toDateString(), '{time}' => $at->format('H:i:s'),
        ]) : null;

        return ['from' => $s, 'to' => $e, 'cameras' => $cams->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'gate' => $c->gate, 'location' => $c->location, 'stream_type' => $c->stream_type, 'stream_url' => $c->stream_url, 'playback' => $fill($c->playback_url)])];
    }

    // ===================== Patrol =====================

    public function patrol(Request $request)
    {
        $this->staffOnly($request);
        $u = $request->user();
        $interval = (int) Settings::get('patrol_interval_minutes') ?: 120;
        $cps = PatrolCheckpoint::with('lastScan.user:id,name')->orderBy('sort')->orderBy('id')->get()->map(function ($c) use ($interval) {
            $last = $c->lastScan?->scanned_at;
            $c->setAttribute('overdue', $c->active && (! $last || $last->lt(now()->subMinutes($interval))));
            $c->setAttribute('scans_today', $c->scans()->whereDate('scanned_at', today())->count());

            return $c;
        });

        return [
            'interval' => $interval,
            'checkpoints' => $cps,
            'my_round' => PatrolRound::with('scans.checkpoint:id,name')->where('user_id', $u->id)->where('status', 'in_progress')->latest('id')->first(),
            'rounds' => PatrolRound::with('user:id,name')->latest('id')->limit(25)->get(),
            'recent' => PatrolScan::with(['checkpoint:id,name', 'user:id,name'])->latest('scanned_at')->limit(30)->get(),
            'today' => ['scans' => PatrolScan::whereDate('scanned_at', today())->count(), 'rounds' => PatrolRound::whereDate('started_at', today())->count(),
                'issues' => PatrolScan::whereDate('scanned_at', today())->where('status', 'issue')->count()],
            'can_edit' => $u->canApprove('security'),
        ];
    }

    public function storeCheckpoint(Request $request)
    {
        $this->supervisor($request);
        $d = $request->validate(['name' => 'required|string|max:120', 'location' => 'nullable|string|max:150', 'map_x' => 'nullable|numeric', 'map_y' => 'nullable|numeric', 'sort' => 'nullable|integer', 'active' => 'boolean']);
        $c = PatrolCheckpoint::create($d + ['code' => GateLog::token('CP', PatrolCheckpoint::class, 'code')]);
        Activity::log('security', 'checkpoint', "Added patrol checkpoint {$c->name}", $c);

        return $c;
    }

    public function updateCheckpoint(Request $request, PatrolCheckpoint $checkpoint)
    {
        $this->supervisor($request);
        $checkpoint->update($request->validate(['name' => 'required|string|max:120', 'location' => 'nullable|string|max:150', 'map_x' => 'nullable|numeric', 'map_y' => 'nullable|numeric', 'sort' => 'nullable|integer', 'active' => 'boolean']));

        return $checkpoint;
    }

    public function destroyCheckpoint(Request $request, PatrolCheckpoint $checkpoint)
    {
        $this->supervisor($request);
        Activity::log('security', 'checkpoint', "Removed checkpoint {$checkpoint->name}");
        $checkpoint->delete();

        return response()->noContent();
    }

    public function startRound(Request $request)
    {
        $this->staffOnly($request);
        $u = $request->user();
        PatrolRound::where('user_id', $u->id)->where('status', 'in_progress')->get()->each(fn ($r) => $this->closeRound($r));
        $shift = GuardShift::where('user_id', $u->id)->where('status', 'on_duty')->value('id');
        $r = PatrolRound::create(['user_id' => $u->id, 'shift_id' => $shift, 'started_at' => now(), 'expected' => PatrolCheckpoint::where('active', true)->count()]);
        Activity::log('security', 'patrol', "{$u->name} started a patrol round", $r);

        return $r->load('scans');
    }

    private function closeRound(PatrolRound $r): PatrolRound
    {
        $n = $r->scans()->distinct('patrol_checkpoint_id')->count('patrol_checkpoint_id');
        $r->update(['ended_at' => now(), 'scanned' => $n, 'status' => $n >= $r->expected ? 'completed' : 'incomplete']);

        return $r;
    }

    public function endRound(Request $request, PatrolRound $round)
    {
        $this->staffOnly($request);
        abort_unless($round->user_id === $request->user()->id || $request->user()->canApprove('security'), 403);
        abort_if($round->status !== 'in_progress', 422, 'Round already closed.');
        $round->update(['notes' => $request->input('notes')]);
        $this->closeRound($round);
        Activity::log('security', 'patrol', "Patrol round finished — {$round->scanned}/{$round->expected} checkpoints", $round);
        if ($round->status === 'incomplete') {
            $missed = PatrolCheckpoint::where('active', true)->whereNotIn('id', $round->scans()->pluck('patrol_checkpoint_id'))->pluck('name')->implode(', ');
            Activity::alertModule('security', 3, 'Incomplete patrol round', $request->user()->name." missed: {$missed}", 'warning', '/security?tab=patrol');
        }

        return $round->load('scans.checkpoint:id,name');
    }

    /** Guard scans the QR fixed at a checkpoint. */
    public function scanCheckpoint(Request $request)
    {
        $this->staffOnly($request);
        $u = $request->user();
        $d = $request->validate(['code' => 'required|string|max:60', 'status' => 'nullable|in:ok,issue', 'note' => 'nullable|string|max:255', 'lat' => 'nullable|numeric', 'lng' => 'nullable|numeric', 'photo' => 'nullable|image|max:8192']);
        preg_match('/(CP-[A-Z0-9]{6})/', strtoupper($d['code']), $m);
        $cp = PatrolCheckpoint::where('code', $m[1] ?? '')->first();
        abort_unless($cp, 404, 'Not a patrol checkpoint code.');
        abort_unless($cp->active, 422, 'This checkpoint is switched off.');
        $round = PatrolRound::where('user_id', $u->id)->where('status', 'in_progress')->latest('id')->first();
        $dup = $round && $round->scans()->where('patrol_checkpoint_id', $cp->id)->exists();
        $scan = PatrolScan::create(['patrol_round_id' => $round?->id, 'patrol_checkpoint_id' => $cp->id, 'user_id' => $u->id, 'scanned_at' => now(), 'status' => $d['status'] ?? 'ok',
            'note' => $d['note'] ?? null, 'lat' => $d['lat'] ?? null, 'lng' => $d['lng'] ?? null, 'photo_path' => Uploads::store($request->file('photo'), 'patrol')]);
        if ($round && ! $dup) {
            $round->increment('scanned');
        }
        Activity::log('security', 'patrol_scan', "{$u->name} checked {$cp->name}".($scan->status === 'issue' ? ' — ISSUE: '.$scan->note : ''), $scan);
        if ($scan->status === 'issue') {
            Activity::alertModule('security', 3, '⚠ Patrol issue at '.$cp->name, ($scan->note ?: 'Reported by guard').' — '.$u->name, 'warning', '/security?tab=patrol');
        }

        return ['scan' => $scan->load('checkpoint'), 'round' => $round?->fresh('scans.checkpoint:id,name'), 'duplicate' => $dup];
    }

    // ===================== Guard shifts & handover =====================

    public static function slots(): array
    {
        $out = [];
        foreach (preg_split('/\r?\n/', (string) Settings::get('shift_slots')) as $line) {
            if (preg_match('/^\s*([\w ]+?)\s*=\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/', $line, $m)) {
                $out[strtolower(trim($m[1]))] = [$m[2], $m[3]];
            }
        }

        return $out ?: ['morning' => ['07:00', '15:00'], 'evening' => ['15:00', '23:00'], 'night' => ['23:00', '07:00']];
    }

    private static function window(string $date, string $from, string $to): array
    {
        $s = Carbon::parse("{$date} {$from}");
        $e = Carbon::parse("{$date} {$to}");
        if ($e->lte($s)) {
            $e->addDay();
        }

        return [$s, $e];
    }

    public function shifts(Request $request)
    {
        $this->staffOnly($request);
        $from = Carbon::parse($request->query('from', now()->startOfWeek()->toDateString()))->startOfDay();
        $to = $from->copy()->addDays(6);
        $u = $request->user();
        $guards = Employee::where('status', 'active')->where(fn ($q) => $q->where('department', 'Security')->orWhere('designation', 'like', '%guard%'))->orderBy('name')->get(['id', 'name', 'designation', 'phone', 'user_id']);

        return [
            'from' => $from->toDateString(), 'to' => $to->toDateString(),
            'slots' => self::slots(),
            'posts' => array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) Settings::get('shift_posts'))))),
            'guards' => $guards,
            'shifts' => GuardShift::with('handoverTo:id,guard_name,post,starts_at')->whereBetween('date', [$from->toDateString(), $to->toDateString()])->orderBy('starts_at')->get(),
            'on_duty' => GuardShift::where('status', 'on_duty')->orderBy('post')->get(),
            'my_shift' => GuardShift::where('user_id', $u->id)->whereIn('status', ['scheduled', 'on_duty'])->where('ends_at', '>', now()->subHours(2))->orderBy('starts_at')->first(),
            'pending_handover' => GuardShift::with('user:id,name')->whereNotNull('handover_to_shift_id')->whereNull('handover_ack_at')
                ->whereIn('handover_to_shift_id', GuardShift::where('user_id', $u->id)->pluck('id'))->latest('checked_out_at')->get(),
            'handovers' => GuardShift::whereNotNull('checked_out_at')->latest('checked_out_at')->limit(15)->get(['id', 'guard_name', 'post', 'checked_out_at', 'handover_notes', 'handover_items', 'handover_ack_at', 'handover_ack_note', 'handover_to_shift_id']),
            'can_edit' => $u->canApprove('security'),
        ];
    }

    private function makeShift(int|string|null $employeeId, ?string $name, string $post, string $date, string $slot, ?string $from, ?string $to, int $by): GuardShift
    {
        $emp = $employeeId ? Employee::find($employeeId) : null;
        [$a, $b] = $slot === 'custom' ? [$from, $to] : (self::slots()[$slot] ?? abort(422, 'Unknown shift slot.'));
        [$s, $e] = self::window($date, $a, $b);

        return GuardShift::create(['employee_id' => $emp?->id, 'user_id' => $emp?->user_id, 'guard_name' => $emp?->name ?? $name ?? 'Guard', 'post' => $post, 'date' => $date,
            'slot' => $slot, 'starts_at' => $s, 'ends_at' => $e, 'created_by' => $by]);
    }

    public function storeShift(Request $request)
    {
        $this->supervisor($request);
        $d = $request->validate(['employee_id' => 'nullable|exists:employees,id', 'guard_name' => 'required_without:employee_id|nullable|string|max:120', 'post' => 'required|string|max:60',
            'date' => 'required|date', 'slot' => 'required|string|max:20', 'from' => 'required_if:slot,custom|nullable|date_format:H:i', 'to' => 'required_if:slot,custom|nullable|date_format:H:i']);
        $sh = $this->makeShift($d['employee_id'] ?? null, $d['guard_name'] ?? null, $d['post'], Carbon::parse($d['date'])->toDateString(), $d['slot'], $d['from'] ?? null, $d['to'] ?? null, $request->user()->id);
        Activity::log('security', 'shift', "Scheduled {$sh->guard_name} — {$sh->post}, {$sh->slot} on ".$sh->date->format('D d M'), $sh);
        Activity::alertUser($sh->user_id, 'security', 'New duty: '.$sh->post, $sh->starts_at->format('D d M h:i A').' – '.$sh->ends_at->format('h:i A'), 'info', '/security?tab=shifts');

        return $sh;
    }

    /** Copy a duty pattern to several days (e.g. a whole week). */
    public function generateShifts(Request $request)
    {
        $this->supervisor($request);
        $d = $request->validate(['from' => 'required|date', 'days' => 'required|integer|min:1|max:31', 'rows' => 'required|array|min:1|max:40',
            'rows.*.employee_id' => 'required|exists:employees,id', 'rows.*.slot' => 'required|string', 'rows.*.post' => 'required|string|max:60']);
        $n = 0;
        for ($i = 0; $i < $d['days']; $i++) {
            $date = Carbon::parse($d['from'])->addDays($i)->toDateString();
            foreach ($d['rows'] as $r) {
                if (GuardShift::where('employee_id', $r['employee_id'])->whereDate('date', $date)->where('slot', $r['slot'])->exists()) {
                    continue;
                }
                $this->makeShift($r['employee_id'], null, $r['post'], $date, $r['slot'], null, null, $request->user()->id);
                $n++;
            }
        }
        Activity::log('security', 'shift', "Generated {$n} guard shifts from ".Carbon::parse($d['from'])->format('d M'));

        return ['created' => $n];
    }

    public function destroyShift(Request $request, GuardShift $shift)
    {
        $this->supervisor($request);
        abort_if($shift->status === 'on_duty', 422, 'Guard is on duty — check out first.');
        $shift->delete();

        return response()->noContent();
    }

    private function ownOrSupervisor(Request $request, GuardShift $shift): void
    {
        $u = $request->user();
        abort_unless($shift->user_id === $u->id || $u->canApprove('security'), 403, 'This is not your shift.');
    }

    public function checkIn(Request $request, GuardShift $shift)
    {
        $this->staffOnly($request);
        $this->ownOrSupervisor($request, $shift);
        abort_unless(in_array($shift->status, ['scheduled', 'missed'], true), 422, 'Shift is already '.$shift->status.'.');
        abort_if(now()->lt($shift->starts_at->copy()->subHour()), 422, 'Too early — shift starts at '.$shift->starts_at->format('h:i A').'.');
        $late = max(0, (int) $shift->starts_at->diffInMinutes(now(), false));
        $shift->update(['status' => 'on_duty', 'checked_in_at' => now()]);
        Activity::log('security', 'shift_in', "{$shift->guard_name} on duty at {$shift->post}".($late > (int) Settings::get('shift_late_minutes') ? " ({$late} min late)" : ''), $shift);

        return $shift;
    }

    public function checkOut(Request $request, GuardShift $shift)
    {
        $this->staffOnly($request);
        $this->ownOrSupervisor($request, $shift);
        abort_if($shift->status !== 'on_duty', 422, 'Guard is not on duty.');
        $d = $request->validate(['handover_notes' => 'required|string|max:3000', 'handover_items' => 'nullable|array', 'handover_items.*' => 'string|max:60']);
        $next = GuardShift::where('id', '!=', $shift->id)->where('post', $shift->post)->whereIn('status', ['scheduled', 'on_duty'])
            ->whereBetween('starts_at', [$shift->ends_at->copy()->subHours(3), $shift->ends_at->copy()->addHours(3)])->orderBy('starts_at')->first();
        $shift->update(['status' => 'completed', 'checked_out_at' => now(), 'handover_notes' => $d['handover_notes'], 'handover_items' => $d['handover_items'] ?? [], 'handover_to_shift_id' => $next?->id]);
        Activity::log('security', 'handover', "{$shift->guard_name} handed over {$shift->post}".($next ? " to {$next->guard_name}" : ''), $shift);
        if ($next) {
            Activity::alertUser($next->user_id, 'security', 'Handover from '.$shift->guard_name, mb_strimwidth($d['handover_notes'], 0, 140, '…'), 'info', '/security?tab=shifts');
        }
        if (! $next || ! $next->user_id) {
            Activity::alertModule('security', 3, 'Handover at '.$shift->post, $shift->guard_name.': '.mb_strimwidth($d['handover_notes'], 0, 140, '…'), 'info', '/security?tab=shifts');
        }

        return $shift;
    }

    /** Incoming guard confirms the handover of the previous shift. */
    public function ackHandover(Request $request, GuardShift $shift)
    {
        $this->staffOnly($request);
        $u = $request->user();
        $to = $shift->handoverTo;
        abort_unless(($to && $to->user_id === $u->id) || $u->canApprove('security'), 403);
        abort_if($shift->handover_ack_at, 422, 'Already acknowledged.');
        $shift->update(['handover_ack_at' => now(), 'handover_ack_note' => $request->input('note')]);
        Activity::log('security', 'handover_ack', "{$u->name} received handover of {$shift->post} from {$shift->guard_name}".($request->input('note') ? ' — '.$request->input('note') : ''), $shift);
        Activity::alertUser($shift->user_id, 'security', 'Handover received by '.$u->name, $request->input('note'), 'success', '/security?tab=shifts');

        return $shift;
    }
}
