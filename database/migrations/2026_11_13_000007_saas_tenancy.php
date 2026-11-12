<?php

use App\Services\SitePlan;
use App\Support\Tenant;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SaaS: the portal becomes multi-society. Everything that existed so far belongs to the first
 * society, Gulistan-e-Jauhar Block 19, reached at /block19.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('societies', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 40)->unique();
            $table->string('name');
            $table->string('city')->nullable();
            $table->string('address')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('status', 20)->default('trial');          // trial, active, suspended
            $table->string('plan', 20)->default('pro');              // basic, pro, enterprise
            $table->timestamp('trial_ends_at')->nullable();
            $table->date('paid_until')->nullable();
            $table->unsignedInteger('max_houses')->nullable();       // override of the plan limit
            $table->json('modules')->nullable();                     // extra modules on top of the plan
            $table->longText('site_plan')->nullable();               // digitised map (plots + site)
            $table->string('contact_name')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_phone')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // the society that exists today
        $name = optional(DB::table('settings')->where('key', 'community')->first(), fn ($r) => json_decode($r->value, true)['community_name'] ?? null) ?: 'Gulistan-e-Jauhar Block 19';
        DB::table('societies')->insert([
            'id' => 1, 'slug' => 'block19', 'name' => $name, 'city' => 'Karachi', 'status' => 'active', 'plan' => 'enterprise',
            'site_plan' => json_encode(SitePlan::bundled()),   // society #1 is Block 19
            'created_at' => now(), 'updated_at' => now(),
        ]);

        foreach (Tenant::TABLES as $t) {
            if ($t === 'settings' || ! Schema::hasTable($t)) {
                continue;
            }
            Schema::table($t, function (Blueprint $table) {
                $table->unsignedBigInteger('society_id')->nullable()->index();
            });
            DB::table($t)->update(['society_id' => 1]);
        }

        // settings: key was the primary key → (society_id, key)
        $rows = DB::table('settings')->get();
        Schema::drop('settings');
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('society_id')->nullable()->index();
            $table->string('key');
            $table->text('value')->nullable();
            $table->unique(['society_id', 'key']);
        });
        foreach ($rows as $r) {
            DB::table('settings')->insert(['society_id' => 1, 'key' => $r->key, 'value' => $r->value]);
        }

        // codes that each society numbers on its own → unique per society
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['email']);
            $table->unique(['society_id', 'email']);
        });
        Schema::table('employees', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->unique(['society_id', 'code']);
        });
        Schema::table('gym_members', function (Blueprint $table) {
            $table->dropUnique(['member_no']);
            $table->dropUnique(['rfid_card']);
            $table->unique(['society_id', 'member_no']);
            $table->unique(['society_id', 'rfid_card']);
        });
    }

    public function down(): void
    {
        // one-way: splitting societies back into a single install is not supported
    }
};
