<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\Alert;
use Illuminate\Database\Eloquent\Model;

/**
 * Every module action is written to the activity log. The log is also the live change feed:
 * open pages poll it and refresh themselves when their module changes.
 */
class Activity
{
    public static function log(string $module, string $action, string $description, ?Model $subject = null, ?int $userId = null): void
    {
        ActivityLog::create([
            'user_id' => $userId ?? auth()->id(),
            'module' => $module,
            'action' => $action,
            'description' => $description,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
        ]);
    }

    /**
     * Alert everyone whose access to $module is at least $level (1 view, 2 edit, 3 manage).
     * Admins always qualify; level 3 on "users" means admins only.
     */
    public static function alertModule(string $module, int $level, string $title, ?string $body = null, string $level_ = 'info', ?string $link = null): void
    {
        Alert::create([
            'audience_module' => $module,
            'audience_level' => $level,
            'module' => $module === 'users' ? 'system' : $module,
            'title' => $title,
            'body' => $body,
            'level' => $level_,
            'link' => $link,
        ]);
    }

    public static function alertAdmins(string $module, string $title, ?string $body = null, string $level = 'info', ?string $link = null): void
    {
        Alert::create(['audience_module' => 'users', 'audience_level' => 3, 'module' => $module, 'title' => $title, 'body' => $body, 'level' => $level, 'link' => $link]);
    }

    public static function alertUser(?int $userId, string $module, string $title, ?string $body = null, string $level = 'info', ?string $link = null): void
    {
        if (! $userId) {
            return;
        }
        Alert::create(['user_id' => $userId, 'module' => $module, 'title' => $title, 'body' => $body, 'level' => $level, 'link' => $link]);
    }

    /** Alert every resident account linked to a house. */
    public static function alertHouse(?int $houseId, string $module, string $title, ?string $body = null, string $level = 'info', ?string $link = null): void
    {
        if (! $houseId) {
            return;
        }
        foreach (\App\Models\User::where('house_id', $houseId)->where('active', true)->pluck('id') as $id) {
            self::alertUser($id, $module, $title, $body, $level, $link);
        }
    }
}
