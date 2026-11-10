<?php

use App\Models\House;
use App\Models\User;
use App\Services\SitePlan;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * v3: alerts point at the house they are about (map "locate"), automation run log,
 * and corrected Block 19 plot numbering on installations that already use the site plan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alerts', function (Blueprint $table) {
            $table->foreignId('house_id')->nullable()->after('link')->constrained()->nullOnDelete();
        });

        Schema::create('automation_runs', function (Blueprint $table) {
            $table->id();
            $table->string('rule', 60)->index();
            $table->unsignedInteger('actions')->default(0);
            $table->string('summary')->nullable();
            $table->timestamps();
        });

        Schema::table('complaints', function (Blueprint $table) {
            $table->timestamp('escalated_at')->nullable();
            $table->string('auto_assigned_rule')->nullable();
        });
        Schema::table('nocs', function (Blueprint $table) {
            $table->timestamp('sla_alerted_at')->nullable();
        });
        Schema::table('book_issues', function (Blueprint $table) {
            $table->timestamp('reminded_at')->nullable();
        });
        Schema::table('inventory_issues', function (Blueprint $table) {
            $table->timestamp('reminded_at')->nullable();
        });
        Schema::table('attendances', function (Blueprint $table) {
            $table->boolean('auto_closed')->default(false);
        });

        if (! app()->runningUnitTests() && House::whereNotNull('map_x')->exists()) {
            SitePlan::apply(adoptExisting: false, demo: User::where('email', 'security@demo.local')->exists());
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_runs');
    }
};
