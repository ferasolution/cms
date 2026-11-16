<?php

namespace Tests\Feature;

use App\Models\Platform\BillingEvent;
use App\Models\Society;
use App\Models\User;
use App\Services\Billing;
use App\Support\Platform;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ConsoleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Society $soc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        \App\Support\Tenant::set(null);
        $this->owner = User::create(['name' => 'Owner', 'email' => 'owner@platform.test', 'password' => Hash::make('owner-pass-123'), 'role' => 'platform_owner', 'active' => true]);
        $this->postJson('/_p/api/register', ['name' => 'Willow Creek', 'slug' => 'willow', 'city' => 'Austin', 'country' => 'US', 'admin_name' => 'Sarah', 'email' => 'sarah@willow.test',
            'phone' => '512', 'password' => 'willow-pass-1'])->assertSuccessful();
        $this->postJson('/willow/api/logout');
        $this->soc = Society::where('slug', 'willow')->first();
    }

    public function test_dashboard_detail_trial_payment_and_ledger(): void
    {
        $this->actingAs($this->owner);
        $this->getJson('/_p/api/dashboard')->assertSuccessful()->assertJsonPath('kpis.societies', 2)->assertJsonCount(12, 'revenue');
        $this->getJson('/_p/api/societies')->assertSuccessful()->assertJsonCount(2);
        $this->getJson("/_p/api/societies/{$this->soc->id}")->assertSuccessful()->assertJsonPath('society.slug', 'willow')->assertJsonCount(1, 'admins');

        $before = $this->soc->trial_ends_at;
        $this->postJson("/_p/api/societies/{$this->soc->id}/extend-trial", ['days' => 7])->assertSuccessful();
        $this->assertTrue($this->soc->fresh()->trial_ends_at->gt($before->copy()->addDays(6)));

        $this->postJson("/_p/api/societies/{$this->soc->id}/payments", ['amount' => 249, 'months' => 3, 'method' => 'Bank transfer', 'reference' => 'INV-1'])->assertSuccessful();
        $s = $this->soc->fresh();
        $this->assertSame('active', $s->status);
        $this->assertSame(today()->addMonthsNoOverflow(3)->toDateString(), $s->paid_until->toDateString());
        $this->getJson('/_p/api/payments')->assertJsonPath('totals.all_time', 249)->assertJsonPath('data.0.reference', 'INV-1');
        $this->getJson('/_p/api/dashboard')->assertJsonPath('kpis.paying', 1)->assertJsonPath('kpis.collected_30', 249);

        $r = $this->postJson("/_p/api/societies/{$this->soc->id}/admins", ['name' => 'Tom', 'email' => 'tom@willow.test'])->assertSuccessful()->json();
        $this->postJson('/willow/api/logout');
        $this->postJson('/willow/api/login', ['email' => 'tom@willow.test', 'password' => $r['password']])->assertSuccessful();
        $this->assertGreaterThanOrEqual(4, \DB::table('platform_audit')->count());
    }

    public function test_support_role_cannot_touch_money_plans_team_or_delete(): void
    {
        \App\Support\Tenant::set(null);
        $support = User::create(['name' => 'Sam', 'email' => 'sam@platform.test', 'password' => Hash::make('support-pass-1'), 'role' => 'platform_support', 'active' => true]);
        $this->postJson('/_p/api/login', ['email' => 'sam@platform.test', 'password' => 'support-pass-1'])->assertSuccessful()->assertJsonPath('user.role', 'platform_support');
        $this->getJson('/_p/api/dashboard')->assertSuccessful();
        $this->postJson("/_p/api/societies/{$this->soc->id}/extend-trial", ['days' => 7])->assertSuccessful();
        $this->getJson('/_p/api/billing')->assertForbidden();
        $this->postJson("/_p/api/societies/{$this->soc->id}/payments", ['amount' => 1, 'months' => 1, 'method' => 'Cash'])->assertForbidden();
        $this->putJson('/_p/api/plans/manage', ['plans' => []])->assertForbidden();
        $this->getJson('/_p/api/team')->assertForbidden();
        $this->deleteJson("/_p/api/societies/{$this->soc->id}", ['confirm' => 'willow'])->assertForbidden();
        $this->assertNotNull($support->fresh());
    }

    public function test_plans_notices_settings_and_delete(): void
    {
        $this->actingAs($this->owner);
        $plans = $this->getJson('/_p/api/plans/manage')->json('plans');
        $plans[1]['price'] = 279;
        $plans[1]['name'] = 'Professional';
        $this->putJson('/_p/api/plans/manage', ['plans' => $plans])->assertSuccessful();
        Platform::reset();
        $this->getJson('/_p/api/plans')->assertJsonPath('1.price', 279)->assertJsonPath('1.name', 'Professional');

        $this->postJson('/_p/api/notices', ['title' => 'Maintenance Sunday 2 AM', 'level' => 'warning', 'audience' => 'societies', 'society_ids' => [$this->soc->id], 'admins_only' => false, 'active' => true])->assertSuccessful();
        $this->get('/willow/')->assertSee('Maintenance Sunday 2 AM');
        $this->get('/block19/')->assertDontSee('Maintenance Sunday 2 AM');

        $this->actingAs($this->owner);
        $this->putJson('/_p/api/settings', ['brand_name' => 'Fera Community Cloud', 'trial_days' => 30, 'registration_open' => false, 'default_country' => 'us', 'require_card_after_trial' => true])->assertSuccessful();
        $this->postJson('/_p/api/logout');
        Platform::reset();
        $this->postJson('/_p/api/register', ['name' => 'Oak Hills', 'slug' => 'oak-hills', 'city' => 'Dallas', 'country' => 'US', 'admin_name' => 'A', 'email' => 'a@oak.test', 'phone' => '1', 'password' => 'oak-pass-123'])->assertForbidden();

        $this->actingAs($this->owner);
        $this->deleteJson("/_p/api/societies/{$this->soc->id}", ['confirm' => 'wrong'])->assertUnprocessable();
        $this->deleteJson("/_p/api/societies/{$this->soc->id}", ['confirm' => 'willow'])->assertSuccessful();
        $this->assertNull(Society::find($this->soc->id));
        $this->assertSame(0, User::withoutGlobalScopes()->where('society_id', $this->soc->id)->count());
    }

    public function test_provider_invoices_land_in_the_ledger(): void
    {
        Billing::save(['provider' => 'lemonsqueezy', 'ls_api_key' => 'k', 'ls_store_id' => '1', 'ls_variant_pro' => '2', 'ls_webhook_secret' => 'whs']);
        $this->soc->update(['billing_subscription_id' => '77']);
        $body = json_encode(['meta' => ['event_name' => 'subscription_payment_success'], 'data' => ['type' => 'subscription-invoices', 'id' => '5001', 'attributes' => ['subscription_id' => 77, 'total' => 24900, 'currency' => 'USD', 'status' => 'paid', 'billing_reason' => 'renewal']]]);
        foreach ([1, 2] as $_) {   // retried webhook is stored once
            $this->call('POST', '/_p/webhooks/lemonsqueezy', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SIGNATURE' => hash_hmac('sha256', $body, 'whs')], $body)->assertSuccessful();
        }
        $this->assertSame(1, BillingEvent::where('type', 'payment')->count());
        $this->assertEquals(249, BillingEvent::first()->amount);
        $this->assertSame($this->soc->id, BillingEvent::first()->society_id);
    }
}
