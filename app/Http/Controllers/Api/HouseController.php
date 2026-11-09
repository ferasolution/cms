<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Event;
use App\Models\House;
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
            'street' => $h->street,
            'owner' => $official || $h->id === $u->house_id ? $h->owner_name : null,
            'type' => $h->type,
            'x' => $h->grid_x,
            'y' => $h->grid_y,
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
            'server_time' => now()->toIso8601String(),
        ];
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
