<?php

namespace App\Support;

/**
 * Subscription plans: which modules a community gets and how many homes. Prices in USD / month.
 * The platform owner can change names, prices, limits and modules in the console; those
 * overrides sit on top of these defaults.
 */
class Plans
{
    public const DEFAULTS = [
        'basic' => ['name' => 'Starter', 'price' => 99, 'max_houses' => 150, 'tagline' => 'For small communities getting the gate and dues in order.',
            'modules' => ['security', 'complaints', 'announcements', 'emergency', 'finance', 'events', 'users', 'settings']],
        'pro' => ['name' => 'Pro', 'price' => 249, 'max_houses' => 600, 'tagline' => 'The full office for a growing community.',
            'modules' => ['security', 'complaints', 'announcements', 'emergency', 'finance', 'events', 'users', 'settings', 'noc', 'records', 'inventory', 'library', 'crm']],
        'enterprise' => ['name' => 'Enterprise', 'price' => 499, 'max_houses' => null, 'tagline' => 'Every module, any size, priority onboarding.', 'modules' => '*'],
    ];

    /** @deprecated use all(); kept so older code paths keep working */
    public const PLANS = self::DEFAULTS;

    public static function all(): array
    {
        $over = (array) Platform::get('plans', []);
        $out = [];
        foreach (self::DEFAULTS as $k => $p) {
            $out[$k] = array_replace($p, array_intersect_key((array) ($over[$k] ?? []), array_flip(['name', 'price', 'max_houses', 'modules', 'tagline'])));
        }

        return $out;
    }

    public static function get(?string $key): array
    {
        $all = self::all();

        return $all[$key] ?? $all['pro'];
    }

    public static function keys(): array
    {
        return array_keys(self::DEFAULTS);
    }
}
