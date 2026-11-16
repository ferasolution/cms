import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { papi } from '../../lib/api';
import { Form, Spinner, useToast } from '../../components/ui';
import { Logo } from '../Brand';

export const STATUS = { active: 'bg-emerald-50 text-emerald-700', trial: 'bg-sky-50 text-sky-700', suspended: 'bg-red-50 text-red-700', expired: 'bg-amber-50 text-amber-700' };
export const usd = (n, digits = 0) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits === 0 ? 0 : 2 });
export const FLAG = (c) => (c && c.length === 2 ? String.fromCodePoint(...[...c.toUpperCase()].map((x) => 127397 + x.charCodeAt(0))) : '');
export const COUNTRIES = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['QA', 'Qatar'], ['PK', 'Pakistan'], ['IN', 'India']].map(([value, label]) => ({ value, label }));
export const PROVIDER = { lemonsqueezy: 'Lemon Squeezy', stripe: 'Stripe', manual: 'Manual' };

export function StatusPill({ status }) {
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-semibold capitalize ${STATUS[status] || 'bg-ink/5 text-ink/60'}`}>{status}</span>;
}

/** GET a console endpoint with a reload function. */
export function usePlatform(url, params) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const key = JSON.stringify(params || {});
    const load = useCallback(() => papi.get(url, params).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), [url, key]); // eslint-disable-line
    useEffect(() => { load(); }, [load]);
    return [data, load, error];
}

export function Panel({ title, action, children, className = '', pad = true }) {
    return (
        <section className={`card overflow-hidden ${className}`}>
            {(title || action) && <div className="flex items-center justify-between gap-3 border-b border-ink/[.06] px-5 py-3.5"><h2 className="text-[15px] font-bold">{title}</h2>{action}</div>}
            <div className={pad ? 'p-5' : ''}>{children}</div>
        </section>
    );
}

export function Loading() {
    return <div className="grid h-64 place-items-center"><Spinner /></div>;
}

/** Shows a one-time password once, with a copy button. */
export function SecretBox({ email, password }) {
    const toast = useToast();
    return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold">Share these sign-in details once — the password is not shown again.</div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"><span className="text-emerald-800/70">Email</span><b>{email}</b><span className="text-emerald-800/70">Password</span><b className="font-mono">{password}</b></div>
            <button type="button" className="btn-outline btn-sm mt-3" onClick={() => { navigator.clipboard?.writeText(`Email: ${email}\nPassword: ${password}`); toast('Copied'); }}><Copy size={13} />Copy</button>
        </div>
    );
}

export function AuthCard({ status, onDone }) {
    const toast = useToast();
    const setup = status.needs_setup;
    return (
        <div className="relative grid min-h-full place-items-center overflow-hidden bg-night p-5">
            <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
            <div className="drift-b absolute -bottom-40 -left-20 size-96 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
            <div className="relative w-full max-w-sm">
                <div className="mb-6 flex justify-center"><Logo /></div>
                <div className="card p-6">
                    <h1 className="text-xl font-bold tracking-tight">{setup ? 'Create the platform owner' : 'Platform console'}</h1>
                    <p className="mb-4 mt-1 text-sm text-ink/55">{setup ? 'One-time setup. Use the setup key — it is the DEPLOY_TOKEN saved on the server.' : 'For the Fera Solution team. Society staff sign in at their own society address.'}</p>
                    <Form submitLabel={setup ? 'Create and sign in' : 'Sign in'} onSubmit={async (v) => { await papi.post(setup ? 'setup' : 'login', v); toast('Signed in'); onDone(); }}
                        fields={setup ? [{ name: 'token', label: 'Setup key', type: 'password', required: true }, { name: 'name', label: 'Your name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password (10+ characters)', type: 'password', required: true }]
                            : [{ name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password', type: 'password', required: true }]} />
                </div>
                <a href="/" className="mt-4 block text-center text-sm text-white/50 hover:text-white">Back to the website</a>
            </div>
        </div>
    );
}

export function SocietyForm({ s, plans, modules, onSaved }) {
    const toast = useToast();
    const isNew = !s.id;
    const planMods = plans.find((p) => p.key === (s.plan || 'pro'))?.modules;
    return (
        <Form initial={{ country: 'US', ...s, trial_ends_at: s.trial_ends_at?.slice(0, 10), modules: s.modules || [] }} submitLabel={isNew ? 'Create community' : 'Save'} onSubmit={async (v) => {
            const r = isNew ? await papi.post('societies', v) : await papi.put(`societies/${s.id}`, v);
            toast(isNew ? 'Community created' : 'Saved', 'success'); onSaved(r);
        }} fields={[
            { name: 'name', label: 'Community name', required: true, half: true }, { name: 'slug', label: 'Address (cms.ferasolution.com/…)', required: true, half: true },
            { name: 'city', label: 'City', half: true }, isNew && { name: 'country', label: 'Country', type: 'select', required: true, half: true, options: COUNTRIES },
            { name: 'plan', label: 'Plan', type: 'select', required: true, half: true, options: plans.map((p) => ({ value: p.key, label: `${p.name} — $${Number(p.price).toLocaleString('en-US')}` })) },
            { name: 'status', label: 'Status', type: 'select', required: true, half: true, options: ['trial', 'active', 'suspended', 'expired'] },
            !isNew && { name: 'trial_ends_at', label: 'Trial ends', type: 'date', half: true },
            !isNew && { name: 'paid_until', label: 'Paid until', type: 'date', half: true },
            !isNew && { name: 'max_houses', label: 'House limit (empty = plan limit)', type: 'number', half: true },
            isNew && { name: 'admin_name', label: 'Super Admin name', required: true, half: true }, isNew && { name: 'email', label: 'Super Admin email', type: 'email', required: true, half: true },
            isNew && { name: 'password', label: 'Super Admin password', type: 'password', required: true, half: true }, isNew && { name: 'phone', label: 'Phone', half: true },
            !isNew && { name: 'contact_name', label: 'Contact person', half: true }, !isNew && { name: 'contact_phone', label: 'Contact phone', half: true },
            !isNew && { name: 'contact_email', label: 'Contact email', type: 'email' },
            !isNew && { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
        ].filter(Boolean)}>
            {!isNew && ((v, set) => (
                <div>
                    <div className="label">Extra modules on top of the plan</div>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(modules).map(([k, l]) => {
                            const inPlan = planMods === '*' || (planMods || []).includes(k);
                            const on = inPlan || (v.modules || []).includes(k);
                            return <button type="button" key={k} disabled={inPlan} onClick={() => set('modules', on ? v.modules.filter((x) => x !== k) : [...(v.modules || []), k])}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${inPlan ? 'bg-ink/[.05] text-ink/40' : on ? 'bg-brand-600 text-white' : 'bg-ink/[.05] text-ink/60 hover:bg-ink/10'}`}>{l}</button>;
                        })}
                    </div>
                    <p className="mt-1 text-[11px] text-ink/45">Grey = already in the plan.</p>
                </div>
            ))}
        </Form>
    );
}

