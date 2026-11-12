<?php

namespace App\Support;

use App\Models\User;

/**
 * Role-based access.
 *
 * Every user has one of four roles:
 *   super_admin — complete system control (users, settings, everything)
 *   admin       — runs the whole community; cannot touch super admins or system settings
 *   editor      — staff; access is set per module (none / view / edit / manage)
 *   user        — resident / household member; sees only their own household's data
 *
 * Levels: 0 none · 1 view · 2 edit (create & update) · 3 manage (approve & delete)
 */
class Access
{
    public const NONE = 0;
    public const VIEW = 1;
    public const EDIT = 2;
    public const MANAGE = 3;

    public const LEVELS = ['none' => 0, 'view' => 1, 'edit' => 2, 'manage' => 3];

    public const ROLES = [
        'super_admin' => 'Super Admin',
        'admin' => 'Admin',
        'editor' => 'Editor',
        'user' => 'User',
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
        'crm' => 'Staff CRM',
        'gym' => 'Gym & Club',
        'announcements' => 'Announcements',
        'emergency' => 'Emergency / SOS',
        'users' => 'Users & Households',
        'settings' => 'System Settings',
    ];

    /** What a resident ("user") can open by default — always scoped to their own household. */
    public const USER_DEFAULTS = [
        'security' => 1, 'library' => 1, 'finance' => 1, 'events' => 1, 'complaints' => 1,
        'noc' => 1, 'records' => 1, 'gym' => 1, 'announcements' => 1, 'emergency' => 1,
    ];

    /** Every staff member can read notices. */
    public const EDITOR_DEFAULTS = ['announcements' => 1];

    /** One-click presets for editors (designation → module levels). */
    public const TEMPLATES = [
        'Community Manager' => ['events' => 3, 'complaints' => 3, 'noc' => 3, 'records' => 3, 'announcements' => 3, 'crm' => 2, 'security' => 1, 'emergency' => 2],
        'Security Manager' => ['security' => 3, 'events' => 1, 'emergency' => 3, 'announcements' => 2],
        'Security Guard' => ['security' => 2, 'events' => 1, 'emergency' => 2],
        'Finance Manager' => ['finance' => 3, 'gym' => 1],
        'Accountant' => ['finance' => 2],
        'HR Manager' => ['crm' => 3],
        'Inventory Manager' => ['inventory' => 3],
        'Librarian' => ['library' => 3],
        'Event Manager' => ['events' => 3, 'announcements' => 2],
        'Complaint Manager' => ['complaints' => 3],
        'NOC Officer' => ['noc' => 3, 'records' => 2],
        'Record Keeper' => ['records' => 3],
        'Gym Manager' => ['gym' => 3],
    ];

    public static function level(User $user, string $module): int
    {
        // the society's plan decides which modules exist at all
        if (($soc = \App\Support\Tenant::get()) && ! in_array($module, $soc->allowedModules(), true)) {
            return 0;
        }
        if ($user->role === 'super_admin') {
            return self::MANAGE;
        }
        if ($user->role === 'admin') {
            return $module === 'settings' ? self::VIEW : self::MANAGE;
        }
        $perms = is_array($user->permissions) ? $user->permissions : [];
        $granted = (int) ($perms[$module] ?? 0);
        if ($user->role === 'user') {
            // residents can be given extra read access, never more
            return max(self::USER_DEFAULTS[$module] ?? 0, min($granted, self::VIEW));
        }

        return max(self::EDITOR_DEFAULTS[$module] ?? 0, $granted);
    }

    public static function canView(User $user, string $module): bool
    {
        return self::level($user, $module) >= self::VIEW;
    }

    public static function canManage(User $user, string $module): bool
    {
        return self::level($user, $module) >= self::EDIT;
    }

    public static function canApprove(User $user, string $module): bool
    {
        return self::level($user, $module) >= self::MANAGE;
    }

    /** [module => level] for every module the user can open. */
    public static function levels(User $user): array
    {
        $out = [];
        foreach (array_keys(self::MODULES) as $m) {
            if ($l = self::level($user, $m)) {
                $out[$m] = $l;
            }
        }

        return $out;
    }

    public static function modulesFor(User $user): array
    {
        $out = [];
        foreach (self::MODULES as $key => $label) {
            $l = self::level($user, $key);
            if ($l > 0) {
                $out[] = ['key' => $key, 'label' => $label, 'level' => $l, 'manage' => $l >= self::EDIT, 'approve' => $l >= self::MANAGE];
            }
        }

        return $out;
    }

    /** Sanitise a permissions array coming from the user panel. */
    public static function clean(?array $perms): array
    {
        $out = [];
        foreach ((array) $perms as $m => $l) {
            $l = is_numeric($l) ? (int) $l : (self::LEVELS[$l] ?? 0);
            if (isset(self::MODULES[$m]) && $l > 0) {
                $out[$m] = min(3, $l);
            }
        }

        return $out;
    }
}
