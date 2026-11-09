<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Event;
use App\Models\House;
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

    /** Data for the 3D community map — each house with its live status. */
    public function map(Request $request)
    {
        $u = $request->user();
        $official = ! $u->isResident();
        $period = now()->format('Y-m');
        $inside = $official ? Visitor::whereNull('exit_at')->whereNotNull('entry_at')->selectRaw('house_id, count(*) c')->groupBy('house_id')->pluck('c', 'house_id') : collect();
        $open = $official ? Complaint::whereIn('status', ['open', 'assigned', 'in_progress'])->selectRaw('house_id, count(*) c')->groupBy('house_id')->pluck('c', 'house_id') : collect();
        $paid = $official ? Transaction::where('category', 'maintenance')->where('period', $period)->pluck('house_id')->flip() : collect();
        $events = Event::where('status', 'approved')->whereDate('date', now()->toDateString())->pluck('house_id')->flip();

        return House::orderBy('id')->get()->map(fn (House $h) => [
            'id' => $h->id,
            'label' => $h->label,
            'block' => $h->block,
            'owner' => $official || $h->id === $u->house_id ? $h->owner_name : null,
            'type' => $h->type,
            'x' => $h->grid_x,
            'y' => $h->grid_y,
            'floors' => max(1, $h->floors),
            'mine' => $h->id === $u->house_id,
            'visitors' => (int) ($inside[$h->id] ?? 0),
            'complaints' => (int) ($open[$h->id] ?? 0),
            'paid' => $official ? isset($paid[$h->id]) : null,
            'event' => isset($events[$h->id]),
        ]);
    }

    /** One household's full picture (used from the 3D map). */
    public function show(Request $request, House $house)
    {
        $u = $request->user();
        abort_if($u->isResident() && $u->house_id !== $house->id, 403);
        $house->load('residents:id,name,email,phone,house_id,role');

        return [
            'house' => $house,
            'visitors' => $u->canView('security') ? Visitor::where('house_id', $house->id)->latest('entry_at')->limit(8)->get() : [],
            'complaints' => Complaint::where('house_id', $house->id)->latest()->limit(5)->get(),
            'payments' => $u->canManage('finance') || $u->house_id === $house->id ? Transaction::where('house_id', $house->id)->latest('date')->limit(6)->get() : [],
        ];
    }
}
