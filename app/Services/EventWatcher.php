<?php

namespace App\Services;

use App\Models\Event;
use App\Support\Activity;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class EventWatcher
{
    /** Raise "last hour started" and "time over" alerts for today's approved events. Throttled to once per 20s. */
    public static function check(): void
    {
        if (! Cache::add('event-watcher-lock', 1, 20)) {
            return;
        }
        $now = now();
        $events = Event::where('status', 'approved')
            ->whereDate('date', '>=', $now->copy()->subDay()->toDateString())
            ->whereDate('date', '<=', $now->toDateString())
            ->whereNull('end_alerted_at')
            ->get();

        foreach ($events as $event) {
            $end = self::endAt($event);
            $label = "{$event->title} ({$event->code}) at {$event->venue}";

            if ($now->greaterThanOrEqualTo($end)) {
                Activity::alertRole(['security', 'manager'], 'events', '⏰ Event time over — '.$event->title,
                    "{$label} has passed its permitted time (".$end->format('h:i A').'). Security please ensure closure.', 'danger', '/events');
                $event->forceFill(['end_alerted_at' => $now, 'last_hour_alerted_at' => $event->last_hour_alerted_at ?? $now])->save();
            } elseif (! $event->last_hour_alerted_at && $now->greaterThanOrEqualTo($end->copy()->subHour())) {
                Activity::alertRole('security', 'events', 'Last hour started — '.$event->title,
                    "{$label} must end by ".$end->format('h:i A').'.', 'warning', '/events');
                $event->forceFill(['last_hour_alerted_at' => $now])->save();
            }
        }
    }

    public static function endAt(Event $event): Carbon
    {
        $date = $event->date->toDateString();
        $start = Carbon::parse($date.' '.$event->start_time);
        $end = Carbon::parse($date.' '.$event->end_time);

        return $end->lessThanOrEqualTo($start) ? $end->addDay() : $end; // events running past midnight
    }
}
