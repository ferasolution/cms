import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Home, Users, Wallet, Hourglass, Plus, ExternalLink, LogIn, Upload, LogOut, Search, Loader2, CreditCard, Copy } from 'lucide-react';
import { papi, dt, ago } from '../lib/api';
import { Modal, Form, Stat, Spinner, useToast } from '../components/ui';
import { Logo } from './Brand';

const STATUS = { active: 'bg-emerald-50 text-emerald-700', trial: 'bg-sky-50 text-sky-700', suspended: 'bg-red-50 text-red-700', expired: 'bg-amber-50 text-amber-700' };

function AuthCard({ status, onDone }) {
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

function SocietyForm({ s, plans, modules, onSaved }) {
    const toast = useToast();
    const isNew = !s.id;
    const planMods = plans.find((p) => p.key === (s.plan || 'pro'))?.modules;
    return (
        <Form initial={{ ...s, trial_ends_at: s.trial_ends_at?.slice(0, 10), modules: s.modules || [] }} submitLabel={isNew ? 'Create society' : 'Save'} onSubmit={async (v) => {
            const r = isNew ? await papi.post('societies', v) : await papi.put(`societies/${s.id}`, v);
            toast(isNew ? 'Society created' : 'Saved', 'success'); onSaved(r);
        }} fields={[
            { name: 'name', label: 'Society name', required: true, half: true }, { name: 'slug', label: 'Address (cms.ferasolution.com/…)', required: true, half: true },
            { name: 'city', label: 'City', half: true }, { name: 'plan', label: 'Plan', type: 'select', required: true, half: true, options: plans.map((p) => ({ value: p.key, label: `${p.name} — $${Number(p.price).toLocaleString('en-US')}` })) },
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
function PaymentSettings({ onSaved }) {
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

export default function Console() {
    const [status, setStatus] = useState(null);
    const [data, setData] = useState(null);
    const [edit, setEdit] = useState(null);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(null);
    const [payments, setPayments] = useState(false);
    const toast = useToast();
    const loadStatus = useCallback(() => papi.get('status').then(setStatus).catch(() => setStatus({ needs_setup: false })), []);
    const load = useCallback(() => papi.get('overview').then(setData).catch(() => {}), []);
    useEffect(() => { loadStatus(); }, [loadStatus]);
    useEffect(() => { if (status?.user) load(); }, [status, load]);
    const rows = useMemo(() => (data?.societies || []).filter((s) => !q || `${s.name} ${s.slug} ${s.city}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

    if (!status) return <div className="grid h-full place-items-center"><Spinner /></div>;
    if (!status.user) return <AuthCard status={status} onDone={loadStatus} />;
    if (!data) return <div className="grid h-full place-items-center"><Spinner /></div>;
    const st = data.stats;

    const openAs = async (s) => { setBusy(s.id); try { const r = await papi.post(`societies/${s.id}/impersonate`); window.location.href = r.redirect; } catch (e) { toast(e.message, 'error'); setBusy(null); } };
    const upload = (s) => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => { if (!inp.files[0]) return; setBusy(s.id); try { const r = await papi.post(`societies/${s.id}/site-plan`, { file: inp.files[0] }); toast(`Map loaded — ${r.applied?.plots ?? 0} plots`, 'success'); load(); } catch (e) { toast(e.message, 'error'); } setBusy(null); };
        inp.click();
    };

    return (
        <div className="min-h-full bg-canvas">
            <header className="relative overflow-hidden bg-night text-white">
                <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
                <div className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
                    <Logo />
                    <div className="flex items-center gap-3 text-sm"><span className="hidden text-white/60 sm:inline">{status.user.name}</span>
                        <button className="btn-ghost btn-sm text-white/70 hover:bg-white/10 hover:text-white" onClick={async () => { await papi.post('logout'); loadStatus(); }}><LogOut size={14} />Sign out</button></div>
                </div>
                <div className="relative mx-auto max-w-7xl px-5 pb-8 pt-4">
                    <h1 className="text-[30px] font-bold tracking-tight">Platform console</h1>
                    <p className="text-white/55">Every society on Fera Community Cloud.</p>
                </div>
            </header>
            <main className="stagger mx-auto max-w-7xl space-y-5 px-5 py-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <Stat label="Societies" value={st.societies} icon={Building2} sub={`${st.active} active · ${st.trial} on trial`} />
                    <Stat label="Monthly revenue (paying)" value={`$${Number(st.mrr).toLocaleString('en-US')}`} icon={Wallet} tone="green" />
                    <Stat label="Houses managed" value={st.houses} icon={Home} tone="blue" />
                    <Stat label="Portal users" value={st.users} icon={Users} tone="sand" />
                    <Stat label="Trials ending in 5 days" value={st.trials_ending} icon={Hourglass} tone={st.trials_ending ? 'red' : 'brand'} />
                </div>
                <div className="card overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-ink/[.06] p-4">
                        <div className="relative w-full max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" /><input className="input pl-9" placeholder="Search societies" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                        <button className="btn-outline ml-auto" onClick={() => setPayments(true)}><CreditCard size={15} />Payments</button>
                        <button className="btn-primary" onClick={() => setEdit({ plan: 'pro', status: 'active' })}><Plus size={15} />Add society</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-sm">
                            <thead className="bg-canvas/60"><tr><th className="th">Society</th><th className="th">Plan</th><th className="th">Status</th><th className="th">Houses</th><th className="th">Users</th><th className="th">Map</th><th className="th">Last activity</th><th className="th" /></tr></thead>
                            <tbody className="divide-y divide-ink/[.05]">
                                {rows.map((s, i) => (
                                    <tr key={s.id} className="hover:bg-ink/[.015]" style={{ animation: `stagger-in .45s ${Math.min(i, 12) * 0.03}s both` }}>
                                        <td className="td"><button className="text-left" onClick={() => setEdit(s)}><div className="font-semibold">{s.name}</div><div className="text-xs text-ink/45">/{s.slug}{s.city ? ' · ' + s.city : ''}</div></button></td>
                                        <td className="td"><span className="font-semibold capitalize">{s.plan}</span><div className="text-xs text-ink/45">${Number(s.price).toLocaleString('en-US')}</div></td>
                                        <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS[s.status]}`}>{s.status}</span>
                                            {s.billing?.provider && <div className="mt-0.5 text-[11px] text-ink/55">{s.billing.provider === 'stripe' ? 'Stripe' : 'Lemon Squeezy'} · {s.billing.status}</div>}
                                            <div className="mt-0.5 text-[11px] text-ink/45">{s.status === 'trial' && s.trial_ends_at ? (s.open ? 'ends ' + dt(s.trial_ends_at, false) : 'trial ended') : s.paid_until ? 'paid till ' + dt(s.paid_until, false) : ''}</div></td>
                                        <td className="td">{s.houses}<span className="text-ink/40"> / {s.max_houses || s.plan_max_houses || '∞'}</span></td>
                                        <td className="td">{s.users}</td>
                                        <td className="td">{s.has_map ? <span className="text-emerald-700">Loaded</span> : <span className="text-ink/40">None</span>}</td>
                                        <td className="td text-ink/55">{s.last_activity ? ago(s.last_activity) : '—'}</td>
                                        <td className="td"><div className="flex justify-end gap-1">
                                            <a className="btn-ghost btn-sm" href={`/${s.slug}/`} target="_blank" rel="noreferrer" title="Open the portal"><ExternalLink size={14} /></a>
                                            <button className="btn-ghost btn-sm" title="Load a site plan (JSON)" onClick={() => upload(s)} disabled={busy === s.id}><Upload size={14} /></button>
                                            <button className="btn-outline btn-sm" onClick={() => openAs(s)} disabled={busy === s.id}>{busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}Sign in as admin</button>
                                        </div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!rows.length && <div className="p-8 text-center text-sm text-ink/45">No society matches.</div>}
                </div>
                <p className="text-xs text-ink/45">"Sign in as admin" opens the society as its first Super Admin for support; it is written to that society's activity log. Joined {data.societies.length ? dt(data.societies[data.societies.length - 1].created_at, false) : '—'} → today.</p>
            </main>
            <Modal open={payments} onClose={() => setPayments(false)} title="Payments" wide>
                {payments && <PaymentSettings onSaved={() => setPayments(false)} />}
            </Modal>
            <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? edit.name : 'Add society'} wide>
                {edit && <SocietyForm s={edit} plans={data.plans} modules={data.modules} onSaved={() => { setEdit(null); load(); }} />}
            </Modal>
        </div>
    );
}
