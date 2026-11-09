import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LayoutDashboard, Home, Users, UserCog, AlertTriangle } from 'lucide-react';
import { useGet, PageHeader, Stat, Spinner, Empty } from '../components/ui';
import { MODULE_META } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useAlerts } from '../lib/alerts';
import { ago, money, title } from '../lib/api';
import { useEffect } from 'react';

export function ActivityFeed({ rows }) {
    if (!rows?.length) return <Empty text="No activity yet." />;
    return (
        <ul className="divide-y divide-black/5">
            {rows.map((a) => {
                const Icon = MODULE_META[a.module]?.icon || LayoutDashboard;
                return (
                    <li key={a.id} className="flex gap-3 py-2.5">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={15} /></span>
                        <div className="min-w-0 text-sm">
                            <div>{a.description}</div>
                            <div className="text-[11px] text-black/45">{a.user?.name || 'System'} · {title(a.module)} · {ago(a.created_at)}</div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function Dashboard() {
    const { user, isAdmin } = useAuth();
    const { tick } = useAlerts();
    const { data, loading, reload } = useGet('dashboard');
    const nav = useNavigate();
    useEffect(() => { if (tick) reload(); }, [tick]); // eslint-disable-line

    if (loading && !data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={LayoutDashboard} title={`${greet}, ${user.name.split(' ')[0]}`} subtitle={isAdmin ? 'ADH parental view — every module, live.' : 'Here is what is happening today.'} />

            {isAdmin && data?.pending && (
                <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[['Expense requests', data.pending.expense_requests, '/finance'], ['Event approvals', data.pending.events, '/events'], ['Open complaints', data.pending.complaints, '/complaints'], ['NOCs to review', data.pending.nocs, '/noc']].map(([l, v, to]) => (
                        <button key={l} onClick={() => nav(to)} className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition hover:-translate-y-0.5 ${v ? 'bg-sand-400 text-white' : 'bg-white text-black/50 card'}`}>
                            <span className="flex items-center gap-2">{v > 0 && <AlertTriangle size={15} />}{l}</span>
                            <span className="text-xl">{v}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data?.cards.map((c) => (
                    <Stat key={c.module + c.label} label={c.label} value={c.money ? money(c.value) : c.value} sub={c.sub} icon={MODULE_META[c.module]?.icon}
                        tone={c.warn ? 'red' : 'brand'} onClick={() => nav(MODULE_META[c.module].to)} />
                ))}
                {isAdmin && data?.people && (
                    <>
                        <Stat label="Households" value={data.people.houses} icon={Home} tone="sand" onClick={() => nav('/map')} />
                        <Stat label="Residents / Staff" value={`${data.people.residents} / ${data.people.staff}`} icon={Users} tone="sand" onClick={() => nav('/users')} />
                    </>
                )}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-5">
                {data?.finance_chart && (
                    <div className="card p-5 lg:col-span-3">
                        <div className="mb-3 font-bold">Revenue vs expenses — last 6 months</div>
                        <div className="h-72">
                            <ResponsiveContainer>
                                <BarChart data={data.finance_chart} barGap={4}>
                                    <CartesianGrid vertical={false} stroke="#0000000d" />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                                    <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} width={40} />
                                    <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#0000000a' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="revenue" name="Revenue" fill="#1f7a74" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="expense" name="Expenses + salaries" fill="#e0a94f" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
                <div className={`card p-5 ${data?.finance_chart ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
                    <div className="mb-1 flex items-center justify-between">
                        <span className="font-bold">{isAdmin ? 'Live activity — all modules' : 'Recent activity'}</span>
                        {isAdmin && <button className="text-xs font-semibold text-brand-600" onClick={() => nav('/activity')}>View all</button>}
                    </div>
                    <ActivityFeed rows={data?.activity} />
                </div>
            </div>
            {!isAdmin && user.role === 'resident' && (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[['Raise a complaint', '/complaints'], ['Book an event', '/events'], ['Apply for NOC', '/noc']].map(([l, to]) => (
                        <button key={to} className="card flex items-center gap-2 p-4 text-sm font-semibold hover:-translate-y-0.5 transition" onClick={() => nav(to)}>
                            <UserCog size={16} className="text-brand-600" />{l}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
