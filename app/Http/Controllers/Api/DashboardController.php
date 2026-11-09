<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Book;
use App\Models\BookIssue;
use App\Models\Complaint;
use App\Models\Event;
use App\Models\ExpenseRequest;
use App\Models\House;
use App\Models\InventoryIssue;
use App\Models\InventoryItem;
use App\Models\Noc;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Visitor;
use App\Support\Access;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $u = $request->user();
        $cards = [];
        $today = now()->toDateString();

        if ($u->canView('security') ) {
            $cards[] = ['module' => 'security', 'label' => 'Visitors inside now', 'value' => Visitor::whereNull('exit_at')->whereNotNull('entry_at')->count(), 'sub' => Visitor::whereDate('entry_at', $today)->count().' entries today'];
        }
        if ($u->canManage('inventory')) {
            $low = InventoryItem::whereColumn('quantity', '<=', 'min_quantity')->count();
            $cards[] = ['module' => 'inventory', 'label' => 'Items issued out', 'value' => InventoryIssue::whereNull('returned_at')->count(), 'sub' => $low.' items low on stock', 'warn' => $low > 0];
        }
        if ($u->canManage('library')) {
            $cards[] = ['module' => 'library', 'label' => 'Book requests', 'value' => BookIssue::where('status', 'requested')->count(), 'sub' => BookIssue::where('status', 'issued')->count().' books out · '.Book::sum('copies').' total'];
        } elseif ($u->canView('library')) {
            $cards[] = ['module' => 'library', 'label' => 'My books', 'value' => BookIssue::where('user_id', $u->id)->where('status', 'issued')->count(), 'sub' => BookIssue::where('user_id', $u->id)->where('status', 'requested')->count().' pending requests'];
        }
        if ($u->canManage('finance')) {
            $month = now()->format('Y-m');
            $rev = Transaction::where('type', 'revenue')->whereBetween('date', [now()->startOfMonth(), now()->endOfMonth()])->sum('amount');
            $exp = Transaction::whereIn('type', ['expense', 'salary'])->whereBetween('date', [now()->startOfMonth(), now()->endOfMonth()])->sum('amount');
            $paid = Transaction::where('category', 'maintenance')->where('period', $month)->distinct('house_id')->count('house_id');
            $cards[] = ['module' => 'finance', 'label' => 'Revenue this month', 'value' => (float) $rev, 'money' => true, 'sub' => 'Expenses Rs '.number_format($exp).' · '.$paid.'/'.House::count().' maintenance paid'];
        }
        if ($u->canView('events')) {
            $q = Event::query();
            if ($u->isResident()) {
                $q->where('requested_by', $u->id);
            }
            $cards[] = ['module' => 'events', 'label' => $u->isResident() ? 'My events' : 'Events today', 'value' => $u->isResident() ? (clone $q)->count() : Event::whereDate('date', $today)->where('status', 'approved')->count(), 'sub' => (clone $q)->where('status', 'pending')->count().' pending approval'];
        }
        if ($u->canView('complaints')) {
            $q = Complaint::query();
            if ($u->isResident()) {
                $q->where('user_id', $u->id);
            }
            $cards[] = ['module' => 'complaints', 'label' => 'Open complaints', 'value' => (clone $q)->whereIn('status', ['open', 'assigned', 'in_progress'])->count(), 'sub' => (clone $q)->where('status', 'resolved')->count().' resolved'];
        }
        if ($u->canView('noc')) {
            $q = Noc::query();
            if ($u->isResident()) {
                $q->where('user_id', $u->id);
            }
            $cards[] = ['module' => 'noc', 'label' => 'NOCs in process', 'value' => (clone $q)->whereNotIn('status', ['completed', 'rejected'])->count(), 'sub' => (clone $q)->where('status', 'completed')->count().' completed'];
        }

        $data = ['cards' => $cards];

        if ($u->canManage('finance')) {
            $data['finance_chart'] = collect(range(5, 0))->map(function ($m) {
                $d = now()->startOfMonth()->subMonths($m);
                $range = [$d->copy()->startOfMonth(), $d->copy()->endOfMonth()];

                return [
                    'month' => $d->format('M'),
                    'revenue' => (float) Transaction::where('type', 'revenue')->whereBetween('date', $range)->sum('amount'),
                    'expense' => (float) Transaction::whereIn('type', ['expense', 'salary'])->whereBetween('date', $range)->sum('amount'),
                ];
            })->values();
        }

        if ($u->isAdmin()) {
            $data['pending'] = [
                'expense_requests' => ExpenseRequest::where('status', 'pending')->count(),
                'events' => Event::where('status', 'pending')->count(),
                'complaints' => Complaint::where('status', 'open')->count(),
                'nocs' => Noc::whereIn('status', ['submitted', 'under_review'])->count(),
            ];
            $data['people'] = ['houses' => House::count(), 'residents' => User::where('role', 'resident')->count(), 'staff' => User::where('role', '!=', 'resident')->count()];
        }

        $feed = ActivityLog::with('user:id,name,role')->latest('id')->limit(15);
        if (! $u->isAdmin()) {
            $mods = collect(Access::modulesFor($u))->where('manage', true)->pluck('key');
            $feed->where(fn ($q) => $q->whereIn('module', $mods)->orWhere('user_id', $u->id));
        }
        $data['activity'] = $feed->get();

        return response()->json($data);
    }

    /** ADH parental feed: everything that happens in every module. */
    public function activity(Request $request)
    {
        $u = $request->user();
        $q = ActivityLog::with('user:id,name,role')->latest('id');
        if (! $u->isAdmin()) {
            $mods = collect(Access::modulesFor($u))->where('manage', true)->pluck('key');
            $q->where(fn ($w) => $w->whereIn('module', $mods)->orWhere('user_id', $u->id));
        }
        if ($m = $request->query('module')) {
            $q->where('module', $m);
        }

        return $this->paginate($q, $request, ['description'], 30);
    }
}
