<?php

use App\Models\Society;
use App\Services\GateLog;
use App\Services\SecurityDemo;
use App\Services\SitePlan;
use App\Support\Settings;
use App\Support\Tenant;
use Database\Seeders\DemoSeeder;
use Illuminate\Database\Migrations\Migration;

/**
 * Public US demo community — "Maple Grove Estates" at /demo — with American names, dollars,
 * driver's licence IDs and Texas plates. Block 19 stays exactly as it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (app()->runningUnitTests() || Society::where('slug', 'demo')->exists()) {
            return;
        }
        $s = Society::create([
            'slug' => 'demo', 'name' => 'Maple Grove Estates', 'city' => 'Austin, TX', 'country' => 'US', 'address' => '100 Maple Grove Blvd, Austin, TX 78732',
            'status' => 'active', 'plan' => 'enterprise', 'site_plan' => SitePlan::usDemo(),
            'contact_name' => 'Sarah Whitman', 'notes' => 'Public demo community (demo logins, password "password").',
        ]);
        Tenant::run($s, function () {
            Settings::save(array_replace(Settings::region('US'), ['community_name' => 'Maple Grove Estates', 'address' => '100 Maple Grove Blvd, Austin, TX 78732', 'timezone' => 'America/Chicago']));
            Tenant::applyTimezone();   // sample times stored in the community's own clock
            (new DemoSeeder)->setContainer(app())->run();
            \App\Models\Visitor::whereNull('token')->each(fn ($v) => $v->forceFill(['token' => GateLog::token('GV', \App\Models\Visitor::class, 'token'), 'access_type' => 'temporary'])->saveQuietly());
            SecurityDemo::seed();
        });
        Tenant::applyTimezone();
    }

    public function down(): void
    {
        // keep data; delete the society from the platform console if needed
    }
};
