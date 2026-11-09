<?php

namespace App\Support;

use App\Models\User;

/**
 * Role → module permissions. "admin" is the ADH (parental) account and sees everything.
 */
class Access
{
    public const ROLES = [
        'admin' => 'ADH (Administrator)',
        'manager' => 'Manager',
        'security' => 'Security Officer',
        'inventory' => 'Inventory Handler',
        'librarian' => 'Librarian',
        'finance' => 'Finance Officer',
        'resident' => 'Resident',
    ];

    public const MODULES = [
        'security' => 'Security',
        'inventory' => 'Inventory',
        'library' => 'Library',
        'finance' => 'Finance',
        'events' => 'Events',
        'complaints' => 'Complaints',
        'noc' => 'NOC Processing',
        'records' => 'Record Room',
        'users' => 'Users & Houses',
    ];

    /** Roles that fully manage a module (create / update / delete everything). */
    private const MANAGE = [
        'security' => ['security'],
        'inventory' => ['inventory'],
        'library' => ['librarian'],
        'finance' => ['finance'],
        'events' => ['manager'],
        'complaints' => ['manager'],
        'noc' => ['manager'],
        'records' => ['manager'],
        'users' => [],
    ];

    /** Extra roles that can open the module with a limited (own records / read) view. */
    private const VIEW = [
        'security' => [],
        'inventory' => [],
        'library' => ['resident', 'manager', 'security', 'inventory', 'finance'],
        'finance' => ['manager', 'security', 'inventory', 'librarian'], // officials: own expense requests
        'events' => ['resident', 'security'],
        'complaints' => ['resident'],
        'noc' => ['resident'],
        'records' => ['resident'],
        'users' => [],
    ];

    public static function canManage(User $user, string $module): bool
    {
        return $user->role === 'admin' || in_array($user->role, self::MANAGE[$module] ?? [], true);
    }

    public static function canView(User $user, string $module): bool
    {
        return self::canManage($user, $module) || in_array($user->role, self::VIEW[$module] ?? [], true);
    }

    public static function modulesFor(User $user): array
    {
        $out = [];
        foreach (self::MODULES as $key => $label) {
            if (self::canView($user, $key)) {
                $out[] = ['key' => $key, 'label' => $label, 'manage' => self::canManage($user, $key)];
            }
        }

        return $out;
    }
}
