<?php

namespace App\Support;

use App\Models\Setting;

/** Community-wide settings, editable by the Super Admin from the Settings page. */
class Settings
{
    public const DEFAULTS = [
        'community_name' => 'Community Portal',
        'address' => '',
        'helpline' => '',
        'visitor_max_stay_minutes' => 240,
        'visitor_approval_required' => true,
        'visitor_approval_timeout_minutes' => 10,
        'event_warning_minutes' => 60,
        'event_grace_minutes' => 15,
        'late_fee_percent' => 5,
        'library_loan_days' => 14,
        'library_fine_per_day' => 20,
        'gym_due_reminder_days' => 3,
        'payment_title' => 'Community Account',
        'payment_bank' => '',
        'payment_account' => '',
        'payment_iban' => '',
        'payment_wallet' => '',
        'work_day_minutes' => 480,
        'late_grace_minutes' => 10,
        'emergency_contacts' => "Rescue 1122\nFire Brigade 16\nPolice 15\nEdhi Ambulance 115",
        // ---- automations ----
        'auto_complaint_assign' => true,
        'complaint_workers' => "plumbing = Akram (Plumber) | 0300-1112233\nelectrical = Javed (Electrician) | 0300-2223344\ncleaning = Sweeper Team | 0300-3334455\ngardening = Rafiq (Gardener) | 0300-4445566\nconstruction = Maintenance Team | 0300-5556677",
        'complaint_escalate_hours' => 4,
        'visitor_auto_reject' => false,
        'event_auto_close' => true,
        'maintenance_reminders' => true,
        'maintenance_due_day' => 10,
        'library_reminders' => true,
        'inventory_reminders' => true,
        'gym_auto_block_days' => 7,
        'staff_absent_alert' => true,
        'staff_auto_checkout_hours' => 4,
        'noc_sla_days' => 3,
        'daily_digest' => true,
        'leave_auto_status' => true,
    ];

    private static ?array $cache = null;

    public static function all(): array
    {
        return self::$cache ??= array_replace(self::DEFAULTS, Setting::get('community', []) ?: []);
    }

    public static function get(string $key)
    {
        return self::all()[$key] ?? null;
    }

    public static function save(array $values): array
    {
        $clean = array_intersect_key($values, self::DEFAULTS);
        Setting::put('community', array_replace(Setting::get('community', []) ?: [], $clean));
        self::$cache = null;

        return self::all();
    }
}
