import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LayoutDashboard, Home, Users, AlertTriangle, Megaphone, Siren, Wifi, ArrowRight, Plus, QrCode, MessageSquareWarning, CalendarHeart, FileCheck2 } from 'lucide-react';
import { useGet, Spinner, Empty } from '../components/ui';
import PlanMap from '../components/PlanMap';
import { signalsByHouse, SIGNAL_META, locateInfo } from '../lib/siteplan';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODULE_META } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useLive, useAlerts } from '../lib/alerts';
import { ago, money, title } from '../lib/api';

const ALL = ['security', 'inventory', 'library', 'finance', 'events', 'complaints', 'noc', 'records', 'crm', 'gym', 'announcements', 'emergency'];

export function ActivityFeed({ rows, compact }) {
    if (!rows?.length) return <Empty text="No activity yet." />;
    return (
        <ul className="divide-y divide-ink/5">
            {rows.map((a) => {
                const Icon = MODULE_META[a.module]?.icon || LayoutDashboard;
                return (
                    <li key={a.id} className={`flex gap-3 ${compact ? 'py-2' : 'py-2.5'}`}>
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={15} /></span>
                        <div className="min-w-0 text-sm">
                            <div className="leading-snug">{a.description}</div>
                            <div className="text-[11px] text-ink/45">{a.user?.name || 'System'} · {title(a.module)} · {ago(a.created_at)}</div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function KpiCard({ c, onClick }) {
    const Icon = MODULE_META[c.module]?.icon || LayoutDashboard;
    return (
        <button onClick={onClick} className="card group relative overflow-hidden px-4 pb-4 pt-3.5 text-left transition hover:border-ink/15">
            <span className={`absolute left-0 top-4 h-6 w-[3px] rounded-r-full ${c.warn ? 'bg-red-500' : 'bg-brand-500'}`} />
            <div className="flex items-start justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-ink/55">{c.label}</div>
                <div className={`grid size-8 place-items-center rounded-[10px] transition group-hover:scale-105 ${c.warn ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'}`}><Icon size={16} /></div>
            </div>
            <div className="mt-1.5 text-[28px] font-bold leading-none tracking-tight">{c.money ? money(c.value) : c.value}</div>
            {c.sub && <div className="mt-1.5 text-xs leading-snug text-ink/50">{c.sub}</div>}
        </button>
    );
}

/** Live 2D plan of the community: every request pinned on its house, new ones pulse. */
function LiveMapCard() {
    const { data, reload } = useGet('map');
    const { isResident } = useAuth();
    const nav = useNavigate();
    const [flash, setFlash] = useState([]);
    const [sel, setSel] = useState(null);
    const seen = useRef(null);
    useLive(['security', 'complaints', 'events', 'emergency', 'noc', 'gym', 'library'], reload);
    const signals = data?.signals || [];
    useEffect(() => {
        if (!data) return;
        if (!seen.current) { seen.current = new Set(signals.map((s) => s.key)); return; }
        const ids = [...new Set(signals.filter((s) => !seen.current.has(s.key)).map((s) => s.house_id))];
        signals.forEach((s) => seen.current.add(s.key));
        if (ids.length) { setFlash((f) => [...f, ...ids]); setTimeout(() => setFlash((f) => f.filter((x) => !ids.includes(x))), 12000); }
    }, [data]); // eslint-disable-line
    const byId = useMemo(() => Object.fromEntries((data?.houses || []).map((h) => [h.id, h])), [data]);
    if (!data?.site?.boundary) return null;
    const groups = signalsByHouse(signals);
    const mine = isResident ? data.houses.find((h) => h.mine) : null;
    const h = sel && byId[sel];
    const info = h ? locateInfo(data.site, data.houses, h) : null;
    return (
        <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
                <span className="flex items-center gap-2 font-bold"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>Live community map <span className="text-xs font-normal text-ink/45">{data.site.name}</span></span>
                <button className="text-xs font-semibold text-brand-600" onClick={() => nav('/map')}>Open 3D map →</button>
            </div>
            <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
                <div className="p-3"><PlanMap site={data.site} houses={data.houses} signals={signals} flash={flash} selectedId={sel || mine?.id} focus={mine?.id} onSelect={(x) => setSel(x.id)} height={380} compact /></div>
                <div className="max-h-[400px] overflow-y-auto border-t border-ink/5 lg:border-l lg:border-t-0">
                    {h ? (
                        <div className="space-y-2 p-4 text-sm">
                            <div className="flex items-center justify-between"><b className="text-base">Plot {h.label}</b><button className="text-xs text-ink/45" onClick={() => setSel(null)}>back</button></div>
                            <div className="text-ink/60">{h.owner || ''}{h.street ? ' · ' + h.street : ''}{info?.landmark ? ' · near ' + info.landmark : ''}</div>
                            {info?.route && <div className="text-xs text-ink/55">{info.route.metres} m from {info.route.gate.label} · ~{info.route.walkMin} min walk</div>}
                            {groups.find((g) => g.house_id === h.id)?.list.map((s) => <button key={s.key} onClick={() => nav(s.link)} className="block w-full rounded-xl bg-ink/[.03] p-2 text-left hover:bg-ink/[.06]"><b>{SIGNAL_META[s.type]?.icon} {s.title}</b><div className="text-xs text-ink/55">{s.sub}</div></button>)}
                            <button className="btn-primary btn-sm w-full" onClick={() => nav(`/map?house=${h.id}&route=1`)}>📍 Locate in 3D with route</button>
                            <button className="btn-outline btn-sm w-full" onClick={() => nav(`/map?house=${h.id}&inside=1`)}>🏠 Inner view</button>
                        </div>
                    ) : (
                        <>
                            <div className="sticky top-0 bg-surface px-4 py-2.5 text-[12.5px] font-semibold text-ink/50">{signals.length} live request{signals.length === 1 ? '' : 's'}</div>
                            {!signals.length && <div className="px-4 pb-6 text-sm text-ink/45">All quiet. New requests appear here and pulse on the map.</div>}
                            {[...signals].sort((a, b) => (a.type === 'sos' ? 0 : 1) - (b.type === 'sos' ? 0 : 1) || new Date(b.at) - new Date(a.at)).slice(0, 30).map((s) => (
                                <button key={s.key} onClick={() => setSel(s.house_id)} className={`flex w-full gap-2.5 border-t border-ink/5 px-4 py-2 text-left hover:bg-ink/[.03] ${s.type === 'sos' ? 'bg-red-50 dark:bg-red-500/10' : ''} ${flash.includes(s.house_id) ? 'flash-in' : ''}`}>
                                    <span className="text-base">{SIGNAL_META[s.type]?.icon}</span>
                                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.title}</span><span className="block truncate text-xs text-ink/50">Plot {byId[s.house_id]?.label} · {ago(s.at)}</span></span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { user, isAdmin, isResident, community } = useAuth();
    const { sos } = useAlerts();
    const { data, loading, reload } = useGet('dashboard');
    const nav = useNavigate();
    useLive(ALL, reload);

    if (loading && !data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const pendingTotal = (data?.pending || []).reduce((a, p) => a + p.value, 0);

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-[24px] bg-night p-6 text-white shadow-[0_20px_50px_-30px_rgba(16,24,51,.9)] sm:p-8">
                <div className="jaali absolute inset-0 opacity-[.06] [mask-image:linear-gradient(90deg,transparent,black_45%)]" aria-hidden="true" />
                <div className="absolute -right-16 -top-24 size-80 rounded-full bg-sand-400/25 blur-3xl" aria-hidden="true" />
                <div className="absolute -bottom-28 left-10 size-72 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[13px] font-medium text-sand-400"><span className="size-1.5 rounded-full bg-sand-400 shadow-[0_0_8px_2px_rgba(245,165,36,.7)]" />{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                        <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">{greet}, {user.name.split(' ')[0]}</h1>
                        <p className="mt-1 text-sm text-white/60">{isAdmin ? 'Every module, every gate, every rupee — live.' : isResident ? 'Your household at a glance.' : 'Your modules, live.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {isAdmin && data?.people && [['Households', data.people.houses, Home, '/map'], ['Residents', data.people.residents, Users, '/users?role=user'], ['Staff', data.people.staff, Users, '/users?role=editor'], ['Active today', data.people.online, Wifi, '/activity']].map(([l, v, I, to]) => (
                            <button key={l} onClick={() => nav(to)} className="min-w-[112px] rounded-2xl border border-white/[.08] bg-white/[.05] px-4 py-3 text-left backdrop-blur transition hover:border-sand-400/40 hover:bg-white/[.09]">
                                <div className="flex items-center gap-1.5 text-[12px] text-white/55"><I size={12} />{l}</div>
                                <div className="tabular mt-1 text-[26px] font-bold leading-none">{v}</div>
                            </button>
                        ))}
                        {isResident && [['Pre-register visitor', QrCode, '/security?tab=passes'], ['Raise complaint', MessageSquareWarning, '/complaints'], ['Book event', CalendarHeart, '/events'], ['Apply NOC', FileCheck2, '/noc']].map(([l, I, to]) => (
                            <button key={l} onClick={() => nav(to)} className="flex items-center gap-2 rounded-2xl border border-white/[.08] bg-white/[.06] px-4 py-3 text-sm font-semibold transition hover:border-sand-400/40 hover:bg-white/[.1]"><I size={16} className="text-sand-400" />{l}</button>
                        ))}
                    </div>
                </div>
            </div>

            {sos.length > 0 && !isResident && (
                <button onClick={() => nav('/emergency')} className="flex w-full items-center gap-3 rounded-2xl bg-red-600 p-4 text-left text-white shadow-lg shadow-red-600/20">
                    <Siren className="animate-pulse" /><div className="flex-1"><div className="font-bold">{sos.length} emergency call(s) in progress</div><div className="text-sm text-white/80">Open the emergency screen to respond</div></div><ArrowRight />
                </button>
            )}

            {isAdmin && data?.pending && (
                <div className="card p-4">
                    <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><AlertTriangle size={16} className="text-sand-500" />Needs your attention</span><span className="text-xs text-ink/45">{pendingTotal} items</span></div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                        {data.pending.map((p) => (
                            <button key={p.label} onClick={() => nav(p.to)} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition hover:-translate-y-0.5 ${p.value ? 'bg-sand-100 text-sand-500' : 'bg-ink/[.03] text-ink/40'}`}>
                                <span>{p.label}</span><span className="text-lg">{p.value}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data?.cards.map((c) => <KpiCard key={c.module + c.label} c={c} onClick={() => nav(MODULE_META[c.module]?.to || '/')} />)}
            </div>

            <LiveMapCard />

            <div className="grid gap-5 lg:grid-cols-5">
                <div className="space-y-5 lg:col-span-3">
                    {data?.finance_chart && (
                        <div className="card p-5">
                            <div className="mb-3 flex items-center justify-between"><span className="font-bold">Revenue vs expenses — 6 months</span><button className="text-xs font-semibold text-brand-600" onClick={() => nav('/finance')}>Finance →</button></div>
                            <div className="h-64">
                                <ResponsiveContainer>
                                    <BarChart data={data.finance_chart} barGap={4}>
                                        <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.06} />
                                        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="currentColor" strokeOpacity={0.5} />
                                        <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} width={40} stroke="currentColor" strokeOpacity={0.5} />
                                        <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#8882' }} contentStyle={{ borderRadius: 12, border: 'none' }} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="revenue" name="Revenue" fill="#3a55e0" radius={[6, 6, 0, 0]} />
                                        <Bar dataKey="expense" name="Expenses + salaries" fill="#f5a524" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                    {data?.gate_chart && (
                        <div className="card p-5">
                            <div className="mb-3 flex items-center justify-between"><span className="font-bold">Gate traffic today (entries per hour)</span><button className="text-xs font-semibold text-brand-600" onClick={() => nav('/security')}>Gate log →</button></div>
                            <div className="h-44">
                                <ResponsiveContainer>
                                    <AreaChart data={data.gate_chart}>
                                        <defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3a55e0" stopOpacity={0.45} /><stop offset="100%" stopColor="#3a55e0" stopOpacity={0} /></linearGradient></defs>
                                        <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={10} interval={2} stroke="currentColor" strokeOpacity={0.5} />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} width={24} stroke="currentColor" strokeOpacity={0.5} />
                                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                                        <Area type="monotone" dataKey="entries" stroke="#3a55e0" strokeWidth={2} fill="url(#gg)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                    {data?.announcements?.length > 0 && (
                        <div className="card p-5">
                            <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Megaphone size={16} className="text-brand-600" />Notice board</span><button className="text-xs font-semibold text-brand-600" onClick={() => nav('/announcements')}>All →</button></div>
                            {data.announcements.map((a) => (
                                <button key={a.id} onClick={() => nav('/announcements')} className="flex w-full items-center justify-between gap-3 border-b border-ink/5 py-2.5 text-left last:border-0">
                                    <span className="flex items-center gap-2 text-sm font-semibold">{a.priority !== 'normal' && <span className={`size-2 rounded-full ${a.priority === 'emergency' ? 'bg-red-500' : 'bg-amber-500'}`} />}{a.title}</span>
                                    <span className="shrink-0 text-xs text-ink/45">{ago(a.created_at)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="card p-5 lg:col-span-2">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-2 font-bold"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>{isAdmin ? 'Live activity — all modules' : 'Recent activity'}</span>
                        {isAdmin && <button className="text-xs font-semibold text-brand-600" onClick={() => nav('/activity')}>View all</button>}
                    </div>
                    <ActivityFeed rows={data?.activity} compact />
                </div>
            </div>
        </div>
    );
}
