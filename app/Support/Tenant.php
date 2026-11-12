<?php

namespace App\Support;

use App\Models\Society;

/**
 * The society (tenant) the current request belongs to. Every tenant model is filtered by it
 * and new records are stamped with it. Null = platform level (console, migrations, CLI).
 */
class Tenant
{
    private static ?Society $current = null;

    /** Tables that carry a society_id column (used by the validator and the tenancy migration). */
    public const TABLES = [
        'users', 'houses', 'visitors', 'inventory_items', 'inventory_issues', 'books', 'book_issues', 'transactions', 'expense_requests',
        'events', 'complaints', 'nocs', 'noc_documents', 'noc_status_logs', 'record_files', 'activity_logs', 'alerts', 'settings',
        'announcements', 'sos_alerts', 'visitor_passes', 'vehicles', 'watchlist', 'incidents', 'employees', 'attendances', 'leave_requests',
        'tasks', 'gym_plans', 'gym_members', 'gym_payments', 'gym_checkins', 'automation_runs', 'vehicle_logs', 'domestic_staff',
        'staff_entries', 'cameras', 'patrol_checkpoints', 'patrol_rounds', 'patrol_scans', 'guard_shifts',
    ];

    public static function set(?Society $s): void
    {
        self::$current = $s;
        Settings::flush();
    }

    public static function get(): ?Society
    {
        return self::$current;
    }

    public static function id(): ?int
    {
        return self::$current?->id;
    }

    /** Cache keys are per society so throttles and locks never collide between tenants. */
    public static function key(string $k): string
    {
        return 's'.(self::id() ?? 0).':'.$k;
    }

    /** Run something inside another society (platform console, sign-up) and restore afterwards. */
    public static function run(Society $s, callable $fn)
    {
        $prev = self::$current;
        self::set($s);
        try {
            return $fn();
        } finally {
            self::set($prev);
        }
    }
}
