import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { post } from '../lib/api';

const LINES = {
    basic: ['Gate & visitors, complaints, dues', 'Announcements & emergency alerts', 'Events & community calendar'],
    pro: ['Everything in Starter', 'NOC, records room, inventory, library', 'Staff CRM, attendance & payroll'],
    enterprise: ['Every module, gym & club included', 'Unlimited homes', 'Priority onboarding'],
};

/**
 * The three plans with a pay button each. Opens the provider's hosted checkout (Lemon Squeezy or
 * Stripe) in the same tab; the provider sends people back to /billing afterwards.
 */
export default function PlanPicker({ data, dark = false, onError }) {
    const [busy, setBusy] = useState(null);
    const { plans = [], society = {}, online, can_manage: canManage, support_email: support } = data || {};
    const current = society.subscribed && society.open ? society.plan : null;

    const pay = async (key) => {
        setBusy(key);
        try {
            const r = await post('billing/checkout', { plan: key });
            window.location.href = r.url;
        } catch (e) {
            setBusy(null);
            onError?.(e.message);
        }
    };

    const card = dark ? 'border-white/10 bg-white/[.04] text-white' : 'card';
    const muted = dark ? 'text-white/55' : 'text-ink/55';
    return (
        <div className="grid gap-3 md:grid-cols-3">
            {plans.map((p) => {
                const featured = p.key === 'pro';
                const tooSmall = p.max_houses && society.houses > p.max_houses;
                return (
                    <div key={p.key} className={`relative flex flex-col rounded-[var(--radius-panel)] border p-5 ${card} ${featured ? (dark ? 'ring-1 ring-sand-400/50' : 'ring-2 ring-brand-500/25') : ''}`}>
                        {featured && <span className="absolute -top-2.5 left-5 rounded-full bg-sand-400 px-2 py-0.5 text-[11px] font-bold text-night">Most picked</span>}
                        <div className="text-[15px] font-bold">{p.name}</div>
                        <div className="mt-2 flex items-baseline gap-1">
                            <span className="text-[34px] font-bold leading-none tracking-tight">${p.price}</span>
                            <span className={`text-sm ${muted}`}>/ month</span>
                        </div>
                        <div className={`mt-1 text-[12.5px] ${muted}`}>{p.max_houses ? `Up to ${p.max_houses} homes` : 'Unlimited homes'}</div>
                        <ul className="mt-4 flex-1 space-y-2 text-[13px]">
                            {(LINES[p.key] || []).map((l) => <li key={l} className="flex gap-2"><Check size={15} className={`mt-0.5 shrink-0 ${dark ? 'text-sand-400' : 'text-brand-600'}`} />{l}</li>)}
                        </ul>
                        {current === p.key ? (
                            <div className={`mt-5 rounded-xl py-2 text-center text-sm font-semibold ${dark ? 'bg-white/10' : 'bg-brand-50 text-brand-700'}`}>Your current plan</div>
                        ) : canManage && online ? (
                            <button type="button" disabled={!!busy || tooSmall} onClick={() => pay(p.key)}
                                className={`mt-5 ${featured ? (dark ? 'btn bg-sand-400 text-night hover:bg-sand-100' : 'btn-primary') : (dark ? 'btn border border-white/15 hover:bg-white/10' : 'btn-outline')}`}>
                                {busy === p.key ? <><Loader2 size={15} className="animate-spin" />Opening checkout…</> : tooSmall ? 'Too many homes for this plan' : current ? `Switch to ${p.name}` : `Subscribe — $${p.price}/mo`}
                            </button>
                        ) : null}
                    </div>
                );
            })}
            {!online && (
                <p className={`text-sm md:col-span-3 ${muted}`}>
                    Online card payment isn't switched on yet.{' '}
                    {support ? <>Email <a className="font-semibold underline" href={`mailto:${support}`}>{support}</a> to choose a plan.</> : 'Please contact the platform team to choose a plan.'}
                </p>
            )}
            {online && !canManage && <p className={`text-sm md:col-span-3 ${muted}`}>Only a community admin can change the subscription.</p>}
        </div>
    );
}
