<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\Alert;
use Illuminate\Database\Eloquent\Model;

/**
 * Every module action is written to the activity log, which feeds the ADH (parental) dashboard.
 */
class Activity
{
    public static function log(string $module, string $action, string $description, ?Model $subject = null): void
    {
        ActivityLog::create([
            'user_id' => auth()->id(),
            'module' => $module,
            'action' => $action,
            'description' => $description,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
        ]);
    }

    /** Send an alert to a role (or several) — picked up by the portal's live poller. */
    public static function alertRole(string|array $roles, string $module, string $title, ?string $body = null, string $level = 'info', ?string $link = null): void
    {
        foreach ((array) $roles as $role) {
            Alert::create(compact('role', 'module', 'title', 'body', 'level', 'link'));
        }
    }

    public static function alertUser(?int $userId, string $module, string $title, ?string $body = null, string $level = 'info', ?string $link = null): void
    {
        if (! $userId) {
            return;
        }
        Alert::create(['user_id' => $userId, 'module' => $module, 'title' => $title, 'body' => $body, 'level' => $level, 'link' => $link]);
    }
}
