<?php

namespace App\Support;

use App\Models\House;
use App\Models\User;

/**
 * Ready-made sign-ins for the public demo community (/demo), one per kind of user, all with
 * the password "password". They are shown on the demo's sign-in page and protected from
 * being changed or deleted, so the next visitor still finds them working.
 */
class DemoAccounts
{
    public const PASSWORD = 'password';

    /** email => [group, label, what they can see] */
    public const LIST = [
        'superadmin@demo.local' => ['Management', 'Super Admin', 'Everything, including users, roles and settings'],
        'admin@demo.local' => ['Management', 'Community Admin', 'Runs the community office day to day'],
        'manager@demo.local' => ['Management', 'Community Manager', 'Residents, work orders, events and approvals'],
        'finance@demo.local' => ['Office', 'Finance Manager', 'HOA dues, expenses and payroll'],
        'hr@demo.local' => ['Office', 'HR Manager', 'Staff records, attendance and leave'],
        'inventory@demo.local' => ['Office', 'Inventory Manager', 'Stock, assets and issuance'],
        'librarian@demo.local' => ['Office', 'Librarian', 'Books, members and loans'],
        'gym@demo.local' => ['Office', 'Gym Manager', 'Members, plans and check-ins'],
        'security@demo.local' => ['Gatehouse', 'Security Manager', 'Gate, CCTV, patrols and shifts'],
        'guard@demo.local' => ['Gatehouse', 'Security Guard', 'Walk-ins, gate passes and patrol scans'],
        'resident@demo.local' => ['Residents', 'Home Owner', 'Their own home, visitors, dues and requests'],
        'family@demo.local' => ['Residents', 'Family Member', 'Same home as the owner, fewer rights'],
        'tenant@demo.local' => ['Residents', 'Tenant', 'A renter in another home'],
    ];

    public static function isDemo(): bool
    {
        return Tenant::get()?->slug === 'demo';
    }

    public static function protects(?User $u): bool
    {
        return $u && self::isDemo() && isset(self::LIST[strtolower($u->email)]);
    }

    /** For the sign-in page of the demo community. */
    public static function forLogin(): array
    {
        return collect(self::LIST)->map(fn ($v, $email) => ['email' => $email, 'group' => $v[0], 'label' => $v[1], 'about' => $v[2]])->values()->all();
    }

    /** Creates any missing account and puts every one back to a working state. Run inside the demo tenant. */
    public static function ensure(): void
    {
        $houses = House::orderBy('id')->whereNotNull('owner_name')->limit(3)->get();
        $make = function (string $email, array $attrs) {
            $u = User::where('email', $email)->first() ?? new User(['email' => $email]);
            $u->forceFill($attrs + ['password' => self::PASSWORD, 'active' => true])->save();
        };
        $make('superadmin@demo.local', ['name' => 'Sarah Whitman', 'role' => 'super_admin']);
        $make('admin@demo.local', ['name' => 'Community Admin', 'role' => 'admin']);
        $staff = ['manager' => 'Community Manager', 'finance' => 'Finance Manager', 'hr' => 'HR Manager', 'inventory' => 'Inventory Manager',
            'librarian' => 'Librarian', 'gym' => 'Gym Manager', 'security' => 'Security Manager', 'guard' => 'Security Guard'];
        foreach ($staff as $key => $designation) {
            $u = User::where('email', "$key@demo.local")->first();
            $make("$key@demo.local", ['name' => $u?->name ?? DemoData::for()['staff'][$key] ?? $designation, 'role' => 'editor', 'designation' => $designation, 'permissions' => Access::TEMPLATES[$designation] ?? []]);
        }
        if ($h = $houses->get(0)) {
            $make('resident@demo.local', ['name' => User::where('email', 'resident@demo.local')->value('name') ?? $h->owner_name, 'role' => 'user', 'designation' => 'Household Owner', 'household_role' => 'owner', 'house_id' => $h->id]);
            $make('family@demo.local', ['name' => 'Grace '.last(explode(' ', $h->owner_name)), 'role' => 'user', 'designation' => 'Family Member', 'household_role' => 'family', 'house_id' => $h->id]);
        }
        if ($t = $houses->get(2)) {
            $make('tenant@demo.local', ['name' => 'Kevin Brooks', 'role' => 'user', 'designation' => 'Tenant', 'household_role' => 'tenant', 'house_id' => $t->id]);
        }
    }
}
