<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Event;
use App\Models\House;
use App\Models\Incident;
use App\Models\SosAlert;
use App\Models\Transaction;
use App\Models\Visitor;
use App\Support\Activity;
use Illuminate\Http\Request;

class HouseController extends Controller
{
    private array $rules = [
        'house_no' => 'required|string|max:30',
        'block' => 'nullable|string|max:30',
        'street' => 'nullable|string|max:60',
        'owner_name' => 'nullable|string|max:120',
        'owner_phone' => 'nullable|string|max:30',
        'type' => 'required|in:house,flat,commercial,plot',
        'grid_x' => 'nullable|integer|min:0|max:200',
        'grid_y' => 'nullable|integer|min:0|max:200',
        'map_x' => 'nullable|numeric', 'map_y' => 'nullable|numeric', 'map_w' => 'nullable|numeric|min:1', 'map_h' => 'nullable|numeric|min:1', 'map_angle' => 'nullable|numeric|min:-180|max:180',
        'floors' => 'nullable|integer|min:0|max:20',
        'monthly_maintenance' => 'nullable|numeric|min:0',
    ];

    public function index(Request $request)
    {
        abort_if($request->user()->isResident(), 403);
        $q = House::withCount('residents')->orderBy('block')->orderBy('house_no');
        if ($request->boolean('all')) {
            return $q->get(['id', 'house_no', 'block', 'owner_name']);
        }

        return $this->paginate($q, $request, ['house_no', 'block', 'street', 'owner_name', 'owner_phone'], 50);
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'users');
        $house = House::create($request->validate($this->rules));
        Activity::log('users', 'create', "Added house {$house->label}", $house);

