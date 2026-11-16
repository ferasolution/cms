import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet, TrendingUp, Building2, Hourglass, Home, Users, Percent, ArrowRight, Sparkles } from 'lucide-react';
import { PageHeader, Stat } from '../../components/ui';
import { ago, dt } from '../../lib/api';
import { FLAG, Loading, Panel, PROVIDER, StatusPill, usd, usePlatform } from './kit';

const TONE = { red: 'bg-red-500', amber: 'bg-sand-400', blue: 'bg-sky-500' };
const PLAN_COLOR = { basic: '#94a3b8', pro: '#3a55e0', enterprise: '#f5a524' };

export default function Overview() {
    const [d] = usePlatform('dashboard');
    if (!d) return <Loading />;
    const k = d.kpis;
    const totalPlans = d.plan_mix.reduce((a, p) => a + p.count, 0) || 1;

    return (
        <div>
            <PageHeader icon={Sparkles} title="Overview" subtitle="Revenue, growth and the communities that need a hand today." />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Monthly recurring revenue" value={usd(k.mrr)} sub={`${usd(k.arr)} a year`} icon={Wallet} tone="green" />
                <Stat label="Paying communities" value={k.paying} sub={k.paying ? `${usd(k.arpa)} average each` : 'No paid plans yet'} icon={TrendingUp} tone="brand" />
                <Stat label="On free trial" value={k.trial} sub={`${k.new_30} joined in the last 30 days`} icon={Hourglass} tone="blue" />
                <Stat label="Trial → paid" value={k.conversion === null ? '—' : `${k.conversion}%`} sub="of trials that have ended" icon={Percent} tone="sand" />
                <Stat label="Communities" value={k.societies} sub={`${k.closed} paused or ended`} icon={Building2} tone="brand" />
                <Stat label="Homes managed" value={k.houses} icon={Home} tone="blue" />
                <Stat label="Portal users" value={k.users} icon={Users} tone="sand" />
                <Stat label="Collected, last 30 days" value={usd(k.collected_30)} icon={Wallet} tone="green" />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <Panel title="Money collected per month" className="lg:col-span-2">
                    <div className="h-64">
                        <ResponsiveContainer>
                            <BarChart data={d.revenue}>
                                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.06} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" strokeOpacity={0.5} />
                                <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v) => usd(v)} stroke="currentColor" strokeOpacity={0.5} />
                                <Tooltip formatter={(v) => usd(v, 2)} cursor={{ fill: '#8882' }} contentStyle={{ borderRadius: 12, border: 'none' }} />
                                <Bar dataKey="amount" name="Collected" fill="#10b981" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>
                <Panel title="Plan mix">
                    <div className="flex h-3 overflow-hidden rounded-full bg-ink/5">
                        {d.plan_mix.map((p) => <div key={p.key} style={{ width: `${(100 * p.count) / totalPlans}%`, background: PLAN_COLOR[p.key] }} />)}
                    </div>
                    <div className="mt-5 space-y-3">
                        {d.plan_mix.map((p) => (
                            <div key={p.key} className="flex items-center gap-3 text-sm">
                                <span className="size-2.5 rounded-full" style={{ background: PLAN_COLOR[p.key] }} />
                                <span className="flex-1 font-semibold">{p.name}</span>
                                <span className="text-ink/55">{p.count} {p.count === 1 ? 'community' : 'communities'}</span>
                                <span className="w-20 text-right font-semibold">{usd(p.mrr)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 border-t border-ink/[.06] pt-4 text-sm">
                        <div className="mb-2 text-[12.5px] font-semibold text-ink/50">By country</div>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(d.countries).map(([c, n]) => <span key={c} className="rounded-lg bg-ink/[.04] px-2 py-1 text-[12.5px]">{FLAG(c)} {c} <b>{n}</b></span>)}
                        </div>
                    </div>
                </Panel>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <Panel title="Needs attention" pad={false} className="lg:col-span-2">
                    {d.attention.length ? (
                        <ul className="divide-y divide-ink/[.05]">
                            {d.attention.map((a) => (
                                <li key={a.id}><Link to={`/platform/communities/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink/[.015]">
                                    <span className={`size-2 shrink-0 rounded-full ${TONE[a.tone]}`} />
                                    <span className="min-w-0 flex-1"><span className="font-semibold">{a.name}</span> <span className="text-xs text-ink/45">/{a.slug}</span></span>
                                    <span className="text-sm text-ink/60">{a.reason}</span>
                                    <ArrowRight size={15} className="text-ink/30" />
                                </Link></li>
                            ))}
                        </ul>
                    ) : <p className="px-5 py-8 text-center text-sm text-ink/45">All communities are in good shape.</p>}
                </Panel>
                <Panel title="New communities per month">
                    <div className="h-52">
                        <ResponsiveContainer>
                            <BarChart data={d.signups}>
                                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} interval={1} stroke="currentColor" strokeOpacity={0.5} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} width={22} stroke="currentColor" strokeOpacity={0.5} />
                                <Tooltip cursor={{ fill: '#8882' }} contentStyle={{ borderRadius: 12, border: 'none' }} />
                                <Bar dataKey="count" name="Joined" fill="#3a55e0" radius={[5, 5, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <Panel title="Latest sign-ups" pad={false} action={<Link to="/platform/communities" className="text-sm font-semibold text-brand-600">All communities</Link>}>
                    <ul className="divide-y divide-ink/[.05]">
                        {d.recent_signups.map((s) => (
                            <li key={s.id}><Link to={`/platform/communities/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink/[.015]">
                                <span className="text-lg">{FLAG(s.country)}</span>
                                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s.name}</span><span className="text-xs text-ink/45">{s.city || '—'} · {ago(s.created_at)}</span></span>
                                <StatusPill status={s.status} />
                            </Link></li>
                        ))}
                    </ul>
                </Panel>
                <Panel title="Latest payments" pad={false} action={<Link to="/platform/payments" className="text-sm font-semibold text-brand-600">Ledger</Link>}>
                    {d.recent_payments.length ? (
                        <ul className="divide-y divide-ink/[.05]">
                            {d.recent_payments.map((p) => (
                                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.society?.name || 'Deleted community'}</span><span className="text-xs text-ink/45">{PROVIDER[p.provider]} · {dt(p.occurred_at, false)}</span></span>
                                    <span className={`font-bold ${p.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{usd(p.amount, 2)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="px-5 py-8 text-center text-sm text-ink/45">No payments yet. They appear here when a community pays.</p>}
                </Panel>
                <Panel title="Team activity" pad={false} action={<Link to="/platform/audit" className="text-sm font-semibold text-brand-600">Audit trail</Link>}>
                    <ul className="divide-y divide-ink/[.05]">
                        {d.audit.map((a) => (
                            <li key={a.id} className="px-5 py-3 text-sm"><div className="line-clamp-2">{a.description}</div><div className="mt-0.5 text-xs text-ink/45">{a.user_name} · {ago(a.created_at)}</div></li>
                        ))}
                        {!d.audit.length && <li className="px-5 py-8 text-center text-sm text-ink/45">Nothing yet.</li>}
                    </ul>
                </Panel>
            </div>
        </div>
    );
}
