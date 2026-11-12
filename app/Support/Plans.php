<?php

namespace App\Support;

/** Subscription plans: which modules a society gets and how many houses. Prices in PKR / month. */
class Plans
{
    public const PLANS = [
        'basic' => ['name' => 'Basic', 'price' => 15000, 'max_houses' => 150,
            'modules' => ['security', 'complaints', 'announcements', 'emergency', 'finance', 'events', 'users', 'settings']],
        'pro' => ['name' => 'Pro', 'price' => 35000, 'max_houses' => 600,
            'modules' => ['security', 'complaints', 'announcements', 'emergency', 'finance', 'events', 'users', 'settings', 'noc', 'records', 'inventory', 'library', 'crm']],
        'enterprise' => ['name' => 'Enterprise', 'price' => 75000, 'max_houses' => null, 'modules' => '*'],
    ];

    public static function get(?string $key): array
    {
        return self::PLANS[$key] ?? self::PLANS['pro'];
    }
}
