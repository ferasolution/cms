import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowLeft, ExternalLink, LogIn, Upload, Loader2, Home, Users, UserCheck, DoorOpen, MessageSquareWarning, HardDrive, KeyRound, UserPlus, Pause, Play, CalendarPlus, Banknote, Trash2, Map } from 'lucide-react';
import { Form, Modal, Stat, Tabs, useToast } from '../../components/ui';
import { ago, dt, papi } from '../../lib/api';
import { FLAG, Loading, Panel, PROVIDER, SecretBox, SocietyForm, StatusPill, usd, usePlatform } from './kit';

function Row({ label, children }) {
    return <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-ink/55">{label}</span><span className="text-right font-medium">{children ?? '—'}</span></div>;
}

export default function Community({ owner }) {
    const { id } = useParams();
    const [d, reload] = usePlatform(`societies/${id}`);
    const [tab, setTab] = useState('overview');
    const [modal, setModal] = useState(null);
    const [secret, setSecret] = useState(null);
    const [busy, setBusy] = useState('');
    const toast = useToast();
    const nav = useNavigate();
    if (!d) return <Loading />;
    const s = d.society;
    const u = d.usage;
    const plans = Object.entries(d.plans).map(([key, p]) => ({ key, ...p }));

    const act = async (key, fn, ok) => {
        setBusy(key);
        try { const r = await fn(); if (ok) toast(ok, 'success'); await reload(); return r; } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
    };
    const openAs = async () => { setBusy('as'); try { const r = await papi.post(`societies/${s.id}/impersonate`); window.location.href = r.redirect; } catch (e) { toast(e.message, 'error'); setBusy(''); } };
    const upload = () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => inp.files[0] && act('map', async () => { const r = await papi.post(`societies/${s.id}/site-plan`, { file: inp.files[0] }); toast(`Map loaded — ${r.applied?.plots ?? 0} plots`, 'success'); });
        inp.click();
    };

    return (
        <div>
            <Link to="/platform/communities" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink"><ArrowLeft size={15} />Communities</Link>
            <div className="card relative mb-5 overflow-hidden">
                <div className="relative bg-night px-6 py-6 text-white">
                    <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
                    <div className="relative flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-white/55"><span className="text-lg">{FLAG(s.country)}</span>{s.city || 'No city'} · cms.ferasolution.com/{s.slug}</div>
                            <h1 className="mt-1 text-[28px] font-bold tracking-tight">{s.name}</h1>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><StatusPill status={s.status} /><span className="text-white/60">{d.plans[s.plan]?.name} · {usd(s.price)}/month · joined {dt(s.created_at, false)}</span></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <a className="btn border border-white/15 text-white hover:bg-white/10" href={`/${s.slug}/`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open portal</a>
                            <button className="btn bg-sand-400 text-night hover:bg-sand-100" onClick={openAs} disabled={busy === 'as'}>{busy === 'as' ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}Sign in as admin</button>
                        </div>
                    </div>
                </div>
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'subscription', label: 'Subscription' }, { key: 'admins', label: 'Admins', count: d.admins.length },
                { key: 'payments', label: 'Payments', count: d.payments.length }, { key: 'settings', label: 'Details & modules' }, { key: 'activity', label: 'Activity' }, owner && { key: 'danger', label: 'Danger zone' }]} />

            {tab === 'overview' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                        <Stat label="Homes" value={u.houses} sub={`${u.occupied} with an owner · limit ${s.max_houses || s.plan_max_houses || '∞'}`} icon={Home} />
                        <Stat label="Users" value={u.users} sub={`${u.residents} residents · ${u.staff} staff`} icon={Users} tone="sand" />
                        <Stat label="Active, 30 days" value={u.active_30} sub="signed in recently" icon={UserCheck} tone="green" />
                        <Stat label="Visitors, 30 days" value={u.visitors_30} icon={DoorOpen} tone="blue" />
                        <Stat label="Open work orders" value={u.complaints_open} icon={MessageSquareWarning} tone={u.complaints_open > 20 ? 'red' : 'brand'} />
                        <Stat label="File storage" value={`${u.storage_mb} MB`} icon={HardDrive} tone="sand" />
                    </div>
                    <div className="grid items-start gap-5 lg:grid-cols-3">
                        <Panel title="Activity, last 14 days" className="lg:col-span-2">
                            <div className="h-48"><ResponsiveContainer><BarChart data={u.activity}><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} stroke="currentColor" strokeOpacity={0.5} /><Tooltip cursor={{ fill: '#8882' }} contentStyle={{ borderRadius: 12, border: 'none' }} /><Bar dataKey="count" name="Actions" fill="#3a55e0" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
                        </Panel>
                        <Panel title="Contact">
                            <Row label="Name">{s.contact_name}</Row>
                            <Row label="Email">{s.contact_email && <a className="text-brand-600" href={`mailto:${s.contact_email}`}>{s.contact_email}</a>}</Row>
                            <Row label="Phone">{s.contact_phone}</Row>
                            <Row label="Address">{s.address}</Row>
                            <Row label="Region">{s.region}</Row>
                            <Row label="Map">{s.has_map ? 'Loaded' : 'None yet'}</Row>
                            <button className="btn-outline btn-sm mt-3 w-full" onClick={upload} disabled={busy === 'map'}>{busy === 'map' ? <Loader2 size={13} className="animate-spin" /> : <Map size={13} />}{s.has_map ? 'Replace site plan' : 'Load site plan (JSON)'}</button>
                            {s.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-sand-50 p-3 text-[13px] text-ink/75">{s.notes}</p>}
                        </Panel>
                    </div>
                </div>
            )}

            {tab === 'subscription' && (
                <div className="grid gap-5 lg:grid-cols-2">
                    <Panel title="Subscription">
                        <Row label="Plan">{d.plans[s.plan]?.name} · {usd(s.price)}/month</Row>
                        <Row label="Status"><StatusPill status={s.status} /></Row>
                        {s.status === 'trial' && <Row label="Trial ends">{s.trial_ends_at ? `${dt(s.trial_ends_at, false)} (${s.open ? 'running' : 'ended'})` : '—'}</Row>}
                        <Row label="Paid until">{s.paid_until ? dt(s.paid_until, false) : '—'}</Row>
                        <Row label="Payment provider">{s.billing_provider ? PROVIDER[s.billing_provider] : 'Not subscribed online'}</Row>
                        {s.billing_status && <Row label="Provider status">{s.billing_status.replace('_', ' ')}</Row>}
                        {s.renews_at && <Row label="Renews">{dt(s.renews_at, false)}</Row>}
                        {s.billing_customer_id && <Row label="Customer ID"><span className="font-mono text-xs">{s.billing_customer_id}</span></Row>}
                        {s.billing_subscription_id && <Row label="Subscription ID"><span className="font-mono text-xs">{s.billing_subscription_id}</span></Row>}
                    </Panel>
                    <Panel title="Actions">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <button className="btn-outline justify-start" onClick={() => setModal('trial')}><CalendarPlus size={15} />Extend the trial</button>
                            {owner && <button className="btn-outline justify-start" onClick={() => setModal('payment')}><Banknote size={15} />Record a payment</button>}
                            <button className="btn-outline justify-start" onClick={() => setModal('plan')}><Home size={15} />Change plan or limit</button>
                            {s.status === 'suspended'
                                ? <button className="btn-outline justify-start text-emerald-700" onClick={() => act('st', () => papi.post(`societies/${s.id}/status`, { status: 'active' }), 'Community switched back on')}><Play size={15} />Switch back on</button>
                                : <button className="btn-outline justify-start text-red-600" onClick={() => setModal('pause')}><Pause size={15} />Pause the portal</button>}
                        </div>
                        <p className="mt-4 text-[12.5px] leading-relaxed text-ink/50">Card payments through {PROVIDER.lemonsqueezy} or {PROVIDER.stripe} update the plan and dates by themselves. Use "Record a payment" for bank transfers and invoices paid outside the checkout.</p>
                    </Panel>
                </div>
            )}

            {tab === 'admins' && (
                <Panel title="Community admins" pad={false} action={<button className="btn-primary btn-sm" onClick={() => { setSecret(null); setModal('admin'); }}><UserPlus size={14} />Add admin</button>}>
                    {secret && <div className="p-4"><SecretBox {...secret} /></div>}
                    <ul className="divide-y divide-ink/[.05]">
                        {d.admins.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                                <span className="grid size-9 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">{a.name.slice(0, 1)}</span>
                                <div className="min-w-0 flex-1"><div className="font-semibold">{a.name} <span className="ml-1 text-xs font-medium text-ink/45">{a.role === 'super_admin' ? 'Super Admin' : 'Admin'}{!a.active && ' · disabled'}</span></div><div className="text-xs text-ink/50">{a.email}{a.phone ? ' · ' + a.phone : ''}</div></div>
                                <span className="text-xs text-ink/45">{a.last_login_at ? 'last in ' + ago(a.last_login_at) : 'never signed in'}</span>
                                <button className="btn-outline btn-sm" disabled={busy === 'r' + a.id} onClick={async () => { const r = await act('r' + a.id, () => papi.post(`societies/${s.id}/admins/${a.id}/reset`)); if (r) setSecret(r); }}><KeyRound size={13} />Reset password</button>
                            </li>
                        ))}
                    </ul>
                    {!d.admins.length && <p className="p-8 text-center text-sm text-ink/45">This community has no admin. Add one so they can sign in.</p>}
                </Panel>
            )}

            {tab === 'payments' && (
                <Panel title="Payments and subscription events" pad={false}>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead className="border-b border-ink/[.07] bg-canvas/60"><tr><th className="th">Date</th><th className="th">What</th><th className="th">Provider</th><th className="th">Reference</th><th className="th text-right">Amount</th></tr></thead>
                            <tbody className="divide-y divide-ink/[.05]">
                                {d.payments.map((p) => (
                                    <tr key={p.id}><td className="td whitespace-nowrap">{dt(p.occurred_at)}</td><td className="td">{p.description || p.type}{p.plan && <span className="text-ink/45"> · {p.plan}</span>}</td><td className="td">{PROVIDER[p.provider]}</td><td className="td font-mono text-xs text-ink/55">{p.reference || '—'}</td>
                                        <td className={`td text-right font-semibold ${p.amount < 0 ? 'text-red-600' : ''}`}>{p.amount !== null ? usd(p.amount, 2) : '—'}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!d.payments.length && <p className="p-8 text-center text-sm text-ink/45">No payments yet.</p>}
                </Panel>
            )}

            {tab === 'settings' && (
                <Panel title="Details and extra modules">
                    <SocietyForm s={{ ...s, trial_ends_at: s.trial_ends_at, modules: s.modules || [] }} plans={plans} modules={d.modules} onSaved={() => reload()} />
                </Panel>
            )}

            {tab === 'activity' && (
                <div className="grid gap-5 lg:grid-cols-2">
                    <Panel title="Inside the portal" pad={false}>
                        <ul className="max-h-[32rem] divide-y divide-ink/[.05] overflow-y-auto">
                            {d.activity.map((a) => <li key={a.id} className="px-5 py-2.5 text-sm"><div>{a.description}</div><div className="text-xs text-ink/45">{a.module} · {ago(a.created_at)}</div></li>)}
                            {!d.activity.length && <li className="p-8 text-center text-sm text-ink/45">No activity yet.</li>}
                        </ul>
                    </Panel>
                    <Panel title="By the platform team" pad={false}>
                        <ul className="max-h-[32rem] divide-y divide-ink/[.05] overflow-y-auto">
                            {d.audit.map((a) => <li key={a.id} className="px-5 py-2.5 text-sm"><div>{a.description}</div><div className="text-xs text-ink/45">{a.user_name} · {ago(a.created_at)}</div></li>)}
                            {!d.audit.length && <li className="p-8 text-center text-sm text-ink/45">Nothing yet.</li>}
                        </ul>
                    </Panel>
                </div>
            )}

            {tab === 'danger' && owner && (
                <Panel title="Delete this community">
                    <p className="mb-4 max-w-xl text-sm text-ink/65">Deletes {s.name}, its homes, residents, staff, records and uploaded files for good. Payments stay in the ledger. If they may come back, pause the portal instead.</p>
                    <Form submitLabel="Delete for good" onSubmit={async (v) => { await papi.del(`societies/${s.id}`, v); toast('Community deleted'); nav('/platform/communities'); }}
                        fields={[{ name: 'confirm', label: `Type ${s.slug} to confirm`, required: true }]} />
                </Panel>
            )}

            <Modal open={modal === 'trial'} onClose={() => setModal(null)} title="Extend the trial">
                <Form submitLabel="Extend" initial={{ days: 7 }} onSubmit={async (v) => { await papi.post(`societies/${s.id}/extend-trial`, v); toast('Trial extended', 'success'); setModal(null); reload(); }}
                    fields={[{ name: 'days', label: 'Extra days', type: 'select', required: true, options: [7, 14, 30].map((n) => ({ value: n, label: `${n} days` })) }]} />
            </Modal>
            <Modal open={modal === 'payment'} onClose={() => setModal(null)} title="Record a payment">
                <Form submitLabel="Record payment" initial={{ amount: s.price, months: 1, method: 'Bank transfer', plan: s.plan }} onSubmit={async (v) => { const r = await papi.post(`societies/${s.id}/payments`, v); toast(`Recorded — paid until ${r.paid_until}`, 'success'); setModal(null); reload(); }}
                    fields={[{ name: 'amount', label: 'Amount (USD)', type: 'number', required: true, half: true }, { name: 'months', label: 'Months it covers', type: 'number', required: true, half: true },
                        { name: 'method', label: 'Method', type: 'select', required: true, half: true, options: ['Bank transfer', 'Wire', 'Cheque', 'Cash', 'Card (manual)', 'Other'] },
                        { name: 'plan', label: 'Plan', type: 'select', half: true, options: plans.map((p) => ({ value: p.key, label: p.name })) },
                        { name: 'reference', label: 'Reference / invoice no.' }, { name: 'note', label: 'Note', type: 'textarea', rows: 2 }]} />
            </Modal>
            <Modal open={modal === 'plan'} onClose={() => setModal(null)} title="Change plan or limit" wide>
                {modal === 'plan' && <SocietyForm s={s} plans={plans} modules={d.modules} onSaved={() => { setModal(null); reload(); }} />}
            </Modal>
            <Modal open={modal === 'pause'} onClose={() => setModal(null)} title={`Pause ${s.name}?`}>
                <p className="mb-4 text-sm text-ink/60">Everyone in this community sees a "portal paused" page until you switch it back on. No data is removed.</p>
                <Form submitLabel="Pause the portal" onSubmit={async (v) => { await papi.post(`societies/${s.id}/status`, { status: 'suspended', reason: v.reason }); toast('Portal paused'); setModal(null); reload(); }}
                    fields={[{ name: 'reason', label: 'Reason (for the audit trail)', type: 'textarea', rows: 2 }]} />
            </Modal>
            <Modal open={modal === 'admin'} onClose={() => setModal(null)} title="Add a Super Admin">
                <Form submitLabel="Add admin" onSubmit={async (v) => { const r = await papi.post(`societies/${s.id}/admins`, v); setSecret(r); setModal(null); reload(); }}
                    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone' }]} />
                <p className="mt-3 text-xs text-ink/50">A password is generated and shown once, so you can pass it on.</p>
            </Modal>
        </div>
    );
}
