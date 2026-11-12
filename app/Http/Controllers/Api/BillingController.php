<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Billing;
use App\Support\Plans;
use App\Support\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;

/** A community's own subscription: see the plan, pay for it, manage the card. Admins only. */
class BillingController extends Controller
{
    public function show(Request $request)
    {
        $s = Tenant::get();
        $admin = $request->user()->isAdmin();

        return [
            'society' => $s->publicInfo() + ['open' => $s->isOpen(), 'billing_status' => $s->billing_status, 'renews_at' => $s->billing_renews_at, 'subscribed' => (bool) $s->billing_subscription_id, 'houses' => \App\Models\House::count()],
            'plans' => collect(Plans::PLANS)->map(fn ($p, $k) => ['key' => $k, 'name' => $p['name'], 'price' => $p['price'], 'max_houses' => $p['max_houses'], 'modules' => $p['modules'] === '*' ? 'all' : count($p['modules'])])->values(),
            'online' => Billing::ready(),
            'provider' => Billing::provider(),
            'support_email' => Billing::config()['support_email'] ?: null,
            'can_manage' => $admin,
        ];
    }

    public function checkout(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403, 'Only community admins can change the subscription.');
        $d = $request->validate(['plan' => ['required', Rule::in(array_keys(Plans::PLANS))]]);
        $s = Tenant::get();
        $limit = Plans::PLANS[$d['plan']]['max_houses'];
        if ($limit && \App\Models\House::count() > $limit) {
            return response()->json(['message' => "This community has more than {$limit} homes — please pick a bigger plan."], 422);
        }
        try {
            return ['url' => Billing::checkout($s, $d['plan'], $request->user()->email, url('/'.$s->slug.'/billing'))];
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function portal(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        $url = Billing::portal(Tenant::get(), url('/'.Tenant::get()->slug.'/billing'));

        return $url ? ['url' => $url] : response()->json(['message' => 'There is no online subscription to manage yet.'], 422);
    }

    public function lemonsqueezy(Request $request)
    {
        [$code, $msg] = Billing::lemonWebhook($request);

        return response()->json(['message' => $msg], $code);
    }

    public function stripe(Request $request)
    {
        [$code, $msg] = Billing::stripeWebhook($request);

        return response()->json(['message' => $msg], $code);
    }
}
