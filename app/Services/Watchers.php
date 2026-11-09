<?php

namespace App\Services;

use App\Models\Event;
use App\Models\GymMember;
use App\Models\Visitor;
use App\Models\VisitorPass;
use App\Support\Activity;
use App\Support\Settings;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Time-based checks that would normally need a cron job. They run on the live poll, throttled,
 * so they work on shared hosting.
 */
class Watchers
{
    public static function run(): void
    {
        if (! Cache::add('watchers-lock', 1, 20)) {
            return;
        }
        self::events();
        self::visitors();
        self::passes();
        if (Cache::add('watchers-daily-'.now()->toDateString(), 1, 90000)) {
            self::gymDues();
        }
    }

    public static function endAt(Event $event): Carbon
    {
        $date = $event->date->toDateString();
        $start = Carbon::parse($date.' '.$event->start_time);
        $end = Carbon::parse($date.' '.$event->end_time);

        return $end->lessThanOrEqualTo($start) ? $end->addDay() : $end;
    }

    /** Configurable event alerts: warning before end → organizer at end → security after grace. */
    private static function events(): void
    {
        $now = now();
        $warn = (int) Settings::get('event_warning_minutes');
        $events = Event::where('status', 'approved')
            ->whereDate('date', '>=', $now->copy()->subDay()->toDateString())
            ->whereDate('date', '<=', $now->toDateString())
            ->whereNull('end_alerted_at')->get();

        foreach ($events as $event) {
            $end = self::endAt($event);
            $grace = $event->grace_minutes ?? (int) Settings::get('event_grace_minutes');
            $label = "{$event->title} ({$event->code}) at {$event->venue}";

            if (! $event->last_hour_alerted_at && $now->greaterThanOrEqualTo($end->copy()->subMinutes($warn)) && $now->lessThan($end)) {
                Activity::alertModule('security', 2, "{$warn} min left — {$event->title}", "{$label} must end by ".$end->format('h:i A').'.', 'warning', '/events');
                Activity::alertUser($event->requested_by, 'events', "Your event ends in {$warn} minutes", $event->title.' must end by '.$end->format('h:i A'), 'warning', '/events');
                $event->forceFill(['last_hour_alerted_at' => $now])->save();
            }
            if (! $event->organizer_alerted_at && $now->greaterThanOrEqualTo($end)) {
                Activity::alertUser($event->requested_by, 'events', 'Event time is over — '.$event->title, 'Please wrap up within '.$grace.' minutes.', 'danger', '/events');
                $event->forceFill(['organizer_alerted_at' => $now, 'last_hour_alerted_at' => $event->last_hour_alerted_at ?? $now])->save();
            }
            if ($now->greaterThanOrEqualTo($end->copy()->addMinutes($grace))) {
                Activity::alertModule('security', 2, '⏰ Event overtime — '.$event->title,
                    "{$label} passed its time (".$end->format('h:i A')." + {$grace} min grace). Security please ensure closure.", 'danger', '/events');
                Activity::alertModule('events', 3, 'Event overtime — '.$event->title, $label, 'warning', '/events');
                $event->forceFill(['end_alerted_at' => $now])->save();
            }
        }
    }

    /** Visitors staying past their allowed time; gate requests nobody answered. */
    private static function visitors(): void
    {
        foreach (Visitor::with('house')->where('status', 'inside')->whereNull('overstay_alerted_at')->whereNotNull('expected_exit_at')->where('expected_exit_at', '<', now())->limit(50)->get() as $v) {
            $where = $v->house ? ' at '.$v->house->label : '';
            Activity::alertModule('security', 2, 'Overstay: '.$v->name, "Allowed until ".$v->expected_exit_at->format('h:i A').$where.'. Please verify.', 'warning', '/security');
            Activity::alertHouse($v->house_id, 'security', 'Your visitor is overstaying', $v->name.' was allowed until '.$v->expected_exit_at->format('h:i A'), 'warning', '/security');
            $v->forceFill(['overstay_alerted_at' => now()])->save();
        }
        $timeout = (int) Settings::get('visitor_approval_timeout_minutes');
        foreach (Visitor::where('status', 'awaiting')->whereNull('overstay_alerted_at')->where('created_at', '<', now()->subMinutes($timeout))->limit(50)->get() as $v) {
            Activity::alertModule('security', 2, 'No response from household: '.$v->name, "Waiting for {$timeout}+ minutes. Call the resident or decide at the gate.", 'warning', '/security');
            $v->forceFill(['overstay_alerted_at' => now()])->save();
        }
    }

    private static function passes(): void
    {
        VisitorPass::where('status', 'active')->where('valid_until', '<', now())->update(['status' => 'expired']);
    }

    /** Daily: remind gym members whose subscription ends soon or has ended. */
    private static function gymDues(): void
    {
        $days = (int) Settings::get('gym_due_reminder_days');
        $members = GymMember::where('status', 'active')->whereDate('end_date', '<=', now()->addDays($days)->toDateString())
            ->where(fn ($q) => $q->whereNull('due_alerted_at')->orWhere('due_alerted_at', '<', now()->subDays(3)))->limit(200)->get();
        foreach ($members as $m) {
            $over = $m->end_date->isPast();
            $msg = $over ? 'expired on '.$m->end_date->format('d M') : 'ends on '.$m->end_date->format('d M');
            Activity::alertUser($m->user_id, 'gym', 'Gym subscription '.($over ? 'expired' : 'due soon'), "Membership {$m->member_no} {$msg}. Pay from the Gym page.", $over ? 'danger' : 'warning', '/gym');
            $m->forceFill(['due_alerted_at' => now()])->save();
        }
        if ($members->count()) {
            Activity::alertModule('gym', 2, $members->count().' gym subscriptions due', 'Members with dues within '.$days.' days', 'info', '/gym');
        }
    }
}
