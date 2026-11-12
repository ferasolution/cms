<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AutomationRun;
use App\Models\BookIssue;
use App\Models\Complaint;
use App\Models\Employee;
use App\Models\Event;
use App\Models\GymMember;
use App\Models\House;
use App\Models\InventoryIssue;
use App\Models\LeaveRequest;
use App\Models\Noc;
use App\Models\SosAlert;
use App\Models\Transaction;
use App\Models\Visitor;
use App\Support\Activity;
use App\Support\Settings;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Rule-based automation. Rules run from the live poll (no cron needed on shared hosting), each
 * guarded by its own throttle, and every action is counted in automation_runs for the Automation page.
 */
class Automations
{
    /** key => [title, description, settings that control it, how often it runs (seconds)] */
    public const RULES = [
        'complaint_auto_assign' => ['Auto-assign complaints', 'New complaints are assigned to the default worker for their category and the worker / resident are informed.', ['auto_complaint_assign', 'complaint_workers'], 0],
        'complaint_escalation' => ['Escalate slow complaints', 'Complaints still open or not resolved after the set hours are escalated to admins and the complaint manager.', ['complaint_escalate_hours'], 300],
        'visitor_timeout' => ['Gate approval timeout', 'If a household does not answer in time, the gate is alerted — or the visitor is rejected automatically.', ['visitor_approval_timeout_minutes', 'visitor_auto_reject'], 20],
        'overstay' => ['Overstay alerts', 'Visitors who stay past their allowed time raise an alert at the gate and for the household.', ['visitor_max_stay_minutes'], 20],
        'event_timing' => ['Event time alerts', 'Warning before the end, organiser alert at the end, alarm at the gate after the grace period.', ['event_warning_minutes', 'event_grace_minutes'], 20],
        'event_auto_close' => ['Close finished events', 'Approved events are marked completed automatically a few hours after they end.', ['event_auto_close'], 600],
        'maintenance_reminders' => ['Maintenance reminders', 'On the 1st, every household with an unpaid bill is reminded; after the due day they get an overdue notice and finance gets the list.', ['maintenance_reminders', 'maintenance_due_day'], 3600],
        'library_reminders' => ['Library due & overdue', 'Members are reminded a day before a book is due and every 2 days while it is overdue.', ['library_reminders'], 3600],
        'inventory_reminders' => ['Inventory returns', 'Store keepers are alerted when issued items are past their return date.', ['inventory_reminders'], 3600],
        'gym_dues' => ['Gym dues & card blocking', 'Members are reminded before expiry; cards are blocked automatically after the grace days.', ['gym_due_reminder_days', 'gym_auto_block_days'], 3600],
        'staff_attendance' => ['Staff attendance', 'HR is alerted about staff not checked in after shift start; forgotten check-outs are closed automatically.', ['staff_absent_alert', 'staff_auto_checkout_hours', 'late_grace_minutes'], 600],
        'leave_status' => ['Leave status sync', 'Employees on approved leave are marked "on leave" and back to active afterwards.', ['leave_auto_status'], 3600],
        'noc_sla' => ['NOC follow-up', 'Applications with no progress for the set days are flagged to the NOC officer.', ['noc_sla_days'], 3600],
        'sos_escalation' => ['SOS escalation', 'An SOS nobody responds to within 2 minutes is re-alerted to every admin with an alarm.', [], 20],
        'guard_shifts' => ['Guard shift watch', 'If a guard has not checked in after the late minutes the supervisor is alerted and the shift is marked missed; shifts left open long after their end are flagged.', ['shift_alerts', 'shift_late_minutes'], 120],
        'patrol_coverage' => ['Patrol coverage', 'Checkpoints that no guard has scanned within the patrol interval are reported to the supervisor (once per interval).', ['patrol_alerts', 'patrol_interval_minutes'], 300],
        'domestic_staff' => ['Domestic staff watch', 'Staff still inside an hour after their working time, and staff cards about to expire, are reported to security and the household.', ['staff_schedule_alerts', 'staff_notify_household'], 900],
        'daily_digest' => ['Daily digest', 'Every morning admins get one summary: gate traffic, open complaints, dues, staff and pending approvals.', ['daily_digest'], 3600],
    ];

