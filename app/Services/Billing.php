<?php

namespace App\Services;

use App\Models\Society;
use App\Support\Plans;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Subscriptions for societies, through Lemon Squeezy (merchant of record, pays out to Pakistan)
 * or Stripe (once there is a US company). The platform owner picks the provider in the console.
 * Keys live in one platform-level settings row (society_id NULL), secrets encrypted with APP_KEY.
 */
class Billing
{
    private const KEY = 'platform_billing';

    public const SECRETS = ['ls_api_key', 'ls_webhook_secret', 'stripe_secret', 'stripe_webhook_secret'];

    private const FIELDS = ['provider', 'ls_store_id', 'ls_variant_basic', 'ls_variant_pro', 'ls_variant_enterprise', 'ls_test_mode', 'support_email', ...self::SECRETS];

    private static ?array $cache = null;

    // ------------------------------------------------------------------ config

    public static function config(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $raw = DB::table('settings')->whereNull('society_id')->where('key', self::KEY)->value('value');
        $c = array_replace(array_fill_keys(self::FIELDS, ''), ['provider' => 'manual'], json_decode((string) $raw, true) ?: []);
        foreach (self::SECRETS as $k) {
            if ($c[$k] !== '') {
                try {
                    $c[$k] = Crypt::decryptString($c[$k]);
                } catch (\Throwable) {
                    $c[$k] = '';
                }
            }
        }

        return self::$cache = $c;
    }

    /** Saves the console form; an empty secret field keeps the stored one. */
    public static function save(array $in): void
    {
        $c = self::config();
        foreach (self::FIELDS as $k) {
            if (! array_key_exists($k, $in) || (in_array($k, self::SECRETS, true) && ($in[$k] === '' || $in[$k] === null))) {
                continue;
            }
            $c[$k] = is_bool($in[$k]) ? $in[$k] : trim((string) $in[$k]);
        }
        $store = $c;
        foreach (self::SECRETS as $k) {
            $store[$k] = $c[$k] === '' ? '' : Crypt::encryptString($c[$k]);
        }
        DB::table('settings')->updateOrInsert(['society_id' => null, 'key' => self::KEY], ['value' => json_encode($store)]);
        self::$cache = null;
    }

    /** What the console may see: secrets only as "set / not set". */
    public static function publicConfig(): array
    {
        $c = self::config();
        foreach (self::SECRETS as $k) {
            $c[$k] = $c[$k] === '' ? '' : '••••'.substr($c[$k], -4);
        }

        return $c + ['webhooks' => ['lemonsqueezy' => url('/_p/webhooks/lemonsqueezy'), 'stripe' => url('/_p/webhooks/stripe')], 'ready' => self::ready()];
    }

    public static function provider(): string
    {
        return self::config()['provider'] ?: 'manual';
    }

    public static function ready(): bool
    {
        $c = self::config();

        return match (self::provider()) {
            'lemonsqueezy' => $c['ls_api_key'] !== '' && $c['ls_store_id'] !== '' && $c['ls_variant_basic'].$c['ls_variant_pro'].$c['ls_variant_enterprise'] !== '',
            'stripe' => $c['stripe_secret'] !== '',
            default => false,
        };
    }

    public static function reset(): void
    {
        self::$cache = null;
    }

    // ------------------------------------------------------------------ checkout & portal

