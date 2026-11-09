<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Announcement;
use App\Models\Attendance;
use App\Models\Book;
use App\Models\BookIssue;
use App\Models\Complaint;
use App\Models\Employee;
use App\Models\Event;
use App\Models\ExpenseRequest;
use App\Models\GymMember;
use App\Models\GymPayment;
use App\Models\House;
use App\Models\Incident;
use App\Models\InventoryIssue;
use App\Models\InventoryItem;
use App\Models\LeaveRequest;
use App\Models\Noc;
use App\Models\SosAlert;
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
        $own = $u->isResident();
        $cards = [];
        $today = now()->toDateString();
        $hid = $u->house_id ?? 0;

        if ($u->canView('security')) {
            $v = fn () => $own ? Visitor::where('house_id', $hid) : Visitor::query();
            $cards[] = ['module' => 'security', 'label' => $own ? 'My visitors inside' : 'Visitors inside now', 'value' => $v()->where('status', 'inside')->count(),
                'sub' => $v()->where('status', 'awaiting')->count().' waiting at gate · '.$v()->where('status', 'inside')->where('expected_exit_at', '<', now())->count().' overstaying',
                'warn' => $v()->where('status', 'awaiting')->count() > 0];
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
            $range = [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()];
            $rev = Transaction::where('type', 'revenue')->whereBetween('date', $range)->sum('amount');
            $exp = Transaction::whereIn('type', ['expense', 'salary'])->whereBetween('date', $range)->sum('amount');
            $paid = Transaction::where('category', 'maintenance')->where('period', now()->format('Y-m'))->distinct('house_id')->count('house_id');
            $cards[] = ['module' => 'finance', 'label' => 'Revenue this month', 'value' => (float) $rev, 'money' => true, 'sub' => 'Expenses Rs '.number_format($exp).' · '.$paid.'/'.House::count().' maintenance paid'];
        } elseif ($own && $u->house) {
            $paid = Transaction::where('house_id', $hid)->where('category', 'maintenance')->where('period', now()->format('Y-m'))->exists();
            $cards[] = ['module' => 'finance', 'label' => 'This month\'s maintenance', 'value' => $paid ? 'Paid' : 'Due', 'sub' => 'Rs '.number_format($u->house->monthly_maintenance).' / month', 'warn' => ! $paid];
        }
        if ($u->canView('events')) {
            $q = $own ? Event::where('requested_by', $u->id) : Event::query();
            $cards[] = ['module' => 'events', 'label' => $own ? 'My events' : 'Events today', 'value' => $own ? (clone $q)->count() : Event::whereDate('date', $today)->where('status', 'approved')->count(), 'sub' => (clone $q)->where('status', 'pending')->count().' pending approval'];
        }
        if ($u->canView('complaints')) {
            $q = $own ? Complaint::where('user_id', $u->id) : Complaint::query();
            $cards[] = ['module' => 'complaints', 'label' => 'Open complaints', 'value' => (clone $q)->whereIn('status', ['open', 'assigned', 'in_progress'])->count(), 'sub' => (clone $q)->where('status', 'resolved')->count().' resolved'];
        }
        if ($u->canView('noc')) {
            $q = $own ? Noc::where('user_id', $u->id) : Noc::query();
            $cards[] = ['module' => 'noc', 'label' => 'NOCs in process', 'value' => (clone $q)->whereNotIn('status', ['completed', 'rejected'])->count(), 'sub' => (clone $q)->where('status', 'completed')->count().' completed'];
        }
        if ($u->canView('crm')) {
            $staff = Employee::where('status', 'active')->count();
            $present = Attendance::whereDate('date', $today)->whereNotNull('check_in')->count();
            $cards[] = ['module' => 'crm', 'label' => 'Staff present today', 'value' => $present.' / '.$staff, 'sub' => Attendance::whereDate('date', $today)->where('late_minutes', '>', 0)->count().' late · '.LeaveRequest::where('status', 'pending')->count().' leave requests'];
        }
        if ($u->canManage('gym')) {
            $cards[] = ['module' => 'gym', 'label' => 'Active gym members', 'value' => GymMember::where('status', 'active')->whereDate('end_date', '>=', $today)->count(),
                'sub' => GymMember::where('status', 'active')->whereDate('end_date', '<', $today)->count().' expired · '.GymPayment::where('status', 'pending')->count().' payments to verify'];
        } elseif ($u->canView('gym')) {
            $m = GymMember::where('user_id', $u->id)->first();
            $cards[] = ['module' => 'gym', 'label' => 'My gym membership', 'value' => $m ? ($m->end_date->isPast() ? 'Expired' : 'Active') : '—', 'sub' => $m ? 'Valid till '.$m->end_date->format('d M Y') : 'Not a member yet', 'warn' => $m && $m->end_date->isPast()];
        }

        $data = ['cards' => $cards];

        if ($u->canManage('finance')) {
            $data['finance_chart'] = collect(range(5, 0))->map(function ($m) {
                $d = now()->startOfMonth()->subMonths($m);
                $range = [$d->copy()->startOfMonth()->toDateString(), $d->copy()->endOfMonth()->toDateString()];

                return [
                    'month' => $d->format('M'),
                    'revenue' => (float) Transaction::where('type', 'revenue')->whereBetween('date', $range)->sum('amount'),
                    'expense' => (float) Transaction::whereIn('type', ['expense', 'salary'])->whereBetween('date', $range)->sum('amount'),
                ];
            })->values();
        }
        if ($u->canView('security') && ! $own) {
            $data['gate_chart'] = collect(range(0, 23))->map(fn ($h) => ['hour' => sprintf('%02d', $h), 'entries' => 0])->all();
            foreach (Visitor::whereDate('entry_at', $today)->get(['entry_at']) as $v) {
                $data['gate_chart'][(int) $v->entry_at->format('G')]['entries']++;
            }
        }

        if ($u->isAdmin()) {
            $data['pending'] = [
                ['label' => 'Expense approvals', 'value' => ExpenseRequest::where('status', 'pending')->count(), 'to' => '/finance?tab=requests'],
                ['label' => 'Event approvals', 'value' => Event::where('status', 'pending')->count(), 'to' => '/events?tab=pending'],
                ['label' => 'Open complaints', 'value' => Complaint::where('status', 'open')->count(), 'to' => '/complaints'],
                ['label' => 'NOCs to review', 'value' => Noc::whereIn('status', ['submitted', 'under_review'])->count(), 'to' => '/noc'],
                ['label' => 'Leave requests', 'value' => LeaveRequest::where('status', 'pending')->count(), 'to' => '/crm?tab=leave'],
                ['label' => 'Gym payments', 'value' => GymPayment::where('status', 'pending')->count(), 'to' => '/gym?tab=payments'],
                ['label' => 'Open incidents', 'value' => Incident::where('status', '!=', 'resolved')->count(), 'to' => '/security?tab=incidents'],
            ];
            $data['people'] = ['houses' => House::count(), 'residents' => User::where('role', 'user')->count(), 'staff' => User::where('role', '!=', 'user')->count(),
                'online' => User::where('last_login_at', '>=', now()->subHours(12))->count()];
        }
        $data['sos'] = SosAlert::whereIn('status', ['active', 'responding'])->count();
        $data['announcements'] = Announcement::where(fn ($w) => $w->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->whereIn('audience', array_filter(['all', $own ? 'residents' : 'staff', $u->house?->block ? 'block:'.$u->house->block : null]))
            ->orderByDesc('pinned')->latest('id')->limit(3)->get(['id', 'title', 'priority', 'category', 'created_at']);

        $feed = ActivityLog::with('user:id,name,role')->latest('id')->limit(15);
        if (! $u->isAdmin()) {
            $mods = collect(Access::modulesFor($u))->where('manage', true)->pluck('key');
            $feed->where(fn ($q) => $q->whereIn('module', $mods)->orWhere('user_id', $u->id));
        }
        $data['activity'] = $feed->get();

        return response()->json($data);
    }

    /** Activity log: everything that happens in every module (admins), or the modules you manage. */
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
        if ($uid = $request->query('user_id')) {
            $q->where('user_id', $uid);
        }

        return $this->paginate($q, $request, ['description'], 30);
    }
}
