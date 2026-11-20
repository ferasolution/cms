<?php

use App\Models\Society;
use App\Support\DemoAccounts;
use App\Support\Tenant;
use Illuminate\Database\Migrations\Migration;

/** One ready sign-in per kind of user in the public demo community (/demo). */
return new class extends Migration
{
    public function up(): void
    {
        if ($s = Society::where('slug', 'demo')->first()) {
            Tenant::run($s, fn () => DemoAccounts::ensure());
        }
    }

    public function down(): void {}
};
