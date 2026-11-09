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
