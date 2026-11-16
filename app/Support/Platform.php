<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Platform-wide settings and the console's audit trail. Settings live in settings rows with
 * society_id NULL (outside any community), cached per request.
 */
class Platform
{
    public const DEFAULTS = [
        'brand_name' => 'Fera Community Cloud',
        'support_email' => '',
        'trial_days' => 14,
        'registration_open' => true,
        'default_country' => 'US',
        'require_card_after_trial' => true,
    ];

    private static array $cache = [];

    public static function get(string $key, $default = null)
    {
        if (! array_key_exists($key, self::$cache)) {
            $raw = DB::table('settings')->whereNull('society_id')->where('key', $key)->value('value');
            self::$cache[$key] = $raw === null ? null : json_decode($raw, true);
        }

        return self::$cache[$key] ?? $default;
    }

    public static function put(string $key, $value): void
    {
        DB::table('settings')->updateOrInsert(['society_id' => null, 'key' => $key], ['value' => json_encode($value)]);
        self::$cache[$key] = $value;
    }

    public static function reset(): void
    {
        self::$cache = [];
    }

    public static function settings(): array
    {
        return array_replace(self::DEFAULTS, (array) self::get('platform', []));
    }

    public static function setting(string $k)
    {
        return self::settings()[$k] ?? null;
    }

    /** Write one line to the console audit trail. */
    public static function audit(string $action, string $description, ?int $societyId = null, array $meta = []): void
    {
        $u = auth()->user();
        DB::table('platform_audit')->insert([
            'user_id' => $u?->id, 'user_name' => $u?->name ?? 'system', 'society_id' => $societyId, 'action' => $action,
            'description' => mb_substr($description, 0, 500), 'meta' => $meta ? json_encode($meta) : null, 'ip' => request()?->ip(), 'created_at' => now(),
        ]);
    }
}
