<?php

use App\Models\User;
use App\Services\SitePlan;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Real plot geometry for the 3D map + load the Block 19 site plan on demo installations. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('houses', function (Blueprint $table) {
            $table->float('map_x')->nullable();
            $table->float('map_y')->nullable();
            $table->float('map_w')->nullable();
            $table->float('map_h')->nullable();
            $table->float('map_angle')->nullable();
        });

        if (! app()->runningUnitTests() && User::where('email', 'security@demo.local')->exists()) {
            SitePlan::apply(adoptExisting: true, demo: true);
        }
    }

    public function down(): void
    {
        Schema::table('houses', fn (Blueprint $t) => $t->dropColumn(['map_x', 'map_y', 'map_w', 'map_h', 'map_angle']));
    }
};
