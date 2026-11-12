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
        if (! Cache::add(\App\Support\Tenant::key('watchers-lock'), 1, 15)) {
            return;
        }
        Automations::run();
        self::passes();
    }

    public static function endAt(Event $event): Carbon
    {
        $date = $event->date->toDateString();
        $start = Carbon::parse($date.' '.$event->start_time);
        $end = Carbon::parse($date.' '.$event->end_time);

        return $end->lessThanOrEqualTo($start) ? $end->addDay() : $end;
    }

    /** Configurable event alerts: warning before end → organizer at end → security after grace. */
    public static function events(): void
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

    private static function passes(): void
    {
        VisitorPass::where('status', 'active')->where('valid_until', '<', now())->update(['status' => 'expired']);
    }

    /** Daily: remind gym members whose subscription ends soon or has ended. */
    public static function gymDues(): void
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
