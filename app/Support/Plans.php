<?php

namespace App\Support;

/** Subscription plans: which modules a society gets and how many houses. Prices in USD / month. */
class Plans
{
    public const PLANS = [
        'basic' => ['name' => 'Starter', 'price' => 99, 'max_houses' => 150,
            'modules' => ['security', 'complaints', 'announcements', 'emergency', 'finance', 'events', 'users', 'settings']],
        'pro' => ['name' => 'Pro', 'price' => 249, 'max_houses' => 600,
            'modules' => ['security', 'complaints', 'announcements', 'emergency', 'finance', 'events', 'users', 'settings', 'noc', 'records', 'inventory', 'library', 'crm']],
        'enterprise' => ['name' => 'Enterprise', 'price' => 499, 'max_houses' => null, 'modules' => '*'],
    ];

    public static function get(?string $key): array
    {
        return self::PLANS[$key] ?? self::PLANS['pro'];
    }
}