        return $house;
    }

    public function update(Request $request, House $house)
    {
        $this->authorizeManage($request, 'users');
        $house->update($request->validate($this->rules));
        Activity::log('users', 'update', "Updated house {$house->label}", $house);

        return $house;
    }

    public function destroy(Request $request, House $house)
    {
        $this->authorizeManage($request, 'users');
        Activity::log('users', 'delete', "Deleted house {$house->label}");
        $house->delete();

        return response()->noContent();
    }

    /** Live data for the 3D community map: every house with its status + recent gate movements + SOS. */
    public function map(Request $request)
    {
        $u = $request->user();
        $official = ! $u->isResident();
        $period = now()->format('Y-m');
        $sec = $official && $u->canView('security');
        $inside = $sec ? Visitor::where('status', 'inside')->selectRaw('house_id, count(*) c')->groupBy('house_id')->pluck('c', 'house_id') : collect();
        $awaiting = $sec ? Visitor::where('status', 'awaiting')->selectRaw('house_id, count(*) c')->groupBy('house_id')->pluck('c', 'house_id') : collect();
        $over = $sec ? Visitor::where('status', 'inside')->where('expected_exit_at', '<', now())->selectRaw('house_id, count(*) c')->groupBy('house_id')->pluck('c', 'house_id') : collect();
        $open = $official ? Complaint::whereIn('status', ['open', 'assigned', 'in_progress'])->selectRaw('house_id, count(*) c')->groupBy('house_id')->pluck('c', 'house_id') : collect();
        $paid = $official && $u->canManage('finance') ? Transaction::where('category', 'maintenance')->where('period', $period)->pluck('house_id')->flip() : collect();
        $events = Event::where('status', 'approved')->whereDate('date', now()->toDateString())->pluck('house_id')->flip();
        $sosRows = SosAlert::whereIn('status', ['active', 'responding'])->get(['id', 'house_id', 'type', 'status', 'created_at']);
        $sos = $sosRows->keyBy('house_id');
        $showSos = $official && ($u->canView('emergency') || $u->canView('security'));

        $houses = House::orderBy('id')->get()->map(fn (House $h) => [
            'id' => $h->id,
            'label' => $h->label,
            'block' => $h->block,
            'series' => $h->block,
            'street' => $h->street,
            'owner' => $official || $h->id === $u->house_id ? $h->owner_name : null,
            'type' => $h->type,
            'x' => $h->grid_x,
            'y' => $h->grid_y,
            'mx' => $h->map_x, 'my' => $h->map_y, 'mw' => $h->map_w, 'mh' => $h->map_h, 'ma' => $h->map_angle,
            'floors' => max(1, $h->floors),
            'mine' => $h->id === $u->house_id,
            'visitors' => (int) ($inside[$h->id] ?? 0),
            'awaiting' => (int) ($awaiting[$h->id] ?? 0),
            'overstay' => (int) ($over[$h->id] ?? 0),
            'complaints' => (int) ($open[$h->id] ?? 0),
            'paid' => $official && $u->canManage('finance') ? isset($paid[$h->id]) : null,
            'event' => isset($events[$h->id]),
            'sos' => ($showSos || $h->id === $u->house_id) && isset($sos[$h->id]) ? $sos[$h->id]->type : null,
        ]);

        // Recent gate movements drive the walking markers on the map.
        $moves = $sec ? Visitor::where('updated_at', '>=', now()->subMinutes(15))->whereNotNull('house_id')->latest('updated_at')->limit(25)
            ->get(['id', 'house_id', 'name', 'category', 'status', 'vehicle_no', 'updated_at']) : collect();

        return [
            'houses' => $houses,
            'moves' => $moves,
            'stats' => [
                'inside' => $inside->sum(), 'awaiting' => $awaiting->sum(), 'overstay' => $over->sum(), 'complaints' => $official ? $open->sum() : null,
                'events' => $events->count(), 'sos' => $showSos ? $sosRows->count() : 0,
            ],
            'feed' => $official ? \App\Models\ActivityLog::with('user:id,name')->latest('id')->limit(8)->get(['id', 'user_id', 'module', 'description', 'created_at']) : [],
            'site' => \App\Services\SitePlan::site(),
            'signals' => $this->signals($u),
            'server_time' => now()->toIso8601String(),
        ];
    }

    /**
     * Everything that needs attention, pinned to the house it came from — drives the map pins,
     * the "requests" inbox and the flash when a new one arrives. Filtered by what the viewer may see.
     */
    private function signals($u): array
    {
        $own = $u->isResident();
        $hid = $u->house_id ?? 0;
        $out = [];
        $add = function (string $type, $houseId, $id, string $title, ?string $sub, string $level, string $link, $at, array $extra = []) use (&$out) {
            if (! $houseId) {
                return;
            }
            $out[] = ['key' => $type.'-'.$id, 'type' => $type, 'id' => $id, 'house_id' => (int) $houseId, 'title' => $title, 'sub' => $sub, 'level' => $level, 'link' => $link,
                'at' => $at instanceof \DateTimeInterface ? $at->format(DATE_ATOM) : $at] + $extra;
        };
        $scope = fn ($q, $col = 'house_id') => $own ? $q->where($col, $hid) : $q;

        if ($u->canView('emergency') || $u->canView('security') || $own) {
            foreach ($scope(SosAlert::with('user:id,name,phone')->whereIn('status', ['active', 'responding']))->get() as $s) {
                $add('sos', $s->house_id, $s->id, 'SOS '.strtoupper($s->type), ($s->user?->name ?? '').($s->user?->phone ? ' · '.$s->user->phone : '').($s->message ? ' · '.$s->message : ''),
                    'danger', '/emergency?sos='.$s->id, $s->created_at, ['status' => $s->status, 'lat' => $s->lat, 'lng' => $s->lng]);
            }
        }
        if ($u->canView('security')) {
            foreach ($scope(Visitor::where('status', 'awaiting'))->get() as $v) {
                $add('gate', $v->house_id, $v->id, 'Visitor at gate: '.$v->name, ucfirst($v->category).' · '.$v->purpose, 'warning', '/security?tab=approvals', $v->created_at);
            }
            foreach ($scope(Visitor::where('status', 'inside')->where('expected_exit_at', '<', now()))->get() as $v) {
                $add('overstay', $v->house_id, $v->id, 'Overstay: '.$v->name, 'Allowed until '.$v->expected_exit_at->format('h:i A'), 'warning', '/security', $v->expected_exit_at);
            }
            if (! $own && $u->canManage('security')) {
                foreach (Incident::whereNotNull('house_id')->where('status', '!=', 'resolved')->get() as $i) {
                    $add('incident', $i->house_id, $i->id, 'Incident: '.str_replace('_', ' ', $i->type), $i->reference.' · '.$i->severity, in_array($i->severity, ['high', 'critical']) ? 'danger' : 'warning', '/security?tab=incidents', $i->created_at);
                }
            }
        }
        if ($u->canView('complaints')) {
            $q = Complaint::whereIn('status', ['open', 'assigned', 'in_progress']);
            foreach (($own ? $q->where('user_id', $u->id) : $q)->get() as $c) {
                $add('complaint', $c->house_id, $c->id, $c->title, $c->ticket_no.' · '.str_replace('_', ' ', $c->status).($c->assigned_worker ? ' · '.$c->assigned_worker : ''),
                    $c->priority === 'urgent' ? 'danger' : ($c->status === 'open' ? 'warning' : 'info'), '/complaints?q='.$c->ticket_no, $c->created_at, ['priority' => $c->priority]);
            }
        }
        if ($u->canView('events')) {
            $q = Event::where(fn ($w) => $w->where('status', 'pending')->orWhere(fn ($x) => $x->where('status', 'approved')->whereDate('date', now()->toDateString())));
            foreach (($own ? $q->where('requested_by', $u->id) : $q)->get() as $e) {
                $add($e->status === 'pending' ? 'event_request' : 'event', $e->house_id, $e->id, ($e->status === 'pending' ? 'Event request: ' : 'Event today: ').$e->title,
                    $e->venue.' · '.substr($e->start_time, 0, 5).'–'.substr($e->end_time, 0, 5), $e->status === 'pending' ? 'warning' : 'info', '/events', $e->created_at);
            }
        }
        if ($u->canView('noc')) {
            $q = \App\Models\Noc::whereIn('status', ['submitted', 'under_review', 'documents_required']);
            foreach (($own ? $q->where('user_id', $u->id) : $q)->get() as $n) {
                $add('noc', $n->house_id, $n->id, 'NOC '.$n->reference, str_replace('_', ' ', $n->type).' · '.str_replace('_', ' ', $n->status), $n->status === 'submitted' ? 'warning' : 'info', '/noc?q='.$n->reference, $n->created_at);
            }
        }
        if ($u->canManage('gym') || $own) {
            $q = \App\Models\GymPayment::with('member:id,name,house_id')->where('status', 'pending')->whereNotNull('proof_path');
            foreach ($q->get() as $p) {
                if (! $own || $p->member?->house_id === $hid) {
                    $add('payment', $p->member?->house_id, $p->id, 'Gym payment to verify', ($p->member?->name ?? '').' · Rs '.number_format($p->amount), 'info', '/gym?tab=payments', $p->updated_at);
                }
            }
        }
        if ($u->canManage('library')) {
            foreach (\App\Models\BookIssue::with('book:id,title', 'user:id,house_id')->where('status', 'requested')->get() as $b) {
                $add('book', $b->user?->house_id, $b->id, 'Book request', $b->book?->title, 'info', '/library?tab=issues', $b->created_at);
            }
        }
        if ($own) { // a household only ever sees pins on its own house
            $out = array_values(array_filter($out, fn ($s) => $s['house_id'] === (int) $hid));
        }
        usort($out, fn ($a, $b) => strcmp((string) $b['at'], (string) $a['at']));

        return $out;
    }

    /** One household's full picture (used from the 3D map). */
    public function show(Request $request, House $house)
    {
        $u = $request->user();
        abort_if($u->isResident() && $u->house_id !== $house->id, 403);
        $house->load('residents:id,name,email,phone,house_id,role,household_role');

        return [
            'house' => $house,
            'visitors' => $u->canView('security') ? Visitor::where('house_id', $house->id)->latest('id')->limit(8)->get() : [],
            'vehicles' => $u->canView('security') ? \App\Models\Vehicle::where('house_id', $house->id)->get() : [],
            'complaints' => Complaint::where('house_id', $house->id)->latest()->limit(5)->get(),
            'payments' => $u->canManage('finance') || $u->house_id === $house->id ? Transaction::where('house_id', $house->id)->latest('date')->limit(6)->get() : [],
        ];
    }
}