/** Which payment provider takes subscriptions, and its keys. Secrets are write-only. */
export function PaymentSettings({ onSaved }) {
    const toast = useToast();
    const [cfg, setCfg] = useState(null);
    const [provider, setProvider] = useState('manual');
    useEffect(() => { papi.get('billing').then((c) => { setCfg(c); setProvider(c.provider); }); }, []);
    if (!cfg) return <div className="grid h-40 place-items-center"><Spinner /></div>;
    const secret = (name, label, hint) => ({ name, label, type: 'password', hint: cfg[name] ? `Saved (${cfg[name]}). Leave empty to keep it.` : hint });
    const hook = (url) => (
        <div className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-xs">
            <code className="min-w-0 flex-1 truncate">{url}</code>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(url); toast('Copied'); }}><Copy size={13} /></button>
        </div>
    );
    return (
        <Form initial={{ ...cfg, ls_api_key: '', ls_webhook_secret: '', stripe_secret: '', stripe_webhook_secret: '', ls_test_mode: !!cfg.ls_test_mode }} submitLabel="Save payment settings"
            onChange={(v) => setProvider(v.provider)}
            onSubmit={async (v) => { const r = await papi.put('billing', v); setCfg(r); toast(r.ready ? 'Saved — online payment is on' : 'Saved', 'success'); onSaved?.(); }}
            fields={[
                { name: 'provider', label: 'Take payments with', type: 'select', required: true, options: [{ value: 'manual', label: 'Manual — invoices by email (no card checkout)' }, { value: 'lemonsqueezy', label: 'Lemon Squeezy (merchant of record)' }, { value: 'stripe', label: 'Stripe' }] },
                { name: 'support_email', label: 'Billing contact email (shown to communities)', type: 'email' },
                ...(provider === 'lemonsqueezy' ? [
                    secret('ls_api_key', 'API key', 'Lemon Squeezy → Settings → API → new key'),
                    { name: 'ls_store_id', label: 'Store ID', half: true, hint: 'Settings → Stores (the number)' },
                    { name: 'ls_test_mode', label: 'Test mode checkouts', type: 'checkbox', half: true },
                    { name: 'ls_variant_basic', label: 'Variant ID — Starter $99', half: true },
                    { name: 'ls_variant_pro', label: 'Variant ID — Pro $249', half: true },
                    { name: 'ls_variant_enterprise', label: 'Variant ID — Enterprise $499', half: true },
                    secret('ls_webhook_secret', 'Webhook signing secret', 'Any long random text; paste the same text in the webhook'),
                ] : []),
                ...(provider === 'stripe' ? [
                    secret('stripe_secret', 'Secret key', 'sk_live_… (Developers → API keys)'),
                    secret('stripe_webhook_secret', 'Webhook signing secret', 'whsec_… (shown after you add the webhook)'),
                ] : []),
            ]}>
            {provider !== 'manual' && (
                <div className="space-y-2">
                    <div className="label">Webhook URL — add it in {provider === 'stripe' ? 'Stripe → Developers → Webhooks' : 'Lemon Squeezy → Settings → Webhooks'}</div>
                    {hook(cfg.webhooks[provider])}
                    <p className="text-[11px] text-ink/45">{provider === 'stripe' ? 'Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted.' : 'Events: subscription_created, subscription_updated, subscription_cancelled, subscription_resumed, subscription_expired, subscription_payment_success.'}</p>
                </div>
            )}
        </Form>
    );
}

