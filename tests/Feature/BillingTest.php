<?php

namespace Tests\Feature;

use App\Models\Society;
use App\Models\User;
use App\Services\Billing;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingTest extends TestCase
{
    use RefreshDatabase;

    private Society $soc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        Billing::reset();
        $this->postJson('/_p/api/register', ['name' => 'Willow Creek Estates', 'slug' => 'willow', 'city' => 'Austin', 'country' => 'US', 'admin_name' => 'Sarah Mitchell',
            'email' => 'sarah@willow.test', 'phone' => '(512) 555-0100', 'password' => 'willow-pass-1', 'houses' => 120])->assertSuccessful();
        $this->soc = Society::where('slug', 'willow')->first();
    }

    public function test_lemon_squeezy_checkout_and_webhook_activate_the_plan(): void
    {
        Billing::save(['provider' => 'lemonsqueezy', 'ls_api_key' => 'ls-key', 'ls_store_id' => '111', 'ls_variant_basic' => '501', 'ls_variant_pro' => '502', 'ls_variant_enterprise' => '503', 'ls_webhook_secret' => 'whs']);
        $this->assertStringNotContainsString('ls-key', json_encode(Billing::publicConfig()));
        $this->assertStringNotContainsString('ls-key', \DB::table('settings')->whereNull('society_id')->value('value'));   // encrypted at rest

        Http::fake(['api.lemonsqueezy.com/v1/checkouts' => Http::response(['data' => ['attributes' => ['url' => 'https://pay.lemonsqueezy.com/checkout/abc']]], 201)]);
        $this->postJson('/willow/api/billing/checkout', ['plan' => 'pro'])->assertSuccessful()->assertJsonPath('url', 'https://pay.lemonsqueezy.com/checkout/abc');
        Http::assertSent(fn (HttpRequest $r) => $r['data']['relationships']['variant']['data']['id'] === '502' && $r['data']['attributes']['checkout_data']['custom']['society_id'] === (string) $this->soc->id);

        // the trial ends; the portal closes except for billing
        $this->soc->update(['trial_ends_at' => now()->subDay()]);
        $this->getJson('/willow/api/houses')->assertStatus(402);
        $this->getJson('/willow/api/billing')->assertSuccessful()->assertJsonPath('online', true);

        $body = json_encode(['meta' => ['event_name' => 'subscription_created', 'custom_data' => ['society_id' => (string) $this->soc->id]],
            'data' => ['type' => 'subscriptions', 'id' => '9001', 'attributes' => ['status' => 'active', 'variant_id' => 502, 'customer_id' => 77, 'renews_at' => now()->addMonth()->toIso8601String(), 'urls' => ['customer_portal' => 'https://x.lemonsqueezy.com/billing']]]]);
        $this->call('POST', '/_p/webhooks/lemonsqueezy', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SIGNATURE' => 'bad'], $body)->assertStatus(401);
        $this->call('POST', '/_p/webhooks/lemonsqueezy', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SIGNATURE' => hash_hmac('sha256', $body, 'whs')], $body)->assertSuccessful();

        $s = $this->soc->fresh();
        $this->assertSame(['active', 'pro', 'lemonsqueezy', '9001'], [$s->status, $s->plan, $s->billing_provider, $s->billing_subscription_id]);
        $this->getJson('/willow/api/houses')->assertSuccessful();

        // subscription runs out → closed again
        $body = json_encode(['meta' => ['event_name' => 'subscription_expired'], 'data' => ['type' => 'subscriptions', 'id' => '9001', 'attributes' => ['status' => 'expired', 'variant_id' => 502]]]);
        $this->call('POST', '/_p/webhooks/lemonsqueezy', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SIGNATURE' => hash_hmac('sha256', $body, 'whs')], $body)->assertSuccessful();
        $this->assertSame('expired', $this->soc->fresh()->status);
        $this->getJson('/willow/api/houses')->assertStatus(402);
    }

    public function test_stripe_checkout_and_signed_webhook(): void
    {
        Billing::save(['provider' => 'stripe', 'stripe_secret' => 'sk_test_123', 'stripe_webhook_secret' => 'whsec_abc']);
        Http::fake(['api.stripe.com/v1/checkout/sessions' => Http::response(['url' => 'https://checkout.stripe.com/c/pay/cs_test'])]);
        $this->postJson('/willow/api/billing/checkout', ['plan' => 'enterprise'])->assertSuccessful()->assertJsonPath('url', 'https://checkout.stripe.com/c/pay/cs_test');
        Http::assertSent(fn (HttpRequest $r) => $r['mode'] === 'subscription' && $r['line_items'][0]['price_data']['unit_amount'] == 49900 && $r['metadata']['plan'] === 'enterprise');

        $payload = json_encode(['type' => 'checkout.session.completed', 'data' => ['object' => ['mode' => 'subscription', 'customer' => 'cus_1', 'subscription' => 'sub_1', 'metadata' => ['society_id' => (string) $this->soc->id, 'plan' => 'enterprise']]]]);
        $t = time();
        $sig = 't='.$t.',v1='.hash_hmac('sha256', $t.'.'.$payload, 'whsec_abc');
        $this->call('POST', '/_p/webhooks/stripe', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => 't='.$t.',v1=deadbeef'], $payload)->assertStatus(401);
        $this->call('POST', '/_p/webhooks/stripe', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => $sig], $payload)->assertSuccessful();
        $s = $this->soc->fresh();
        $this->assertSame(['active', 'enterprise', 'cus_1'], [$s->status, $s->plan, $s->billing_customer_id]);

        Http::fake(['api.stripe.com/v1/billing_portal/sessions' => Http::response(['url' => 'https://billing.stripe.com/p/session/x'])]);
        $this->postJson('/willow/api/billing/portal')->assertJsonPath('url', 'https://billing.stripe.com/p/session/x');
    }

    public function test_only_admins_pay_and_manual_mode_explains(): void
    {
        $this->postJson('/willow/api/billing/checkout', ['plan' => 'pro'])->assertUnprocessable()->assertJsonPath('message', 'Online payment is not switched on yet. Please contact the platform team.');
        $this->postJson('/willow/api/logout');
        $resident = User::withoutGlobalScopes()->where('society_id', 1)->where('role', 'user')->first();
        $this->actingAs($resident)->postJson('/block19/api/billing/checkout', ['plan' => 'pro'])->assertForbidden();
    }
}
