<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Platform console: audit trail, payments ledger and notices to communities. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_audit', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('user_name')->nullable();
            $t->unsignedBigInteger('society_id')->nullable()->index();
            $t->string('action', 60);
            $t->string('description', 500);
            $t->json('meta')->nullable();
            $t->string('ip', 45)->nullable();
            $t->timestamp('created_at')->nullable()->index();
        });
        Schema::create('billing_events', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('society_id')->nullable()->index();
            $t->string('provider', 20);                       // lemonsqueezy, stripe, manual
            $t->string('type', 40);                           // payment, refund, subscription_created, …
            $t->decimal('amount', 12, 2)->nullable();
            $t->string('currency', 3)->default('USD');
            $t->string('status', 30)->nullable();
            $t->string('plan', 20)->nullable();
            $t->string('reference')->nullable();
            $t->string('description', 500)->nullable();
            $t->timestamp('occurred_at')->index();
            $t->timestamps();
        });
        Schema::create('platform_notices', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->text('body')->nullable();
            $t->string('level', 12)->default('info');         // info, warning, critical
            $t->string('audience', 12)->default('all');       // all, plans, societies
            $t->json('plans')->nullable();
            $t->json('society_ids')->nullable();
            $t->boolean('admins_only')->default(true);
            $t->timestamp('starts_at')->nullable();
            $t->timestamp('ends_at')->nullable();
            $t->boolean('active')->default(true);
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_notices');
        Schema::dropIfExists('billing_events');
        Schema::dropIfExists('platform_audit');
    }
};
