<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\Setting;
use App\Models\Transaction;
use App\Services\EventWatcher;
use App\Support\Activity;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class EventController extends Controller
{
    public const DEFAULT_RATES = [
        'venues' => ['Community Hall' => 3000, 'Club Lawn' => 2000, 'Ground' => 1500, 'Mosque Lawn' => 0, 'Own House / Street' => 500],
        'per_guest' => 30,
        'per_vehicle' => 100,
        'security_per_hour' => 400,
        'type_surcharge' => ['wedding' => 10000, 'birthday' => 0, 'religious' => 0, 'community' => 0, 'sports' => 0, 'private' => 0, 'other' => 0],
        'late_night_surcharge' => 2000, // events ending after 11 PM
    ];

    public static function rates(): array
    {
        return array_replace(self::DEFAULT_RATES, Setting::get('event_rates', []) ?: []);
    }

    /** Event calculator: hours × venue rate + guests + parking + security staff + surcharges. */
    public static function calculate(array $e): array
    {
        $r = self::rates();
        $start = Carbon::parse('2000-01-01 '.$e['start_time']);
        $end = Carbon::parse('2000-01-01 '.$e['end_time']);
        if ($end->lessThanOrEqualTo($start)) {
            $end->addDay();
        }
        $hours = max(1, (int) ceil($start->diffInMinutes($end) / 60));
        $lines = [
            ['label' => "Venue ({$e['venue']}) × {$hours}h", 'amount' => ($r['venues'][$e['venue']] ?? 0) * $hours],
            ['label' => ($e['guests'] ?? 0).' guests', 'amount' => ($e['guests'] ?? 0) * $r['per_guest']],
            ['label' => ($e['vehicles'] ?? 0).' vehicles parking', 'amount' => ($e['vehicles'] ?? 0) * $r['per_vehicle']],
            ['label' => "Security staff × {$hours}h", 'amount' => $hours * $r['security_per_hour']],
        ];
        if ($s = $r['type_surcharge'][$e['type'] ?? 'other'] ?? 0) {
            $lines[] = ['label' => ucfirst($e['type']).' surcharge', 'amount' => $s];
        }
        if ($end->format('H:i') > '23:00' || $end->day > 1) {
            $lines[] = ['label' => 'Late night (after 11 PM)', 'amount' => $r['late_night_surcharge']];
        }
        $lines = array_values(array_filter($lines, fn ($l) => $l['amount'] > 0));

        return ['hours' => $hours, 'lines' => $lines, 'total' => array_sum(array_column($lines, 'amount'))];
    }

    private function rules(): array
    {
        return [
            'house_id' => 'nullable|exists:houses,id',
            'title' => 'required|string|max:150',
            'type' => 'required|in:private,wedding,birthday,religious,community,sports,other',
            'venue' => 'required|string|max:100',
            'date' => 'required|date',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i',
            'guests' => 'nullable|integer|min:0|max:10000',
            'vehicles' => 'nullable|integer|min:0|max:2000',
            'details' => 'nullable|string|max:2000',
        ];
    }

    public function index(Request $request)
    {
        $this->authorizeView($request, 'events');
        $u = $request->user();
        $q = Event::with(['house', 'requester:id,name', 'approver:id,name'])->orderByDesc('date')->orderByDesc('start_time');
        if ($u->isResident()) {
            $q->where('requested_by', $u->id);
        } elseif (! $u->canManage('events')) { // security sees approved schedule
            $q->whereIn('status', ['approved', 'completed']);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }
        if ($request->query('when') === 'upcoming') {
            $q->whereDate('date', '>=', now()->toDateString())->reorder('date')->orderBy('start_time');
        } elseif ($request->query('when') === 'today') {
            $q->whereDate('date', now()->toDateString());
        }
        $page = $this->paginate($q, $request, ['title', 'code', 'venue']);
        $page->getCollection()->transform(function (Event $e) {
            $end = EventWatcher::endAt($e);
            $e->setAttribute('ends_at', $end->toIso8601String());
            $e->setAttribute('live', $e->status === 'approved' && now()->between(Carbon::parse($e->date->toDateString().' '.$e->start_time), $end));
            $e->setAttribute('overtime', $e->status === 'approved' && now()->greaterThan($end) && now()->diffInHours($end, true) < 12);

            return $e;
        });

        return $page;
    }

    public function quote(Request $request)
    {
        $this->authorizeView($request, 'events');
        $data = $request->validate(['venue' => 'required|string', 'type' => 'nullable|string', 'start_time' => 'required|date_format:H:i', 'end_time' => 'required|date_format:H:i', 'guests' => 'nullable|integer|min:0', 'vehicles' => 'nullable|integer|min:0']);

        return self::calculate($data) + ['venues' => array_keys(self::rates()['venues'])];
    }

    public function store(Request $request)
    {
        $this->authorizeView($request, 'events');
        abort_if(! $request->user()->isResident() && ! $request->user()->canManage('events'), 403);
        $data = $request->validate(array_merge($this->rules(), ['date' => 'required|date|after_or_equal:today']));
        if ($request->user()->isResident()) {
            $data['house_id'] = $request->user()->house_id;
        }
        $calc = self::calculate($data);
        $event = Event::create($data + ['requested_by' => $request->user()->id, 'charges' => $calc['total'], 'charge_breakdown' => $calc, 'status' => 'pending']);
        Activity::log('events', 'request', "Event request \"{$event->title}\" on ".$event->date->format('d M').' at '.$event->venue, $event);
        Activity::alertRole('manager', 'events', 'New event request', "{$event->title} · ".$event->date->format('d M').' · '.$event->venue, 'info', '/events');

        return $event;
    }

    public function update(Request $request, Event $event)
    {
        $u = $request->user();
        abort_unless($u->canManage('events') || ($event->requested_by === $u->id && $event->status === 'pending'), 403);
        $data = $request->validate($this->rules());
        $calc = self::calculate($data);
        $event->update($data + ['charges' => $calc['total'], 'charge_breakdown' => $calc]);
        Activity::log('events', 'update', "Updated event \"{$event->title}\"", $event);

        return $event;
    }

    /** Approve (generates the event code), reject, or complete. */
    public function setStatus(Request $request, Event $event)
    {
        $this->authorizeManage($request, 'events');
        $data = $request->validate(['status' => 'required|in:approved,rejected,completed,cancelled', 'record_payment' => 'boolean']);
        $patch = ['status' => $data['status']];
        if ($data['status'] === 'approved') {
            $patch['code'] = $event->code ?: 'EVT-'.strtoupper(Str::random(6));
            $patch['approved_by'] = $request->user()->id;
            $patch['last_hour_alerted_at'] = null;
            $patch['end_alerted_at'] = null;
        }
        $event->update($patch);
        if ($data['status'] === 'approved' && ($data['record_payment'] ?? false) && $event->charges > 0) {
            Transaction::create(['type' => 'revenue', 'category' => 'event', 'amount' => $event->charges, 'house_id' => $event->house_id, 'reference' => $event->code, 'description' => 'Event: '.$event->title, 'date' => now()->toDateString(), 'recorded_by' => $request->user()->id]);
        }
        Activity::log('events', $data['status'], ucfirst($data['status'])." event \"{$event->title}\"".($event->code ? " ({$event->code})" : ''), $event);
        Activity::alertUser($event->requested_by, 'events', 'Event '.$data['status'].': '.$event->title, $data['status'] === 'approved' ? 'Your event code is '.$event->code.'. Charges Rs '.number_format($event->charges) : null, $data['status'] === 'approved' ? 'success' : 'warning', '/events');
        if ($data['status'] === 'approved') {
            Activity::alertRole('security', 'events', 'Event scheduled: '.$event->title, $event->code.' · '.$event->date->format('d M').' '.$event->start_time.'–'.$event->end_time.' · '.$event->venue.' · '.$event->guests.' guests', 'info', '/events');
        }

        return $event->load('house', 'requester', 'approver');
    }

    /** Security verifies an event code at the gate. */
    public function verify(Request $request, string $code)
    {
        $this->authorizeView($request, 'events');
        abort_if($request->user()->isResident(), 403);
        $event = Event::with('house', 'requester:id,name')->where('code', strtoupper($code))->first();
        abort_unless($event, 404, 'No event with this code.');

        return $event;
    }

    public function destroy(Request $request, Event $event)
    {
        $u = $request->user();
        abort_unless($u->isAdmin() || ($event->requested_by === $u->id && $event->status === 'pending'), 403);
        Activity::log('events', 'delete', "Deleted event \"{$event->title}\"");
        $event->delete();

        return response()->noContent();
    }

    public function getRates(Request $request)
    {
        $this->authorizeView($request, 'events');

        return self::rates();
    }

    public function saveRates(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $request->validate(['venues' => 'required|array', 'venues.*' => 'numeric|min:0', 'per_guest' => 'numeric|min:0', 'per_vehicle' => 'numeric|min:0', 'security_per_hour' => 'numeric|min:0', 'late_night_surcharge' => 'numeric|min:0', 'type_surcharge' => 'array']);
        Setting::put('event_rates', $data);
        Activity::log('events', 'settings', 'Updated event charge rates');

        return self::rates();
    }
}
