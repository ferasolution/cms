<?php

namespace App\Support;

use App\Models\Setting;

/** Community-wide settings, editable by the Super Admin from the Settings page. */
class Settings
{
    public const DEFAULTS = [
        'community_name' => 'Community Portal',
        // ---- region (set from the country at sign-up, editable in Settings) ----
        'country' => 'US',
        'currency' => 'USD',
        'timezone' => 'America/New_York',
        'locale' => 'en-US',
        'unit_label' => 'Lot',          // what a house is called: Lot, Unit, Plot, Villa…
        'id_label' => 'ID number',      // government ID: ID number, Driver license, CNIC, Emirates ID…
        'address' => '',
        'helpline' => '',
        'visitor_max_stay_minutes' => 240,
        'visitor_approval_required' => true,
        'visitor_approval_timeout_minutes' => 10,
        'event_warning_minutes' => 60,
        'event_grace_minutes' => 15,
        'late_fee_percent' => 5,
        'library_loan_days' => 14,
        'library_fine_per_day' => 1,
        'gym_due_reminder_days' => 3,
        'payment_title' => 'Community Account',
        'payment_bank' => '',
        'payment_account' => '',
        'payment_iban' => '',
        'payment_wallet' => '',
        'work_day_minutes' => 480,
        'late_grace_minutes' => 10,
        'emergency_contacts' => "Emergency (police, fire, ambulance) 911\nPoison Control 1-800-222-1222\nNon-emergency police 311",
        // ---- automations ----
        'auto_complaint_assign' => true,
        'complaint_workers' => "plumbing = Mike Reynolds (Plumber) | (512) 555-0101\nelectrical = Dave Carter (Electrician) | (512) 555-0102\ncleaning = Janitorial Team | (512) 555-0103\ngardening = Luis Moreno (Landscaping) | (512) 555-0104\nconstruction = Maintenance Team | (512) 555-0105",
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
        // ---- security suite ----
        'gate_names' => "Main Gate\nGate 2",
        'gate_receipt_footer' => 'Keep this slip. Show the QR code at the gate when leaving.',
        'shift_slots' => "morning = 07:00-15:00\nevening = 15:00-23:00\nnight = 23:00-07:00",
        'shift_posts' => "Main Gate\nGate 2\nPatrol\nControl Room",
        'shift_late_minutes' => 15,
        'shift_alerts' => true,
        'patrol_interval_minutes' => 120,
        'patrol_alerts' => true,
        'staff_schedule_alerts' => true,
        'staff_notify_household' => true,
    ];

    /** per-society cache for this request */
    private static array $cache = [];

    public static function flush(): void
    {
        self::$cache = [];
    }

    public static function all(): array
    {
        $k = Tenant::id() ?? 0;

        return self::$cache[$k] ??= array_replace(self::DEFAULTS, Setting::get('community', []) ?: []);
    }

    public static function get(string $key)
    {
        return self::all()[$key] ?? null;
    }

    /** Region presets used when a society signs up from a country. */
    public const REGIONS = [
        'US' => ['USD', 'America/New_York', 'en-US', 'Lot', 'ID number', "Emergency (police, fire, ambulance) 911\nPoison Control 1-800-222-1222\nNon-emergency police 311"],
        'CA' => ['CAD', 'America/Toronto', 'en-CA', 'Lot', 'ID number', "Emergency 911\nPoison Centre 1-844-764-7669"],
        'GB' => ['GBP', 'Europe/London', 'en-GB', 'Plot', 'ID number', "Emergency 999\nNon-emergency police 101\nNHS 111"],
        'AU' => ['AUD', 'Australia/Sydney', 'en-AU', 'Lot', 'ID number', "Emergency 000\nPolice assistance 131 444"],
        'AE' => ['AED', 'Asia/Dubai', 'en-AE', 'Villa', 'Emirates ID', "Police 999\nAmbulance 998\nFire 997"],
        'SA' => ['SAR', 'Asia/Riyadh', 'en-SA', 'Villa', 'National ID', "Police 999\nAmbulance 997\nCivil Defense 998"],
        'QA' => ['QAR', 'Asia/Qatar', 'en-QA', 'Villa', 'QID', "Emergency 999"],
        'PK' => ['PKR', 'Asia/Karachi', 'en-PK', 'Plot', 'CNIC', "Rescue 1122\nFire Brigade 16\nPolice 15\nEdhi Ambulance 115"],
        'IN' => ['INR', 'Asia/Kolkata', 'en-IN', 'Plot', 'Aadhaar / ID', "Emergency 112\nPolice 100\nAmbulance 108"],
    ];

    public static function region(string $country): array
    {
        [$cur, $tz, $loc, $unit, $id, $sos] = self::REGIONS[strtoupper($country)] ?? ['USD', 'UTC', 'en-US', 'Unit', 'ID number', 'Emergency 112'];

        return ['country' => strtoupper($country), 'currency' => $cur, 'timezone' => $tz, 'locale' => $loc, 'unit_label' => $unit, 'id_label' => $id, 'emergency_contacts' => $sos];
    }

    private const SYMBOLS = ['USD' => '$', 'CAD' => 'CA$', 'AUD' => 'A$', 'GBP' => '£', 'EUR' => '€', 'PKR' => 'Rs ', 'INR' => '₹', 'AED' => 'AED ', 'SAR' => 'SAR ', 'QAR' => 'QAR '];

    /** Amount in the society's currency, e.g. "$1,250" or "Rs 3,000". */
    public static function money($amount): string
    {
        $c = self::get('currency') ?: 'USD';

        return (self::SYMBOLS[$c] ?? $c.' ').number_format((float) $amount);
    }

    public static function unit(): string
    {
        return self::get('unit_label') ?: 'Lot';
    }

    public static function idLabel(): string
    {
        return self::get('id_label') ?: 'ID number';
    }

    public static function save(array $values): array
    {
        $clean = array_intersect_key($values, self::DEFAULTS);
        Setting::put('community', array_replace(Setting::get('community', []) ?: [], $clean));
        self::flush();

        return self::all();
    }
}
