<?php

use App\Models\Society;
use App\Support\Settings;
use App\Support\Tenant;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * International platform: region settings per society (currency, timezone, ID & lot wording),
 * billing fields on societies, and Block 19 keeps its Pakistani settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('societies', function (Blueprint $table) {
            $table->string('country', 2)->default('US');
            $table->string('billing_provider', 20)->nullable();        // stripe, lemonsqueezy, manual
            $table->string('billing_customer_id')->nullable();
            $table->string('billing_subscription_id')->nullable()->index();
            $table->string('billing_status', 30)->nullable();          // active, past_due, cancelled…
            $table->string('billing_portal_url', 500)->nullable();
            $table->timestamp('billing_renews_at')->nullable();
        });

        // the existing Karachi community stays in rupees, CNIC, plots and Pakistan time
        if ($b19 = Society::where('slug', 'block19')->first()) {
            $b19->update(['country' => 'PK']);
            Tenant::run($b19, function () {
                $saved = \App\Models\Setting::get('community', []) ?: [];
                $pk = Settings::region('PK');
                Settings::save(array_replace($pk, array_intersect_key($saved, ['emergency_contacts' => 1])) + [
                    'complaint_workers' => $saved['complaint_workers'] ?? "plumbing = Akram (Plumber) | 0300-1112233\nelectrical = Javed (Electrician) | 0300-2223344\ncleaning = Sweeper Team | 0300-3334455\ngardening = Rafiq (Gardener) | 0300-4445566\nconstruction = Maintenance Team | 0300-5556677",
                    'library_fine_per_day' => $saved['library_fine_per_day'] ?? 20,
                ]);
            });
        }
    }

    public function down(): void
    {
        Schema::table('societies', function (Blueprint $table) {
            $table->dropColumn(['country', 'billing_provider', 'billing_customer_id', 'billing_subscription_id', 'billing_status', 'billing_portal_url', 'billing_renews_at']);
        });
    }
};
