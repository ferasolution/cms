<?php

use App\Models\User;
use App\Support\Access;
use Database\Seeders\DemoExtrasSeeder;
use Illuminate\Database\Migrations\Migration;

/** Installations that loaded the demo data get demo records for the new v2 modules too. */
return new class extends Migration
{
    public function up(): void
    {
        if (app()->runningUnitTests() || ! User::where('email', 'security@demo.local')->exists()) {
            return;
        }
        User::firstOrCreate(['email' => 'admin@demo.local'], ['name' => 'Community Admin', 'role' => 'admin', 'password' => 'password']);
        foreach (['hr' => ['Hina HR', 'HR Manager'], 'gym' => ['Club Manager', 'Gym Manager'], 'guard' => ['Guard Shift B', 'Security Guard']] as $key => [$name, $designation]) {
            User::firstOrCreate(['email' => $key.'@demo.local'], ['name' => $name, 'role' => 'editor', 'designation' => $designation, 'permissions' => Access::TEMPLATES[$designation], 'password' => 'password']);
        }
        (new DemoExtrasSeeder)->run();
    }

    public function down(): void {}
};
