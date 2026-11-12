<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\Incident;
use App\Models\Vehicle;
use App\Models\Visitor;
use App\Models\VisitorPass;
use App\Models\Watchlist;
use App\Services\Watchers;
use App\Support\Activity;
use App\Support\Settings;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Security extras: QR visitor passes, gate scanner, watchlist, vehicles and incident reports. */
class GateController extends Controller
{
    // ---------- QR visitor passes (pre-registration) ----------

    public function passes(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $q = VisitorPass::with(['house', 'creator:id,name'])->latest('id');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, ['visitor_name', 'code', 'phone', 'vehicle_no']);
    }

    public function storePass(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        abort_if(! $u->isResident() && ! $u->canManage('security'), 403);
        $data = $request->validate([
            'visitor_name' => 'required|string|max:120',
            'phone' => 'nullable|string|max:30',
            'cnic' => 'nullable|string|max:20',
            'category' => 'required|in:guest,visitor,relative,friend,worker,delivery,contractor,other',
            'purpose' => 'nullable|string|max:255',
            'vehicle_no' => 'nullable|string|max:30',
            'persons' => 'nullable|integer|min:1|max:200',
            'valid_from' => 'required|date',
            'valid_until' => 'required|date|after:valid_from',
            'max_stay_minutes' => 'nullable|integer|min:15|max:4320',
            'multi_use' => 'boolean',
            'house_id' => 'nullable|exists:houses,id',
        ]);
        if ($u->isResident()) {
            abort_unless($u->house_id, 422, 'Your account is not linked to a house.');
            $data['house_id'] = $u->house_id;
        }
        $hit = VisitorController::watchlistMatch($data['cnic'] ?? null, $data['phone'] ?? null, $data['vehicle_no'] ?? null);
        abort_if($hit && $hit->level === 'blocked', 422, 'This person / vehicle is blocked by security.');
        do {
            $code = 'VP-'.strtoupper(Str::random(6));
        } while (VisitorPass::where('code', $code)->exists());
        $pass = VisitorPass::create($data + ['code' => $code, 'created_by' => $u->id, 'max_stay_minutes' => $data['max_stay_minutes'] ?? Settings::get('visitor_max_stay_minutes'), 'persons' => $data['persons'] ?? 1]);
        $pass->load('house');
        Activity::log('security', 'pass', "QR pass {$code} for {$pass->visitor_name}".($pass->house ? " → {$pass->house->label}" : '').' valid '.$pass->valid_from->format('d M H:i').'–'.$pass->valid_until->format('d M H:i'), $pass);
        Activity::alertModule('security', 2, 'Expected visitor: '.$pass->visitor_name, ($pass->house?->label ?? '').' · '.$pass->valid_from->format('d M h:i A'), 'info', '/security?tab=passes', $pass->house_id);

        return $pass;
    }

    public function cancelPass(Request $request, VisitorPass $pass)
    {
        $u = $request->user();
        abort_unless($u->canManage('security') || ($u->isResident() && $pass->house_id === $u->house_id), 403);
        $pass->update(['status' => 'cancelled']);
        Activity::log('security', 'pass', "Cancelled pass {$pass->code}", $pass);

        return $pass;
    }

    /**
     * Gate scanner: one box for every code — visitor QR pass (VP-), event pass (EVT-),
     * or a vehicle number plate.
     */
    public function scan(Request $request)
    {
        $this->authorizeManage($request, 'security');
        $raw = strtoupper(trim((string) $request->validate(['code' => 'required|string|max:120'])['code']));
        if (preg_match('/(GV-[A-Z0-9]{6})/', $raw, $m)) {
            $v = Visitor::with('house', 'logger:id,name')->where('token', $m[1])->first();
            abort_unless($v, 404, 'Unknown gate slip.');
            $over = $v->status === 'inside' && $v->expected_exit_at && $v->expected_exit_at->isPast();

            return ['kind' => 'exit', 'valid' => $v->status === 'inside', 'overstay' => $over,
                'reason' => match ($v->status) {
                    'inside' => $over ? 'Overstayed by '.(int) $v->expected_exit_at->diffInMinutes(now()).' min' : 'Allowed until '.$v->expected_exit_at?->format('h:i A'),
                    'exited' => 'Already exited at '.$v->exit_at?->format('d M h:i A'),
                    'awaiting' => 'Still waiting for household approval',
                    default => 'Entry was '.$v->status,
                }, 'visitor' => $v];
        }
        if (preg_match('/(DS-[A-Z0-9]{6})/', $raw, $m)) {
            $staff = \App\Models\DomesticStaff::with('house', 'inside')->where('code', $m[1])->first();
            abort_unless($staff, 404, 'Unknown staff card.');
            [$ok, $reason] = SecurityOpsController::staffCheck($staff);

            return ['kind' => 'staff', 'valid' => $ok, 'reason' => $reason, 'staff' => $staff, 'inside' => (bool) $staff->inside];
        }
        if (preg_match('/(CP-[A-Z0-9]{6})/', $raw, $m)) {
            abort(422, 'This is a patrol checkpoint — scan it from the Patrol tab.');
        }
        if (preg_match('/(VP-[A-Z0-9]{6})/', $raw, $m)) {
            $pass = VisitorPass::with('house', 'creator:id,name')->where('code', $m[1])->first();
            abort_unless($pass, 404, 'Unknown visitor pass.');
            $valid = $pass->status === 'active' && now()->between($pass->valid_from, $pass->valid_until);
            $reason = match (true) {
                $pass->status === 'used' => 'Pass already used at '.$pass->used_at?->format('d M h:i A'),
                $pass->status === 'cancelled' => 'Pass was cancelled by the household',
                now()->lessThan($pass->valid_from) => 'Pass is valid from '.$pass->valid_from->format('d M h:i A'),
                now()->greaterThan($pass->valid_until) || $pass->status === 'expired' => 'Pass expired at '.$pass->valid_until->format('d M h:i A'),
                default => null,
            };
            $hit = VisitorController::watchlistMatch($pass->cnic, $pass->phone, $pass->vehicle_no);

            return ['kind' => 'pass', 'valid' => $valid && ! ($hit && $hit->level === 'blocked'), 'reason' => $hit ? 'Watchlist: '.$hit->reason : $reason, 'pass' => $pass];
        }
        if (preg_match('/(EVT-[A-Z0-9]{6})/', $raw, $m)) {
            $event = Event::with('house', 'requester:id,name')->where('code', $m[1])->first();
            abort_unless($event, 404, 'Unknown event code.');
            $today = $event->date->isToday() || ($event->date->isYesterday() && Watchers::endAt($event)->isFuture());
            $valid = $event->status === 'approved' && $today && now()->lessThan(Watchers::endAt($event)->addMinutes($event->grace_minutes ?: 15));
            if ($valid && $request->boolean('checkin')) {
                $event->increment('checked_in', max(1, (int) $request->input('guests', 1)));
            }

            return ['kind' => 'event', 'valid' => $valid, 'reason' => $valid ? null : ($event->status !== 'approved' ? 'Event is '.$event->status : 'Not valid at this time (event on '.$event->date->format('d M').')'), 'event' => $event];
        }
        $plate = preg_replace('/[^A-Z0-9]/', '', $raw);
        $vehicle = Vehicle::with('house')->get()->first(fn ($v) => preg_replace('/[^A-Z0-9]/', '', strtoupper($v->plate)) === $plate);
        $hit = VisitorController::watchlistMatch(null, null, $raw);
        if ($vehicle || $hit) {
            $open = \App\Models\VehicleLog::where('status', 'inside')->get(['id', 'plate', 'entry_at'])->first(fn ($l) => preg_replace('/[^A-Z0-9]/', '', strtoupper($l->plate)) === $plate);

            return ['kind' => 'vehicle', 'inside_log' => $open, 'plate' => $raw, 'valid' => $vehicle && $vehicle->active && ! ($hit && $hit->level === 'blocked'), 'reason' => $hit ? 'Watchlist: '.$hit->reason : ($vehicle && ! $vehicle->active ? 'Vehicle sticker inactive' : null), 'vehicle' => $vehicle, 'resident' => (bool) $vehicle];
        }
        if (preg_match('/^[A-Z]{1,4}-?\d{1,5}$/', $raw)) {
            $open = \App\Models\VehicleLog::where('status', 'inside')->get(['id', 'plate', 'entry_at'])->first(fn ($l) => preg_replace('/[^A-Z0-9]/', '', strtoupper($l->plate)) === $plate);

            return ['kind' => 'vehicle', 'inside_log' => $open, 'plate' => $raw, 'valid' => true, 'reason' => 'Unregistered vehicle — record it as a visitor / service vehicle', 'vehicle' => null, 'resident' => false];
        }
        abort(404, 'Code not recognised. Scan a gate slip (GV-…), visitor pass (VP-…), staff card (DS-…), event code (EVT-…) or type a number plate.');
    }

    // ---------- Blacklist / watchlist ----------

    public function watchlist(Request $request)
    {
        $this->authorizeManage($request, 'security');

        return $this->paginate(Watchlist::with('adder:id,name')->latest('id'), $request, ['name', 'cnic', 'phone', 'vehicle_no', 'reason'], 50);
    }

    public function storeWatch(Request $request)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate(['name' => 'nullable|string|max:120', 'cnic' => 'nullable|string|max:20', 'phone' => 'nullable|string|max:30', 'vehicle_no' => 'nullable|string|max:30',
            'level' => 'required|in:blocked,watch', 'reason' => 'required|string|max:255', 'until' => 'nullable|date']);
        abort_if(empty($data['name']) && empty($data['cnic']) && empty($data['phone']) && empty($data['vehicle_no']), 422, 'Enter at least a name, '.\App\Support\Settings::idLabel().', phone or vehicle number.');
        $w = Watchlist::create($data + ['added_by' => $request->user()->id]);
        Activity::log('security', 'watchlist', ucfirst($w->level).': '.($w->name ?: $w->cnic ?: $w->vehicle_no).' — '.$w->reason, $w);

        return $w;
    }

    public function destroyWatch(Request $request, Watchlist $watch)
    {
        abort_unless($request->user()->canApprove('security'), 403);
        Activity::log('security', 'watchlist', 'Removed from watchlist: '.($watch->name ?: $watch->cnic ?: $watch->vehicle_no));
        $watch->delete();

        return response()->noContent();
    }

    // ---------- Vehicles ----------

    public function vehicles(Request $request)
    {
        $this->authorizeView($request, 'security');
        $u = $request->user();
        $q = Vehicle::with('house')->orderBy('plate');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        }

        return $this->paginate($q, $request, ['plate', 'make', 'sticker_no', 'owner_name', 'parking_slot'], 50);
    }

    public function storeVehicle(Request $request)
    {
        $u = $request->user();
        abort_unless($u->canManage('security') || ($u->isResident() && $u->house_id), 403);
        $data = $request->validate(['plate' => 'required|string|max:20', 'type' => 'required|in:car,bike,van,truck,other', 'make' => 'nullable|string|max:60', 'color' => 'nullable|string|max:30',
            'sticker_no' => 'nullable|string|max:30', 'parking_slot' => 'nullable|string|max:20', 'owner_name' => 'nullable|string|max:120', 'house_id' => 'nullable|exists:houses,id', 'active' => 'boolean']);
        $data['plate'] = strtoupper($data['plate']);
        if ($u->isResident()) {
            $data['house_id'] = $u->house_id;
            unset($data['sticker_no'], $data['parking_slot']);
        }
        $v = Vehicle::create($data);
        Activity::log('security', 'vehicle', "Registered vehicle {$v->plate}".($v->house_id ? ' for '.$v->house->label : ''), $v);

        return $v->load('house');
    }

    public function updateVehicle(Request $request, Vehicle $vehicle)
    {
        $this->authorizeManage($request, 'security');
        $vehicle->update($request->validate(['plate' => 'required|string|max:20', 'type' => 'required|in:car,bike,van,truck,other', 'make' => 'nullable|string|max:60', 'color' => 'nullable|string|max:30',
            'sticker_no' => 'nullable|string|max:30', 'parking_slot' => 'nullable|string|max:20', 'owner_name' => 'nullable|string|max:120', 'house_id' => 'nullable|exists:houses,id', 'active' => 'boolean']));

        return $vehicle->load('house');
    }

    public function destroyVehicle(Request $request, Vehicle $vehicle)
    {
        $u = $request->user();
        abort_unless($u->canApprove('security') || ($u->isResident() && $vehicle->house_id === $u->house_id), 403);
        Activity::log('security', 'vehicle', "Removed vehicle {$vehicle->plate}");
        $vehicle->delete();

        return response()->noContent();
    }

    // ---------- Incidents ----------

    public function incidents(Request $request)
    {
        $this->authorizeManage($request, 'security');
        $q = Incident::with(['house', 'reporter:id,name'])->latest('id');
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, ['reference', 'description', 'location']);
    }

    public function storeIncident(Request $request)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate(['type' => 'required|in:theft,suspicious,accident,fire,medical,vandalism,unauthorized_entry,dispute,other', 'severity' => 'required|in:low,medium,high,critical',
            'location' => 'nullable|string|max:150', 'house_id' => 'nullable|exists:houses,id', 'description' => 'required|string|max:5000', 'photo' => 'nullable|image|max:8192']);
        $data['photo_path'] = Uploads::store($request->file('photo'), 'incidents');
        unset($data['photo']);
        $i = Incident::create($data + ['reported_by' => $request->user()->id]);
        $i->update(['reference' => 'INC-'.str_pad((string) $i->id, 5, '0', STR_PAD_LEFT)]);
        $label = str_replace('_', ' ', $i->type);
        Activity::log('security', 'incident', "Incident {$i->reference}: {$label} ({$i->severity})".($i->location ? " at {$i->location}" : ''), $i);
        Activity::alertAdmins('security', 'Security incident: '.ucfirst($label), $i->reference.' · '.ucfirst($i->severity).($i->location ? ' · '.$i->location : ''), in_array($i->severity, ['high', 'critical']) ? 'danger' : 'warning', '/security?tab=incidents', $i->house_id);
        Activity::alertModule('security', 3, 'Incident reported: '.ucfirst($label), $i->reference, 'warning', '/security?tab=incidents', $i->house_id);

        return $i->load('house');
    }

    public function updateIncident(Request $request, Incident $incident)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate(['status' => 'required|in:open,investigating,resolved', 'action_taken' => 'nullable|string|max:5000']);
        if ($data['status'] === 'resolved') {
            $data['resolved_at'] = now();
        }
        $incident->update($data);
        Activity::log('security', 'incident', "{$incident->reference} → {$data['status']}", $incident);

        return $incident->load('house', 'reporter');
    }
}