    /** A hosted checkout page for this society and plan. */
    public static function checkout(Society $s, string $plan, string $email, string $returnUrl): string
    {
        if (! isset(Plans::PLANS[$plan])) {
            throw new RuntimeException('Unknown plan.');
        }
        if (! self::ready()) {
            throw new RuntimeException('Online payment is not switched on yet. Please contact the platform team.');
        }
        $c = self::config();
        $p = Plans::PLANS[$plan];

        if (self::provider() === 'lemonsqueezy') {
            $variant = $c['ls_variant_'.$plan] ?? '';
            if ($variant === '') {
                throw new RuntimeException("The {$p['name']} plan is not available for online payment yet.");
            }
            $r = self::ls()->post('https://api.lemonsqueezy.com/v1/checkouts', ['data' => [
                'type' => 'checkouts',
                'attributes' => [
                    'checkout_data' => ['email' => $email, 'name' => $s->contact_name ?: $s->name, 'custom' => ['society_id' => (string) $s->id, 'plan' => $plan]],
                    'product_options' => ['redirect_url' => $returnUrl, 'receipt_button_text' => 'Back to '.$s->name, 'receipt_link_url' => $returnUrl],
                    'test_mode' => (bool) $c['ls_test_mode'],
                ],
                'relationships' => [
                    'store' => ['data' => ['type' => 'stores', 'id' => (string) $c['ls_store_id']]],
                    'variant' => ['data' => ['type' => 'variants', 'id' => (string) $variant]],
                ],
            ]]);
            $url = $r->json('data.attributes.url');
            if (! $r->successful() || ! $url) {
                Log::warning('Lemon Squeezy checkout failed', ['status' => $r->status(), 'body' => $r->json('errors')]);
                throw new RuntimeException('The payment page could not be opened. Please try again in a minute.');
            }

            return $url;
        }

        $r = self::stripe()->asForm()->post('https://api.stripe.com/v1/checkout/sessions', [
            'mode' => 'subscription',
            'success_url' => $returnUrl.(str_contains($returnUrl, '?') ? '&' : '?').'paid=1',
            'cancel_url' => $returnUrl,
            'client_reference_id' => (string) $s->id,
            'allow_promotion_codes' => 'true',
            'line_items' => [['quantity' => 1, 'price_data' => [
                'currency' => 'usd', 'unit_amount' => $p['price'] * 100, 'recurring' => ['interval' => 'month'],
                'product_data' => ['name' => 'Community Cloud — '.$p['name']],
            ]]],
            'metadata' => ['society_id' => (string) $s->id, 'plan' => $plan],
            'subscription_data' => ['metadata' => ['society_id' => (string) $s->id, 'plan' => $plan]],
        ] + ($s->billing_provider === 'stripe' && $s->billing_customer_id ? ['customer' => $s->billing_customer_id] : ['customer_email' => $email]));
        if (! $r->successful() || ! $r->json('url')) {
            Log::warning('Stripe checkout failed', ['status' => $r->status(), 'body' => $r->json('error.message')]);
            throw new RuntimeException('The payment page could not be opened. Please try again in a minute.');
        }

        return $r->json('url');
    }

    /** Where the society manages its card, invoices and cancellation. */
    public static function portal(Society $s, string $returnUrl): ?string
    {
        if ($s->billing_provider === 'stripe' && $s->billing_customer_id && self::config()['stripe_secret'] !== '') {
            $r = self::stripe()->asForm()->post('https://api.stripe.com/v1/billing_portal/sessions', ['customer' => $s->billing_customer_id, 'return_url' => $returnUrl]);

            return $r->json('url') ?: null;
        }
        if ($s->billing_provider === 'lemonsqueezy' && $s->billing_subscription_id && self::config()['ls_api_key'] !== '') {
            // signed portal links expire after 24 h, so ask for a fresh one
            $r = self::ls()->get('https://api.lemonsqueezy.com/v1/subscriptions/'.$s->billing_subscription_id);
            if ($url = $r->json('data.attributes.urls.customer_portal')) {
                return $url;
            }
        }

        return $s->billing_portal_url ?: null;
    }

    private static function ls()
    {
        return Http::withToken(self::config()['ls_api_key'])->acceptJson()->withHeaders(['Accept' => 'application/vnd.api+json', 'Content-Type' => 'application/vnd.api+json'])->timeout(20);
    }

    private static function stripe()
    {
        return Http::withToken(self::config()['stripe_secret'])->timeout(20);
    }

    // ------------------------------------------------------------------ webhooks

    public static function lemonWebhook(Request $request): array
    {
        $secret = self::config()['ls_webhook_secret'];
        $raw = $request->getContent();
        if ($secret === '' || ! hash_equals(hash_hmac('sha256', $raw, $secret), (string) $request->header('X-Signature'))) {
            return [401, 'Invalid signature.'];
        }
        $p = json_decode($raw, true) ?: [];
        $event = $p['meta']['event_name'] ?? '';
        $a = $p['data']['attributes'] ?? [];
        $sid = $p['meta']['custom_data']['society_id'] ?? null;
        if (! str_starts_with($event, 'subscription_') || ($p['data']['type'] ?? '') !== 'subscriptions') {
            return [200, 'Ignored.'];
        }
        $soc = $sid ? Society::find($sid) : Society::where('billing_subscription_id', (string) ($p['data']['id'] ?? ''))->first();
        if (! $soc) {
            return [200, 'Unknown society.'];
        }
        $c = self::config();
        $plan = collect(array_keys(Plans::PLANS))->first(fn ($k) => (string) $c['ls_variant_'.$k] !== '' && (string) $c['ls_variant_'.$k] === (string) ($a['variant_id'] ?? ''))
            ?? ($p['meta']['custom_data']['plan'] ?? null);
        self::apply($soc, 'lemonsqueezy', [
            'status' => $a['status'] ?? 'active',
            'plan' => $plan,
            'customer' => isset($a['customer_id']) ? (string) $a['customer_id'] : null,
            'subscription' => isset($p['data']['id']) ? (string) $p['data']['id'] : null,
            'renews_at' => $a['renews_at'] ?? null,
            'ends_at' => $a['ends_at'] ?? null,
            'portal' => $a['urls']['customer_portal'] ?? null,
        ]);

        return [200, 'OK'];
    }

