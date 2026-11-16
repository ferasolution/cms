import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Download, Plus, Search } from 'lucide-react';
import { Modal, PageHeader, Select, exportCsv } from '../../components/ui';
import { ago, dt } from '../../lib/api';
import { FLAG, Loading, PROVIDER, SocietyForm, StatusPill, usd, usePlatform } from './kit';

const SORTS = { newest: (a, b) => new Date(b.created_at) - new Date(a.created_at), name: (a, b) => a.name.localeCompare(b.name), houses: (a, b) => b.houses - a.houses,
    revenue: (a, b) => b.lifetime - a.lifetime, active: (a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0) };

export default function Communities() {
    const [rows, reload] = usePlatform('societies');
    const [plans] = usePlatform('plans');
    const [f, setF] = useState({ q: '', status: '', plan: '', country: '', sort: 'newest' });
    const [adding, setAdding] = useState(false);
    const nav = useNavigate();
    const list = useMemo(() => (rows || [])
        .filter((s) => (!f.q || `${s.name} ${s.slug} ${s.city} ${s.contact_email}`.toLowerCase().includes(f.q.toLowerCase()))
            && (!f.status || s.status === f.status) && (!f.plan || s.plan === f.plan) && (!f.country || s.country === f.country))
        .sort(SORTS[f.sort]), [rows, f]);
    if (!rows) return <Loading />;
    const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))].sort();
    const set = (k) => (v) => setF({ ...f, [k]: v });

    return (
        <div>
            <PageHeader icon={Building2} title="Communities" subtitle={`${rows.length} communities on the platform.`}>
                <button className="btn-outline" onClick={() => exportCsv('communities.csv', list, [['Name', 'name'], ['Address', (s) => '/' + s.slug], ['Country', 'country'], ['City', 'city'], ['Plan', 'plan'], ['Status', 'status'], ['Homes', 'houses'], ['Users', 'users'], ['Paid to date (USD)', 'lifetime'], ['Contact', 'contact_name'], ['Email', 'contact_email'], ['Joined', (s) => s.created_at?.slice(0, 10)]].map(([label, v]) => ({ label, value: typeof v === 'function' ? v : (r) => r[v] })))}><Download size={15} />Export</button>
                <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} />Add community</button>
            </PageHeader>

            <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
                <label className="relative min-w-[14rem] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" /><input className="input pl-9" placeholder="Name, address, city or email" value={f.q} onChange={(e) => set('q')(e.target.value)} /></label>
                <Select value={f.status} onChange={set('status')} placeholder="Any status" options={['trial', 'active', 'expired', 'suspended']} />
                <Select value={f.plan} onChange={set('plan')} placeholder="Any plan" options={(plans?.plans || []).map((p) => ({ value: p.key, label: p.name }))} />
                <Select value={f.country} onChange={set('country')} placeholder="Any country" options={countries.map((c) => ({ value: c, label: `${FLAG(c)} ${c}` }))} />
                <Select value={f.sort} onChange={set('sort')} options={[{ value: 'newest', label: 'Newest first' }, { value: 'name', label: 'Name' }, { value: 'houses', label: 'Most homes' }, { value: 'revenue', label: 'Most paid' }, { value: 'active', label: 'Recently active' }]} />
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                        <thead className="border-b border-ink/[.07] bg-canvas/60"><tr><th className="th">Community</th><th className="th">Plan</th><th className="th">Status</th><th className="th">Homes</th><th className="th">Users</th><th className="th">Paid to date</th><th className="th">Last activity</th></tr></thead>
                        <tbody className="divide-y divide-ink/[.05]">
                            {list.map((s) => (
                                <tr key={s.id} onClick={() => nav(`/platform/communities/${s.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                                    <td className="td"><div className="flex items-center gap-2.5"><span className="text-lg">{FLAG(s.country)}</span><div><div className="font-semibold">{s.name}</div><div className="text-xs text-ink/45">/{s.slug}{s.city ? ' · ' + s.city : ''}</div></div></div></td>
                                    <td className="td"><span className="font-semibold capitalize">{s.plan}</span><div className="text-xs text-ink/45">{usd(s.price)}/mo</div></td>
                                    <td className="td"><StatusPill status={s.status} />
                                        <div className="mt-0.5 text-[11px] text-ink/45">{s.status === 'trial' && s.trial_ends_at ? (s.open ? 'ends ' + dt(s.trial_ends_at, false) : 'trial ended') : s.billing_provider ? `${PROVIDER[s.billing_provider]} · ${s.billing_status || 'paid'}` : s.paid_until ? 'paid till ' + dt(s.paid_until, false) : ''}</div></td>
                                    <td className="td">{s.houses}<span className="text-ink/40"> / {s.max_houses || '∞'}</span></td>
                                    <td className="td">{s.users}</td>
                                    <td className="td font-semibold">{usd(s.lifetime)}</td>
                                    <td className="td text-ink/55">{s.last_activity ? ago(s.last_activity) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!list.length && <div className="p-10 text-center text-sm text-ink/45">No community matches these filters.</div>}
            </div>

            <Modal open={adding} onClose={() => setAdding(false)} title="Add community" wide>
                {adding && plans && <SocietyForm s={{ plan: 'pro', status: 'trial' }} plans={plans.plans} modules={plans.modules} onSaved={(r) => { setAdding(false); reload(); r?.id && nav(`/platform/communities/${r.id}`); }} />}
            </Modal>
            <p className="mt-3 text-xs text-ink/45">Open a community to change its plan, extend a trial, record a payment, reset an admin password or sign in for support. <Link to="/platform/plans" className="underline">Plans & pricing</Link></p>
        </div>
    );
}
