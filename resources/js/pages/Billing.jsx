import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { PageHeader, Spinner, useToast } from '../components/ui';
import { get, post, dt } from '../lib/api';
import PlanPicker from '../platform/PlanPicker';

const STATUS = {
    trial: ['Free trial', 'bg-sand-50 text-sand-500'],
    active: ['Active', 'bg-emerald-50 text-emerald-700'],
    expired: ['Ended', 'bg-red-50 text-red-700'],
    suspended: ['Paused', 'bg-red-50 text-red-700'],
};

/** The community's own subscription: current plan, renewal date, pay or change plan, manage card. */
export default function Billing() {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [portal, setPortal] = useState(false);
    const returning = /[?&](paid=1|checkout)/.test(window.location.search) || document.referrer.includes('lemonsqueezy') || document.referrer.includes('stripe.com');

    const load = () => get('billing').then(setData);
    useEffect(() => { load(); }, []);
    // back from checkout: the provider's webhook usually lands within seconds
    useEffect(() => {
        if (!returning || !data || data.society.subscribed) return;
        const t = setTimeout(load, 3000);
        return () => clearTimeout(t);
    }, [data, returning]);

    if (!data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
    const s = data.society;
    const [label, tone] = STATUS[s.status] || [s.status, 'bg-ink/5'];
    const trialDays = s.trial_ends_at ? Math.max(0, Math.ceil((new Date(s.trial_ends_at) - Date.now()) / 86400000)) : null;
    const plan = data.plans.find((p) => p.key === s.plan);

    const openPortal = async () => {
        setPortal(true);
        try { window.location.href = (await post('billing/portal')).url; } catch (e) { toast(e.message, 'error'); setPortal(false); }
    };

    return (
        <div className="mx-auto max-w-5xl">
            <PageHeader icon={CreditCard} title="Subscription" subtitle="Your plan, renewal and payment card" />
            <div className="card mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
                <div>
                    <div className="text-[12.5px] font-semibold text-ink/50">Plan</div>
                    <div className="text-lg font-bold">{plan?.name || s.plan} <span className="text-sm font-medium text-ink/50">${plan?.price}/month</span></div>
                </div>
                <div>
                    <div className="text-[12.5px] font-semibold text-ink/50">Status</div>
                    <span className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone}`}>{label}</span>
                </div>
                <div>
                    <div className="text-[12.5px] font-semibold text-ink/50">{s.status === 'trial' ? 'Trial ends' : s.billing_status === 'cancelled' ? 'Access until' : 'Renews'}</div>
                    <div className="font-semibold">{s.status === 'trial' ? `${dt(s.trial_ends_at, false)} · ${trialDays} days left` : s.renews_at ? dt(s.renews_at, false) : s.paid_until ? dt(s.paid_until, false) : '—'}</div>
                </div>
                <div>
                    <div className="text-[12.5px] font-semibold text-ink/50">Homes</div>
                    <div className="font-semibold">{s.houses}{plan?.max_houses ? ` of ${plan.max_houses}` : ''}</div>
                </div>
                {s.subscribed && data.can_manage && (
                    <button type="button" className="btn-outline ml-auto" onClick={openPortal} disabled={portal}>
                        {portal ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}Card, invoices & cancel
                    </button>
                )}
            </div>
            {returning && !s.subscribed && (
                <div className="mb-5 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700"><Loader2 size={15} className="animate-spin" />Payment received — switching your plan on. This takes a few seconds.</div>
            )}
            {returning && s.subscribed && s.status === 'active' && (
                <div className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Thank you — your {plan?.name} plan is active.</div>
            )}
            <h2 className="mb-3 text-[15px] font-bold">{s.subscribed ? 'Change plan' : 'Choose a plan'}</h2>
            <PlanPicker data={data} onError={(m) => toast(m, 'error')} />
            <p className="mt-4 text-[12.5px] text-ink/45">Prices in US dollars, billed monthly. Payments are processed securely by our payment partner; we never see your card number.</p>
        </div>
    );
}