    public static function run(): void
    {
        foreach (self::RULES as $rule => [, , , $every]) {
            if ($every <= 0 || ! Cache::add(\App\Support\Tenant::key('auto:'.$rule), 1, $every)) {
                continue;
            }
            try {
                $n = self::{'rule_'.$rule}();
                if ($n) {
                    AutomationRun::create(['rule' => $rule, 'actions' => $n[0], 'summary' => $n[1]]);
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    private static function on(string $key): bool
    {
        return (bool) Settings::get($key);
    }

    // ---------------------------------------------------------------- complaints

    /** Parse "category = Worker name | phone" lines. */
    public static function workers(): array
    {
        $out = [];
        foreach (preg_split('/\r?\n/', (string) Settings::get('complaint_workers')) as $line) {
            if (! str_contains($line, '=')) {
                continue;
            }
            [$cat, $rest] = array_map('trim', explode('=', $line, 2));
            [$name, $phone] = array_pad(array_map('trim', explode('|', $rest, 2)), 2, null);
            if ($cat && $name) {
                $out[strtolower($cat)] = ['name' => $name, 'phone' => $phone];
            }
        }

        return $out;
    }

    public static function onComplaintCreated(Complaint $c): void
    {
        if (! self::on('auto_complaint_assign') || ! ($w = self::workers()[$c->category] ?? null)) {
            return;
        }
        $c->update(['assigned_worker' => $w['name'], 'worker_phone' => $w['phone'], 'assigned_at' => now(), 'status' => 'assigned', 'auto_assigned_rule' => $c->category]);
        Activity::log('complaints', 'assign', "Auto-assigned {$c->ticket_no} to {$w['name']} ({$c->category})", $c);
        Activity::alertUser($c->user_id, 'complaints', 'Worker assigned: '.$c->ticket_no, $w['name'].' will attend to "'.$c->title.'"', 'info', '/complaints', $c->house_id);
        AutomationRun::create(['rule' => 'complaint_auto_assign', 'actions' => 1, 'summary' => "{$c->ticket_no} → {$w['name']}"]);
    }

    private static function rule_complaint_escalation(): ?array
    {
        $h = (int) Settings::get('complaint_escalate_hours');
        if ($h <= 0) {
            return null;
        }
        $n = 0;
        $list = Complaint::with('house')->whereNull('escalated_at')->where(fn ($q) => $q->where(fn ($w) => $w->where('status', 'open')->where('created_at', '<', now()->subHours($h)))
            ->orWhere(fn ($w) => $w->whereIn('status', ['assigned', 'in_progress'])->where('created_at', '<', now()->subHours($h * 6))))->limit(50)->get();
        foreach ($list as $c) {
            $age = (int) $c->created_at->diffInHours(now());
            Activity::alertAdmins('complaints', '⏫ Escalated: '.$c->title, "{$c->ticket_no} · {$c->status} for {$age}h".($c->house ? ' · House '.$c->house->label : ''), $c->priority === 'urgent' ? 'danger' : 'warning', '/complaints?q='.$c->ticket_no, $c->house_id);
            Activity::alertModule('complaints', 3, 'Complaint overdue: '.$c->ticket_no, $c->title, 'warning', '/complaints?q='.$c->ticket_no, $c->house_id);
            $c->forceFill(['escalated_at' => now(), 'priority' => $c->priority === 'low' ? 'normal' : ($c->priority === 'normal' ? 'high' : $c->priority)])->save();
            Activity::log('complaints', 'escalate', "{$c->ticket_no} escalated automatically after {$age}h", $c);
            $n++;
        }

        return $n ? [$n, "$n complaint(s) escalated"] : null;
    }

    // ---------------------------------------------------------------- gate

    private static function rule_visitor_timeout(): ?array
    {
        $t = (int) Settings::get('visitor_approval_timeout_minutes');
        $n = 0;
        foreach (Visitor::with('house')->where('status', 'awaiting')->whereNull('overstay_alerted_at')->where('created_at', '<', now()->subMinutes($t))->limit(50)->get() as $v) {
            if (self::on('visitor_auto_reject')) {
                $v->update(['status' => 'rejected', 'responded_at' => now(), 'response_note' => "No answer from household in {$t} min — auto-rejected", 'overstay_alerted_at' => now()]);
                Activity::alertModule('security', 2, '⛔ Auto-rejected: '.$v->name, "No answer from House {$v->house?->label} in {$t} min", 'danger', '/security', $v->house_id);
                Activity::log('security', 'rejected', "{$v->name} auto-rejected — no answer in {$t} min", $v);
            } else {
                Activity::alertModule('security', 2, 'No response from household: '.$v->name, "Waiting {$t}+ min for House {$v->house?->label}. Call the resident or decide at the gate.", 'warning', '/security?tab=approvals', $v->house_id);
                $v->forceFill(['overstay_alerted_at' => now()])->save();
            }
            $n++;
        }

        return $n ? [$n, "$n gate request(s) timed out"] : null;
    }

    private static function rule_overstay(): ?array
    {
        $n = 0;
        foreach (Visitor::with('house')->where('status', 'inside')->whereNull('overstay_alerted_at')->whereNotNull('expected_exit_at')->where('expected_exit_at', '<', now())->limit(50)->get() as $v) {
            $where = $v->house ? ' at '.$v->house->label : '';
            Activity::alertModule('security', 2, 'Overstay: '.$v->name, 'Allowed until '.$v->expected_exit_at->format('h:i A').$where.'. Please verify.', 'warning', '/security', $v->house_id);
            Activity::alertHouse($v->house_id, 'security', 'Your visitor is overstaying', $v->name.' was allowed until '.$v->expected_exit_at->format('h:i A'), 'warning', '/security');
            $v->forceFill(['overstay_alerted_at' => now()])->save();
            $n++;
        }

        return $n ? [$n, "$n overstay alert(s)"] : null;
    }

    // ---------------------------------------------------------------- guards, patrol, domestic staff

    private static function rule_guard_shifts(): ?array
    {
        if (! self::on('shift_alerts')) {
            return null;
        }
        $n = 0;
        $late = (int) Settings::get('shift_late_minutes');
        foreach (\App\Models\GuardShift::where('status', 'scheduled')->whereNull('missed_alerted_at')->where('starts_at', '<', now()->subMinutes($late))->where('ends_at', '>', now()->subHours(12))->get() as $sh) {
            $sh->forceFill(['status' => 'missed', 'missed_alerted_at' => now()])->save();
            Activity::alertModule('security', 3, '⚠ Guard not on duty: '.$sh->guard_name, $sh->post.' · shift started '.$sh->starts_at->format('h:i A').' — no check-in.', 'danger', '/security?tab=shifts');
            Activity::alertUser($sh->user_id, 'security', 'You have not checked in', $sh->post.' duty started at '.$sh->starts_at->format('h:i A'), 'warning', '/security?tab=shifts');
            $n++;
        }
        foreach (\App\Models\GuardShift::where('status', 'on_duty')->where('ends_at', '<', now()->subHours(2))->get() as $sh) {
            if (! Cache::add(\App\Support\Tenant::key('shift-open-'.$sh->id), 1, 6 * 3600)) {
                continue;
            }
            Activity::alertModule('security', 3, 'Shift not handed over: '.$sh->guard_name, $sh->post.' ended '.$sh->ends_at->format('h:i A').' — still open.', 'warning', '/security?tab=shifts');
            $n++;
        }

        return $n ? [$n, "$n guard shift alert(s)"] : null;
    }

    private static function rule_patrol_coverage(): ?array
    {
        $interval = (int) Settings::get('patrol_interval_minutes');
        if (! self::on('patrol_alerts') || $interval <= 0 || ! \App\Models\GuardShift::where('status', 'on_duty')->exists()) {
            return null;   // only while guards are on duty
        }
        $missed = \App\Models\PatrolCheckpoint::where('active', true)->with('lastScan')->get()
            ->filter(fn ($c) => ! $c->lastScan || $c->lastScan->scanned_at->lt(now()->subMinutes($interval)));
        if ($missed->isEmpty() || ! Cache::add(\App\Support\Tenant::key('patrol-gap'), 1, $interval * 60)) {
            return null;
        }
        Activity::alertModule('security', 3, 'Patrol overdue at '.$missed->count().' checkpoint(s)', $missed->pluck('name')->take(6)->implode(', ').' — not checked in the last '.$interval.' min.', 'warning', '/security?tab=patrol');

        return [1, 'Patrol overdue: '.$missed->count().' checkpoint(s)'];
    }

    private static function rule_domestic_staff(): ?array
    {
        if (! self::on('staff_schedule_alerts')) {
            return null;
        }
        $n = 0;
        foreach (\App\Models\StaffEntry::with('staff', 'house')->whereNull('exit_at')->where('entry_at', '<', now()->subHour())->get() as $e) {
            $s = $e->staff;
            if (! $s || ! $s->time_to) {
                continue;
            }
            $end = Carbon::parse($e->entry_at->toDateString().' '.substr($s->time_to, 0, 5));
            if ($s->time_from && $s->time_to < $s->time_from) {
                $end->addDay();
            }
            if (now()->lt($end->copy()->addHour()) || ! Cache::add(\App\Support\Tenant::key('ds-over-'.$e->id), 1, 12 * 3600)) {
                continue;
            }
            Activity::alertModule('security', 2, ucfirst($s->type).' still inside: '.$s->name, 'Working time ended '.$end->format('h:i A').($e->house ? ' · '.\App\Support\Settings::unit().' '.$e->house->label : ''), 'warning', '/security?tab=staff', $e->house_id);
            if (Settings::get('staff_notify_household')) {
                Activity::alertHouse($e->house_id, 'security', $s->name.' has not left yet', 'Working time ended at '.$end->format('h:i A').'.', 'info', '/security?tab=staff');
            }
            $n++;
        }
        foreach (\App\Models\DomesticStaff::where('active', true)->whereNotNull('valid_until')->whereBetween('valid_until', [today(), today()->addDays(7)])->get() as $s) {
            if (! Cache::add(\App\Support\Tenant::key('ds-exp-'.$s->id), 1, 3 * 86400)) {
                continue;
            }
            Activity::alertHouse($s->house_id, 'security', 'Staff card expiring: '.$s->name, 'Valid until '.$s->valid_until->format('d M Y').'. Renew it under Security → Domestic staff.', 'warning', '/security?tab=staff');
            $n++;
        }

        return $n ? [$n, "$n domestic staff alert(s)"] : null;
    }

    private static function rule_sos_escalation(): ?array
    {
        $n = 0;
        foreach (SosAlert::with('house', 'user')->where('status', 'active')->where('created_at', '<', now()->subMinutes(2))->get() as $s) {
            if (! Cache::add(\App\Support\Tenant::key('sos-esc-'.$s->id), 1, 3600)) {
                continue;
            }
            Activity::alertAdmins('emergency', '🆘 NO RESPONSE to SOS — '.($s->user?->name ?? ''), 'House '.($s->house?->label ?? '?').' · '.strtoupper($s->type).' · raised '.$s->created_at->diffForHumans(), 'danger', '/emergency?sos='.$s->id, $s->house_id);
            $n++;
        }

        return $n ? [$n, "$n unanswered SOS escalated"] : null;
    }

    // ---------------------------------------------------------------- events

    private static function rule_event_timing(): ?array
    {
        $before = \App\Models\Alert::count();
        Watchers::events();

        return ($d = \App\Models\Alert::count() - $before) ? [$d, "$d event timing alert(s)"] : null;
    }

    private static function rule_event_auto_close(): ?array
    {
        if (! self::on('event_auto_close')) {
            return null;
        }
        $n = 0;
        foreach (Event::where('status', 'approved')->whereDate('date', '<=', now()->toDateString())->get() as $e) {
            if (now()->greaterThan(Watchers::endAt($e)->addHours(3))) {
                $e->update(['status' => 'completed', 'closed_at' => now()]);
                Activity::log('events', 'completed', "Event \"{$e->title}\" closed automatically", $e);
                $n++;
            }
        }

        return $n ? [$n, "$n event(s) closed"] : null;
    }

    // ---------------------------------------------------------------- money

    private static function rule_maintenance_reminders(): ?array
    {
        if (! self::on('maintenance_reminders')) {
            return null;
        }
        $period = now()->format('Y-m');
        $due = max(1, min(28, (int) Settings::get('maintenance_due_day')));
        $stage = now()->day >= $due ? 'overdue' : (now()->day >= 1 ? 'due' : null);
        if (! $stage || ! Cache::add(\App\Support\Tenant::key("maint-$stage-$period"), 1, 40 * 86400)) {
            return null;
        }
        $paid = Transaction::where('category', 'maintenance')->where('period', $period)->pluck('house_id')->flip();
        $unpaid = House::whereHas('residents')->where('monthly_maintenance', '>', 0)->get()->reject(fn ($h) => isset($paid[$h->id]));
        foreach ($unpaid as $h) {
            Activity::alertHouse($h->id, 'finance', $stage === 'due' ? 'Maintenance bill for '.now()->format('F') : 'Maintenance overdue', \App\Support\Settings::money($h->monthly_maintenance).($stage === 'due' ? " — please pay by the {$due}th." : ' — a late fee of '.Settings::get('late_fee_percent').'% may apply.'), $stage === 'due' ? 'info' : 'warning', '/finance');
        }
        if ($stage === 'overdue' && $unpaid->count()) {
            Activity::alertModule('finance', 2, $unpaid->count().' households have not paid maintenance', now()->format('F Y').' · '.$unpaid->take(8)->pluck('label')->join(', ').($unpaid->count() > 8 ? '…' : ''), 'warning', '/finance?tab=maintenance');
        }

        return [$unpaid->count(), $unpaid->count()." household(s) sent a {$stage} reminder"];
    }

    private static function rule_library_reminders(): ?array
    {
        if (! self::on('library_reminders')) {
            return null;
        }
        $n = 0;
        $list = BookIssue::with('book', 'user')->where('status', 'issued')->whereNotNull('due_at')->whereDate('due_at', '<=', now()->addDay()->toDateString())
            ->where(fn ($q) => $q->whereNull('reminded_at')->orWhere('reminded_at', '<', now()->subDays(2)))->limit(100)->get();
        foreach ($list as $b) {
            $late = $b->due_at->isPast() && ! $b->due_at->isToday();
            Activity::alertUser($b->user_id, 'library', $late ? 'Book overdue: '.$b->book?->title : 'Book due tomorrow: '.$b->book?->title, $late ? 'Fine '.Settings::money(Settings::get('library_fine_per_day')).' per day — please return it.' : 'Due '.$b->due_at->format('d M'), $late ? 'warning' : 'info', '/library');
            $b->forceFill(['reminded_at' => now()])->save();
            $n++;
        }

        return $n ? [$n, "$n library reminder(s)"] : null;
    }

    private static function rule_inventory_reminders(): ?array
    {
        if (! self::on('inventory_reminders')) {
            return null;
        }
        $list = InventoryIssue::with('item')->whereNull('returned_at')->whereNotNull('expected_return')->whereDate('expected_return', '<', now()->toDateString())
            ->where(fn ($q) => $q->whereNull('reminded_at')->orWhere('reminded_at', '<', now()->subDays(2)))->limit(100)->get();
        if (! $list->count()) {
            return null;
        }
        Activity::alertModule('inventory', 2, $list->count().' issued item(s) overdue', $list->take(5)->map(fn ($i) => "{$i->quantity}× {$i->item?->name} — {$i->issued_to}")->join(' · '), 'warning', '/inventory?tab=issues');
        InventoryIssue::whereIn('id', $list->pluck('id'))->update(['reminded_at' => now()]);

        return [$list->count(), $list->count().' overdue item(s) flagged'];
    }

    private static function rule_gym_dues(): ?array
    {
        $before = \App\Models\Alert::count();
        Watchers::gymDues();
        $n = \App\Models\Alert::count() - $before;
        $days = (int) Settings::get('gym_auto_block_days');
        if ($days > 0) {
            foreach (GymMember::where('status', 'active')->where('card_blocked', false)->whereDate('end_date', '<', now()->subDays($days)->toDateString())->get() as $m) {
                $m->update(['card_blocked' => true]);
                Activity::log('gym', 'blocked', "Card of {$m->name} ({$m->member_no}) blocked — unpaid for {$days}+ days", $m);
                Activity::alertUser($m->user_id, 'gym', 'Gym card blocked', 'Your subscription expired on '.$m->end_date->format('d M').'. Pay to re-activate.', 'danger', '/gym');
                $n++;
            }
        }

        return $n ? [$n, "$n gym reminder(s) / block(s)"] : null;
    }

    // ---------------------------------------------------------------- staff

    private static function rule_staff_attendance(): ?array
    {
        $n = 0;
        $today = now()->toDateString();
        $grace = (int) Settings::get('late_grace_minutes');
        if (self::on('staff_absent_alert') && Cache::add(\App\Support\Tenant::key('absent-'.$today.'-'.now()->format('H')), 1, 3700)) {
            $in = Attendance::whereDate('date', $today)->pluck('employee_id')->flip();
            $missing = Employee::where('status', 'active')->get()->filter(function ($e) use ($in, $today, $grace) {
                $start = Carbon::parse($today.' '.$e->shift_start);

                return ! isset($in[$e->id]) && now()->between($start->copy()->addMinutes($grace), $start->copy()->addMinutes($grace + 60));
            });
            if ($missing->count()) {
                Activity::alertModule('crm', 2, $missing->count().' staff not checked in', $missing->pluck('name')->join(', '), 'warning', '/crm');
                $n += $missing->count();
            }
        }
        $hrs = (int) Settings::get('staff_auto_checkout_hours');
        if ($hrs > 0) {
            foreach (Attendance::with('employee')->whereNotNull('check_in')->whereNull('check_out')->whereDate('date', '<=', $today)->get() as $a) {
                $e = $a->employee;
                if (! $e) {
                    continue;
                }
                $end = Carbon::parse($a->date->toDateString().' '.$e->shift_end);
                if ($end->lessThanOrEqualTo(Carbon::parse($a->date->toDateString().' '.$e->shift_start))) {
                    $end->addDay();
                }
                if (now()->greaterThan($end->copy()->addHours($hrs))) {
                    $a->check_out = $end;
                    $a->auto_closed = true;
                    \App\Http\Controllers\Api\CrmController::compute($a, $e);
                    $a->note = trim(($a->note ?? '').' Auto check-out at shift end (forgot to check out)');
                    $a->save();
                    Activity::log('crm', 'check_out', "{$e->name}: auto check-out at shift end", $a);
                    $n++;
                }
            }
        }

        return $n ? [$n, "$n attendance action(s)"] : null;
    }

    private static function rule_leave_status(): ?array
    {
        if (! self::on('leave_auto_status')) {
            return null;
        }
        $n = 0;
        $today = now()->toDateString();
        $onLeave = LeaveRequest::where('status', 'approved')->whereDate('from', '<=', $today)->whereDate('to', '>=', $today)->pluck('employee_id')->unique();
        $n += Employee::whereIn('id', $onLeave)->where('status', 'active')->update(['status' => 'on_leave']);
        $n += Employee::whereNotIn('id', $onLeave)->where('status', 'on_leave')->update(['status' => 'active']);

        return $n ? [$n, "$n employee status change(s)"] : null;
    }

    // ---------------------------------------------------------------- NOC / digest

    private static function rule_noc_sla(): ?array
    {
        $days = (int) Settings::get('noc_sla_days');
        if ($days <= 0) {
            return null;
        }
        $list = Noc::with('house')->whereIn('status', ['submitted', 'under_review'])->where('updated_at', '<', now()->subDays($days))
            ->where(fn ($q) => $q->whereNull('sla_alerted_at')->orWhere('sla_alerted_at', '<', now()->subDays($days)))->get();
        foreach ($list as $noc) {
            Activity::alertModule('noc', 3, 'NOC waiting: '.$noc->reference, 'No progress for '.$noc->updated_at->diffForHumans(null, true).($noc->house ? ' · House '.$noc->house->label : ''), 'warning', '/noc?q='.$noc->reference, $noc->house_id);
            $noc->forceFill(['sla_alerted_at' => now()])->saveQuietly();
        }

        return $list->count() ? [$list->count(), $list->count().' NOC(s) flagged'] : null;
    }

    private static function rule_daily_digest(): ?array
    {
        if (! self::on('daily_digest') || now()->hour < 8 || ! Cache::add(\App\Support\Tenant::key('digest-'.now()->toDateString()), 1, 90000)) {
            return null;
        }
        $y = now()->subDay();
        $parts = [
            Visitor::whereDate('created_at', $y->toDateString())->count().' visitors yesterday',
            Complaint::whereIn('status', ['open', 'assigned', 'in_progress'])->count().' open complaints',
            \App\Models\Event::whereDate('date', now()->toDateString())->where('status', 'approved')->count().' events today',
            \App\Models\ExpenseRequest::where('status', 'pending')->count().' expense approvals',
            Noc::whereIn('status', ['submitted', 'under_review'])->count().' NOCs to review',
        ];
        Activity::alertAdmins('system', '☀️ Daily digest — '.now()->format('l d M'), implode(' · ', $parts), 'info', '/');

        return [1, 'Digest sent'];
    }

    /** Status of every rule for the Automation page. */
    public static function overview(): array
    {
        $s = Settings::all();
        $stats = AutomationRun::where('created_at', '>=', now()->subDays(7))->selectRaw('rule, sum(actions) a, max(created_at) last')->groupBy('rule')->get()->keyBy('rule');
        $out = [];
        foreach (self::RULES as $key => [$title, $desc, $settings]) {
            $toggle = collect($settings)->first(fn ($k) => is_bool(Settings::DEFAULTS[$k] ?? null));
            $out[] = [
                'key' => $key, 'title' => $title, 'description' => $desc,
                'toggle' => $toggle, 'enabled' => $toggle ? (bool) $s[$toggle] : (! $settings || collect($settings)->contains(fn ($k) => (int) ($s[$k] ?? 0) > 0)),
                'settings' => collect($settings)->reject(fn ($k) => $k === $toggle)->mapWithKeys(fn ($k) => [$k => $s[$k] ?? null]),
                'actions_7d' => (int) ($stats[$key]->a ?? 0), 'last_action' => $stats[$key]->last ?? null,
            ];
        }

        return $out;
    }
}
