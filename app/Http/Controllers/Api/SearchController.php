<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Complaint;
use App\Models\Employee;
use App\Models\Event;
use App\Models\GymMember;
use App\Models\House;
use App\Models\Noc;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Visitor;
use Illuminate\Http\Request;

/** Global search (Ctrl+K) across every module the user is allowed to open. */
class SearchController extends Controller
{
    public function __invoke(Request $request)
    {
        $q = trim((string) $request->query('q'));
        if (mb_strlen($q) < 2) {
            return [];
        }
        $u = $request->user();
        $like = "%{$q}%";
        $own = $u->isResident();
        $out = [];
        $add = function (string $type, string $title, ?string $sub, string $link, $id) use (&$out) {
            $out[] = compact('type', 'title', 'sub', 'link', 'id');
        };

        if (! $own) {
            $hq = House::where(fn ($w) => $w->where('house_no', 'like', $like)->orWhere('owner_name', 'like', $like)->orWhere('owner_phone', 'like', $like));
            if (preg_match('/^([A-Za-z]+)\s*-?\s*(\w+)$/', $q, $m)) { // "A-101"
                $hq->orWhere(fn ($w) => $w->where('block', strtoupper($m[1]))->where('house_no', $m[2]));
            }
            foreach ($hq->limit(6)->get() as $h) {
                $add('House', 'House '.$h->label, $h->owner_name, '/map?house='.$h->id, $h->id);
            }
        }
        if ($u->canManage('users')) {
            foreach (User::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like))->limit(6)->get() as $x) {
                $add('User', $x->name, $x->email.' · '.($x->designation ?: $x->role), '/users?q='.urlencode($x->email), $x->id);
            }
        }
        if ($u->canView('security')) {
            $v = Visitor::with('house')->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('cnic', 'like', $like)->orWhere('vehicle_no', 'like', $like)->orWhere('phone', 'like', $like));
            if ($own) {
                $v->where('house_id', $u->house_id ?? 0);
            }
            foreach ($v->latest('id')->limit(6)->get() as $x) {
                $add('Visitor', $x->name, ucfirst($x->status).' · '.($x->house?->label ?? '').' · '.$x->created_at->format('d M'), '/security?q='.urlencode($x->name), $x->id);
            }
            $veh = Vehicle::with('house')->where('plate', 'like', $like);
            if ($own) {
                $veh->where('house_id', $u->house_id ?? 0);
            }
            foreach ($veh->limit(4)->get() as $x) {
                $add('Vehicle', $x->plate, trim(($x->make ?? '').' '.($x->color ?? '')).' · '.($x->house?->label ?? 'visitor'), '/security?tab=vehicles&q='.urlencode($x->plate), $x->id);
            }
        }
        if ($u->canView('complaints')) {
            $c = Complaint::where(fn ($w) => $w->where('title', 'like', $like)->orWhere('ticket_no', 'like', $like));
            if ($own) {
                $c->where('user_id', $u->id);
            }
            foreach ($c->latest('id')->limit(5)->get() as $x) {
                $add('Complaint', $x->ticket_no.' · '.$x->title, ucfirst(str_replace('_', ' ', $x->status)), '/complaints?q='.urlencode($x->ticket_no), $x->id);
            }
        }
        if ($u->canView('events')) {
            $e = Event::where(fn ($w) => $w->where('title', 'like', $like)->orWhere('code', 'like', $like));
            if ($own) {
                $e->where('requested_by', $u->id);
            }
            foreach ($e->latest('id')->limit(5)->get() as $x) {
                $add('Event', $x->title, $x->date->format('d M Y').' · '.$x->venue, '/events?q='.urlencode($x->code ?: $x->title), $x->id);
            }
        }
        if ($u->canView('noc')) {
            $n = Noc::where('reference', 'like', $like);
            if ($own) {
                $n->where('user_id', $u->id);
            }
            foreach ($n->limit(4)->get() as $x) {
                $add('NOC', $x->reference, ucfirst(str_replace('_', ' ', $x->status)), '/noc?q='.urlencode($x->reference), $x->id);
            }
        }
        if ($u->canView('library')) {
            foreach (Book::where(fn ($w) => $w->where('title', 'like', $like)->orWhere('author', 'like', $like)->orWhere('isbn', 'like', $like))->limit(5)->get() as $x) {
                $add('Book', $x->title, $x->author.' · '.$x->available.'/'.$x->copies.' available', '/library?q='.urlencode($x->title), $x->id);
            }
        }
        if ($u->canView('crm')) {
            foreach (Employee::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('code', 'like', $like))->limit(4)->get() as $x) {
                $add('Employee', $x->name, $x->code.' · '.$x->department, '/crm?q='.urlencode($x->code), $x->id);
            }
        }
        if ($u->canManage('gym')) {
            foreach (GymMember::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('member_no', 'like', $like)->orWhere('rfid_card', 'like', $like))->limit(4)->get() as $x) {
                $add('Gym member', $x->name, $x->member_no.' · till '.$x->end_date->format('d M Y'), '/gym?q='.urlencode($x->member_no), $x->id);
            }
        }

        return $out;
    }
}