    public static function stripeWebhook(Request $request): array
    {
        $secret = self::config()['stripe_webhook_secret'];
        $raw = $request->getContent();
        $parts = [];
        foreach (explode(',', (string) $request->header('Stripe-Signature')) as $kv) {
            [$k, $v] = array_pad(explode('=', trim($kv), 2), 2, '');
            $parts[$k][] = $v;
        }
        $t = (int) ($parts['t'][0] ?? 0);
        $expected = hash_hmac('sha256', $t.'.'.$raw, $secret);
        if ($secret === '' || ! $t || abs(time() - $t) > 600 || ! collect($parts['v1'] ?? [])->contains(fn ($sig) => hash_equals($expected, $sig))) {
            return [401, 'Invalid signature.'];
        }
        $e = json_decode($raw, true) ?: [];
        $o = $e['data']['object'] ?? [];
        $type = $e['type'] ?? '';

        if ($type === 'checkout.session.completed' && ($o['mode'] ?? '') === 'subscription') {
            $soc = Society::find($o['metadata']['society_id'] ?? $o['client_reference_id'] ?? 0);
            if ($soc) {
                self::apply($soc, 'stripe', ['status' => 'active', 'plan' => $o['metadata']['plan'] ?? null, 'customer' => $o['customer'] ?? null, 'subscription' => $o['subscription'] ?? null]);
            }
        } elseif (str_starts_with($type, 'customer.subscription.')) {
            $soc = Society::find($o['metadata']['society_id'] ?? 0) ?? Society::where('billing_subscription_id', $o['id'] ?? '-')->first();
            if ($soc) {
                $end = $o['current_period_end'] ?? ($o['items']['data'][0]['current_period_end'] ?? null);
                self::apply($soc, 'stripe', [
                    'status' => $type === 'customer.subscription.deleted' ? 'expired' : ($o['status'] ?? 'active'),
                    'plan' => $o['metadata']['plan'] ?? null, 'customer' => $o['customer'] ?? null, 'subscription' => $o['id'] ?? null,
                    'renews_at' => $end && empty($o['cancel_at_period_end']) ? Carbon::createFromTimestamp($end) : null,
                    'ends_at' => $end && ! empty($o['cancel_at_period_end']) ? Carbon::createFromTimestamp($end) : null,
                ]);
            }
        }

        return [200, 'OK'];
    }

    /**
     * Brings a society in line with its subscription. Provider statuses:
     * active / on_trial / trialing / past_due (grace) keep the portal on; cancelled stays on until
     * the paid period ends; expired / unpaid / canceled close it until a plan is chosen again.
     */
    public static function apply(Society $s, string $provider, array $d): void
    {
        $status = strtolower((string) $d['status']);
        $ends = $d['ends_at'] ?? null;
        $renews = $d['renews_at'] ?? null;
        $open = in_array($status, ['active', 'on_trial', 'trialing', 'past_due', 'paid'], true)
            || ($status === 'cancelled' && $ends && Carbon::parse($ends)->isFuture());
        $until = $renews ?: $ends;

        $s->forceFill(array_filter([
            'billing_provider' => $provider,
            'billing_status' => $status,
            'billing_customer_id' => $d['customer'] ?? null,
            'billing_subscription_id' => $d['subscription'] ?? null,
            'billing_portal_url' => $d['portal'] ?? null,
            'billing_renews_at' => $renews ? Carbon::parse($renews) : null,
            'paid_until' => $until ? Carbon::parse($until)->toDateString() : null,
            'plan' => isset($d['plan'], Plans::PLANS[$d['plan']]) ? $d['plan'] : null,
        ], fn ($v) => $v !== null));
        if ($s->status !== 'suspended') {             // a pause by the platform owner always wins
            $s->status = $open ? 'active' : 'expired';
        }
        $s->save();
    }
}
