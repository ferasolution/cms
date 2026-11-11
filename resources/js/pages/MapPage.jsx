import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
const HouseInterior = lazy(() => import('../components/HouseInterior'));
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Stars, CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { Map as MapIcon, X, Users, MessageSquareWarning, Wallet, CalendarHeart, Siren, Sun, Moon, Clock3, Search, Maximize2, Minimize2, Radio, Hourglass, BellRing,
    Navigation, Route as RouteIcon, Box, Layers, Inbox, MapPin, Phone, Copy, Check, ExternalLink, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGet, Spinner, Badge, Tabs, useAction, useToast } from '../components/ui';
import { get, post, dt, money, title, ago } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';
import SiteScene, { housePos } from '../components/SiteScene';
import PlanMap from '../components/PlanMap';
import { locateInfo, mapsLink, routeTo, signalsByHouse, SIGNAL_META } from '../lib/siteplan';

const LAYERS = {
    overview: { label: 'Live', icon: Radio },
    requests: { label: 'Requests', icon: Inbox },
    visitors: { label: 'Visitors', icon: Users, official: true },
    complaints: { label: 'Complaints', icon: MessageSquareWarning },
    maintenance: { label: 'Dues', icon: Wallet, finance: true },
    events: { label: 'Events', icon: CalendarHeart },
};

function useSun(mode) {
    const [h, setH] = useState(() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; });
    useEffect(() => { const i = setInterval(() => { const d = new Date(); setH(d.getHours() + d.getMinutes() / 60); }, 60000); return () => clearInterval(i); }, []);
    const hour = mode === 'day' ? 13 : mode === 'night' ? 22 : h;
    const t = ((hour - 6) / 12) * Math.PI, elev = Math.sin(t), night = elev < -0.05, dusk = !night && elev < 0.25;
    return { hour, night, dusk, sun: [Math.cos(t) * 60, Math.max(elev, -0.2) * 60, -25], light: night ? 0.12 : dusk ? 0.75 : 1.35, ambient: night ? 0.18 : dusk ? 0.45 : 0.6, color: night ? '#7f9cff' : dusk ? '#ffb070' : '#fff7e8' };
}

function FlyTo({ target, controls }) {
    useEffect(() => {
        if (!target || !controls.current) return;
        const [x, z] = target;
        controls.current.setLookAt(x + 9, 15, z + 17, x, 0.6, z, true);
    }, [target, controls]);
    return null;
}
function Overview({ controls, n }) {
    useEffect(() => { if (n && controls.current) controls.current.setLookAt(-8, 62, 70, 0, 0, 0, true); }, [n, controls]);
    return null;
}
function AutoRotate({ enabled, controls }) {
    useFrame((_, dt) => { if (enabled && controls.current) controls.current.azimuthAngle += dt * 0.05; });
    return null;
}

function World({ data, layer, selected, onSelect, sun, walkers, setWalkers, fly, autoRotate, signals, flash, route, home }) {
    const controls = useRef();
    return (
        <>
            <Sky sunPosition={sun.sun} turbidity={sun.night ? 20 : 6} rayleigh={sun.night ? 0.2 : sun.dusk ? 3 : 1.2} mieCoefficient={0.006} mieDirectionalG={0.85} distance={4000} />
            {sun.night && <Stars radius={260} depth={60} count={3000} factor={6} fade speed={0.6} />}
            <fog attach="fog" args={[sun.night ? '#0a1424' : sun.dusk ? '#f0c9a0' : '#cfe4ea', 110, 320]} />
            <ambientLight intensity={sun.night ? 0.42 : sun.ambient} />
            <hemisphereLight args={[sun.night ? '#4a5f96' : '#fdf6e8', '#3f6f5a', sun.night ? 0.55 : 0.45]} />
            <directionalLight position={sun.night ? [-60, 80, 40] : sun.sun.map((v) => v * 1.6)} intensity={sun.light} color={sun.color} castShadow shadow-mapSize={[4096, 4096]}
                shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={300} shadow-bias={-0.0003} />
            <SiteScene data={data} layer={layer} selected={selected} onSelect={onSelect} night={sun.night} walkers={walkers} setWalkers={setWalkers} signals={signals} flash={flash} route={route} />
            <CameraControls ref={controls} makeDefault minDistance={4} maxDistance={220} maxPolarAngle={Math.PI / 2.15} smoothTime={0.6} />
            <FlyTo target={fly} controls={controls} />
            <Overview controls={controls} n={home} />
            <AutoRotate enabled={autoRotate} controls={controls} />
        </>
    );
}

/** Locate card: everything a responder needs to reach a house. */
function LocateCard({ info, house, compact }) {
    const [copied, setCopied] = useState(false);
    if (!info) return null;
    const r = info.route;
    const text = `Plot ${info.plot}${info.street ? ', ' + info.street : ''} — ${info.series}${info.landmark ? ', near ' + info.landmark : ''}${r ? `. From ${r.gate.label}: ${r.metres} m (~${r.walkMin} min walk)` : ''}${info.gps ? `. GPS ${info.gps.lat}, ${info.gps.lng}` : ''}`;
    return (
        <div className={`rounded-2xl bg-sky-50 p-3 text-sm ${compact ? '' : 'mt-1'}`}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-sky-700"><Navigation size={13} />Locate</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div><span className="text-[11px] text-ink/45">Plot</span><div className="font-bold">{info.plot}</div></div>
                <div><span className="text-[11px] text-ink/45">Street</span><div className="font-semibold">{info.street || '—'}</div></div>
                <div><span className="text-[11px] text-ink/45">Sector</span><div>{info.series}</div></div>
                <div><span className="text-[11px] text-ink/45">Landmark</span><div>{info.landmark || '—'}</div></div>
                {r && <div className="col-span-2"><span className="text-[11px] text-ink/45">From {r.gate.label}</span><div className="font-semibold">{r.metres} m · ~{r.walkMin} min walk · ~{r.driveMin} min by bike/car</div></div>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {info.gps && <a className="btn-primary btn-sm" target="_blank" rel="noreferrer" href={mapsLink(info.gps)}><ExternalLink size={13} />Navigate (Google Maps)</a>}
                <button className="btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />}Copy directions</button>
                {house?.owner_phone && <a className="btn-outline btn-sm" href={`tel:${house.owner_phone}`}><Phone size={13} />Call</a>}
            </div>
        </div>
    );
}

/** Quick actions on a request without leaving the map. */
function SignalActions({ s, onDone }) {
    const { can, isResident } = useAuth();
    const act = useAction();
    const nav = useNavigate();
    const b = [];
    if (s.type === 'gate' && (isResident || can('security', true))) {
        b.push(<button key="a" className="btn-primary btn-sm" onClick={() => act(() => post(`visitors/${s.id}/respond`, { decision: 'approve' }), 'Approved — gate informed', onDone)}><Check size={12} />{isResident ? 'Approve' : 'Admit'}</button>);
        b.push(<button key="r" className="btn-ghost btn-sm text-red-600" onClick={() => act(() => post(`visitors/${s.id}/respond`, { decision: 'reject' }), 'Rejected', onDone)}><X size={12} />Reject</button>);
    }
    if (s.type === 'sos' && !isResident && (can('emergency', true) || can('security', true))) {
        if (s.status === 'active') b.push(<button key="s" className="btn-danger btn-sm" onClick={() => act(() => post(`sos/${s.id}`, { status: 'responding' }), 'Responding — caller notified', onDone)}>I'm responding</button>);
        b.push(<button key="z" className="btn-outline btn-sm" onClick={() => { const r = window.prompt('Resolution'); if (r !== null) act(() => post(`sos/${s.id}`, { status: 'resolved', resolution: r }), 'Resolved', onDone); }}>Resolve</button>);
    }
    b.push(<button key="o" className="btn-ghost btn-sm" onClick={() => nav(s.link)}>Open →</button>);
    return <div className="mt-1.5 flex flex-wrap gap-1">{b}</div>;
}

function HousePanel({ house, data, signals, onClose, showRoute, setShowRoute, refresh, onInside }) {
    const [d, setD] = useState(null);
    useEffect(() => { setD(null); get(`houses/${house.id}`).then(setD).catch(() => setD({ error: true })); }, [house.id]);
    const info = useMemo(() => locateInfo(data.site, data.houses, house), [data.site, data.houses, house]);
    const mine = signals.filter((s) => s.house_id === house.id);
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-2 border-b border-ink/5 px-4 py-3">
                <div><div className="text-lg font-bold">Plot {house.label}</div><div className="text-xs text-ink/50">{house.owner || d?.house?.owner_name || 'Owner not set'}{house.street ? ' · ' + house.street : ''}</div></div>
                <button className="btn-ghost btn-sm" onClick={onClose}><X size={15} /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                {mine.length > 0 && (
                    <div className="space-y-2">
                        {mine.map((s) => (
                            <div key={s.key} className="rounded-xl border-l-4 bg-ink/[.03] p-2.5" style={{ borderColor: SIGNAL_META[s.type]?.color }}>
                                <div className="font-semibold">{SIGNAL_META[s.type]?.icon} {s.title}</div>
                                {s.sub && <div className="text-xs text-ink/55">{s.sub}</div>}
                                <div className="text-[11px] text-ink/40">{ago(s.at)}</div>
                                <SignalActions s={s} onDone={refresh} />
                            </div>
                        ))}
                    </div>
                )}
                <button onClick={onInside} className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 p-3 text-left text-white shadow-md transition hover:shadow-lg">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl transition group-hover:scale-110">🏠</span>
                    <span className="min-w-0 flex-1"><span className="block font-bold">Inner view</span><span className="block text-xs text-white/60">3D dollhouse · walk room by room</span></span>
                    <span className="text-white/50 transition group-hover:translate-x-1">→</span>
                </button>
                <LocateCard info={info} house={d?.house} />
                <button className={`btn-sm w-full ${showRoute ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowRoute(!showRoute)}><RouteIcon size={13} />{showRoute ? 'Hide route from gate' : 'Show route from gate'}</button>
                {!d ? <div className="grid h-20 place-items-center"><Spinner /></div> : d.error ? null : (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            {[['Owner', d.house.owner_name], ['Phone', d.house.owner_phone], ['Type', title(d.house.type)], ['Floors', d.house.floors], ['Maintenance', money(d.house.monthly_maintenance)], ['Street', d.house.street]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-ink/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {d.house.residents?.length > 0 && <div><div className="mb-1 font-semibold">Household accounts</div>{d.house.residents.map((r) => <div key={r.id} className="flex justify-between text-ink/70"><span>{r.name} <span className="text-xs text-ink/40">{r.household_role ? title(r.household_role) : ''}</span></span>{r.phone && <a className="text-xs text-brand-600" href={`tel:${r.phone}`}>{r.phone}</a>}</div>)}</div>}
                        {d.vehicles?.length > 0 && <div><div className="mb-1 font-semibold">Vehicles</div>{d.vehicles.map((v) => <div key={v.id} className="text-ink/70"><span className="font-mono font-semibold">{v.plate}</span> {v.make} {v.color}</div>)}</div>}
                        {d.visitors?.length > 0 && <div><div className="mb-1 font-semibold">Recent visitors</div>{d.visitors.map((v) => <div key={v.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{v.name} <span className="text-xs text-ink/45">({v.category})</span></span><Badge value={{ awaiting: 'pending', inside: 'inside', exited: 'exited', rejected: 'rejected' }[v.status]}>{title(v.status)}</Badge></div>)}</div>}
                        {d.complaints?.length > 0 && <div><div className="mb-1 font-semibold">Complaints</div>{d.complaints.map((c) => <div key={c.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{c.title}</span><Badge value={c.status} /></div>)}</div>}
                        {d.payments?.length > 0 && <div><div className="mb-1 font-semibold">Payments</div>{d.payments.map((p) => <div key={p.id} className="flex justify-between py-0.5 text-ink/70"><span>{title(p.category)} {p.period || ''}</span><span>{money(p.amount)} · {dt(p.date, false)}</span></div>)}</div>}
                    </>
                )}
            </div>
        </div>
    );
}

function InboxPanel({ signals, byId, onPick, flash, filter, setFilter }) {
    const counts = signals.reduce((a, s) => ({ ...a, [s.type]: (a[s.type] || 0) + 1 }), {});
    const shown = filter ? signals.filter((s) => s.type === filter) : signals;
    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-ink/5 px-4 py-3">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Inbox size={16} className="text-brand-600" />Live requests</span><span className="text-xs text-ink/45">{signals.length}</span></div>
                <div className="mt-2 flex flex-wrap gap-1">
                    <button onClick={() => setFilter('')} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${!filter ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60'}`}>All</button>
                    {Object.entries(counts).sort((a, b) => (SIGNAL_META[a[0]]?.rank ?? 9) - (SIGNAL_META[b[0]]?.rank ?? 9)).map(([t, n]) => (
                        <button key={t} onClick={() => setFilter(filter === t ? '' : t)} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${filter === t ? 'text-white' : 'bg-ink/5 text-ink/60'}`} style={filter === t ? { background: SIGNAL_META[t]?.color } : undefined}>{SIGNAL_META[t]?.icon} {n}</button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {!shown.length && <div className="p-6 text-center text-sm text-ink/45">✅ Nothing waiting right now.<br /><span className="text-xs">New requests appear here and light up their house on the map.</span></div>}
                {shown.map((s) => {
                    const h = byId[s.house_id], m = SIGNAL_META[s.type] || {};
                    return (
                        <button key={s.key} onClick={() => h && onPick(h)} className={`flex w-full gap-3 border-b border-ink/5 px-4 py-2.5 text-left hover:bg-ink/[.03] ${flash.includes(s.house_id) ? 'flash-in' : ''}`}>
                            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-sm" style={{ background: m.color + '22' }}>{m.icon}</span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{s.title}</span><span className="shrink-0 text-[10px] text-ink/40">{ago(s.at)}</span></span>
                                <span className="block truncate text-xs text-ink/55">{h ? 'Plot ' + h.label : ''}{s.sub ? ' · ' + s.sub : ''}</span>
                            </span>
                            <MapPin size={14} className="mt-1 shrink-0 text-ink/30" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function MapPage() {
    const { isResident, can, isSuper } = useAuth();
    const { data, reload } = useGet('map');
    const toast = useToast();
    const [layer, setLayer] = useState('overview');
    const [view, setView] = useState(() => (window.innerWidth < 768 ? '2d' : '3d'));
    const [selected, setSelected] = useState(null);
    const [fly, setFly] = useState(null);
    const [home, setHome] = useState(0);
    const [mode, setMode] = useState('auto');
    const [walkers, setWalkers] = useState([]);
    const [search, setSearch] = useState('');
    const [full, setFull] = useState(false);
    const [autoRotate, setAutoRotate] = useState(false);
    const [showRoute, setShowRoute] = useState(false);
    const [flash, setFlash] = useState([]);
    const [filter, setFilter] = useState('');
    const [panel, setPanel] = useState(true);
    const [inside, setInside] = useState(null);
    const seen = useRef(null), seenSig = useRef(null), sosFocused = useRef(new Set());
    const sun = useSun(mode);
    const wrap = useRef();
    useLive(['security', 'complaints', 'events', 'emergency', 'finance', 'users', 'noc', 'gym', 'library'], reload);
    useEffect(() => { const i = setInterval(reload, 12000); return () => clearInterval(i); }, [reload]);

    const signals = data?.signals || [];
    const groups = useMemo(() => signalsByHouse(signals), [signals]);
    const houses = useMemo(() => {
        if (!data) return [];
        const top = Object.fromEntries(groups.map((g) => [g.house_id, g.top.type]));
        return data.houses.map((h) => (top[h.id] ? { ...h, sig: top[h.id] } : h));
    }, [data, groups]);
    const mapData = useMemo(() => (data ? { ...data, houses } : null), [data, houses]);
    const byId = useMemo(() => Object.fromEntries(houses.map((h) => [h.id, h])), [houses]);
    const pos = (h) => (data?.site && h?.mx != null ? housePos(data.site, h) : null);
    const select = (h) => { setSelected(h); if (h) { setFly(pos(h)); setPanel(true); } };

    // walkers for new gate movements
    useEffect(() => {
        if (!data?.moves) return;
        const keyOf = (m) => `${m.id}-${m.status}`;
        if (seen.current === null) { seen.current = new Set(data.moves.map(keyOf)); return; }
        const fresh = data.moves.filter((m) => !seen.current.has(keyOf(m)) && m.status !== 'exited' && m.status !== 'rejected');
        data.moves.forEach((m) => seen.current.add(keyOf(m)));
        if (fresh.length) setWalkers((w) => [...w, ...fresh.map((m) => ({ ...m, key: keyOf(m) + Math.random() }))].slice(-12));
    }, [data]);

    // flash houses with new requests; SOS flies the camera there with the route
    useEffect(() => {
        if (!data) return;
        if (seenSig.current === null) { seenSig.current = new Set(signals.map((s) => s.key)); return; }
        const fresh = signals.filter((s) => !seenSig.current.has(s.key));
        signals.forEach((s) => seenSig.current.add(s.key));
        if (!fresh.length) return;
        const ids = [...new Set(fresh.map((s) => s.house_id))];
        setFlash((f) => [...new Set([...f, ...ids])]);
        setTimeout(() => setFlash((f) => f.filter((x) => !ids.includes(x))), 12000);
        fresh.slice(0, 2).forEach((s) => toast(`${SIGNAL_META[s.type]?.icon || ''} ${s.title}`, s.level === 'danger' ? 'danger' : 'warning', `Plot ${byId[s.house_id]?.label || ''} — highlighted on the map`));
        const sos = fresh.find((s) => s.type === 'sos');
        if (sos && byId[sos.house_id]) { select(byId[sos.house_id]); setShowRoute(true); }
    }, [data]); // eslint-disable-line

    // deep links: /map?house=12 · /map?sos=5
    useEffect(() => {
        if (!data) return;
        const q = new URLSearchParams(location.search);
        const hid = Number(q.get('house')), sid = Number(q.get('sos'));
        const s = sid && signals.find((x) => x.type === 'sos' && x.id === sid);
        const h = byId[s ? s.house_id : hid];
        if (h && !sosFocused.current.has('init')) { sosFocused.current.add('init'); select(h); if (s || q.get('route')) setShowRoute(true); if (q.get('inside')) setInside(h); }
    }, [data?.houses?.length]); // eslint-disable-line

    const route = useMemo(() => (showRoute && selected && data?.site ? routeTo(data.site, houses, byId[selected.id] || selected) : null), [showRoute, selected, data?.site, houses]); // eslint-disable-line
    const activeSos = signals.filter((s) => s.type === 'sos');

    const findHouse = (e) => {
        e.preventDefault();
        const q = search.trim().toUpperCase().replace(/\s/g, '');
        if (!q) return;
        const h = houses.find((x) => x.label.toUpperCase().replace(/\s/g, '') === q) || houses.find((x) => x.label.toUpperCase().endsWith('-' + q))
            || houses.find((x) => (x.owner || '').toUpperCase().includes(q)) || houses.find((x) => (x.street || '').toUpperCase().replace(/\s/g, '').includes(q));
        if (h) select(h); else toast('No plot found for “' + search + '”', 'error');
    };
    const toggleFull = () => { if (!document.fullscreenElement) { wrap.current?.requestFullscreen?.(); setFull(true); } else { document.exitFullscreen?.(); setFull(false); } };
    const st = data?.stats || {};

    if (data && !data.site?.boundary) {
        return (
            <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
                <MapIcon className="mx-auto mb-2 text-brand-600" size={32} />
                <div className="font-bold">Site plan not loaded yet</div>
                <p className="mt-1 text-sm text-ink/55">Load the Gulistan-e-Jauhar Block 19 plot map to place every house on the 3D map.</p>
                {isSuper && <button className="btn-primary mt-4" onClick={() => post('settings/site-plan').then(reload)}>Load Block 19 site plan</button>}
            </div>
        );
    }

    return (
        <div className="mx-auto flex h-full max-w-[1700px] flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/20"><MapIcon size={22} /></div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Community Map <span className="text-base font-semibold text-ink/40">· {data?.site?.name}</span></h1>
                        <p className="text-sm text-ink/55">Every plot of the real layout. Requests light up their house; emergencies show the route from the gate.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={findHouse} className="flex gap-1.5">
                        <label className="relative"><Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" /><input className="input w-48 pl-8" placeholder="Plot, owner or street" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
                        <button className="btn-outline"><Search size={15} /></button>
                    </form>
                    <div className="flex rounded-xl bg-ink/5 p-0.5">
                        {[['3d', Box, '3D'], ['2d', Layers, '2D plan']].map(([v, I, l]) => <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${view === v ? 'bg-surface shadow-sm text-brand-700' : 'text-ink/55'}`}><I size={14} />{l}</button>)}
                    </div>
                </div>
            </div>

            {activeSos.length > 0 && !isResident && (
                <div className="mb-3 overflow-hidden rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/25">
                    {activeSos.map((s) => {
                        const h = byId[s.house_id], info = h ? locateInfo(data.site, houses, h) : null;
                        return (
                            <div key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                <Siren className="animate-pulse" />
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold">{s.title} — Plot {h?.label}{info?.street ? ', ' + info.street : ''}</div>
                                    <div className="text-sm text-white/85">{s.sub}{info?.landmark ? ' · near ' + info.landmark : ''}{info?.route ? ` · ${info.route.metres} m from ${info.route.gate.label} (~${info.route.walkMin} min)` : ''}</div>
                                </div>
                                <button className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-red-700" onClick={() => { select(h); setShowRoute(true); }}><MapPin size={14} className="mr-1 inline" />Locate</button>
                                {(s.lat || info?.gps) && <a className="rounded-xl bg-white/15 px-3 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={mapsLink(s.lat ? { lat: s.lat, lng: s.lng } : info.gps)}><Navigation size={14} className="mr-1 inline" />Navigate</a>}
                            </div>
                        );
                    })}
                </div>
            )}

            <Tabs value={layer} onChange={setLayer} tabs={Object.entries(LAYERS).filter(([, l]) => !(l.official && isResident) && !(l.finance && !can('finance', true))).map(([key, l]) => ({ key, label: l.label, icon: l.icon, count: { requests: signals.length, visitors: st.inside, complaints: st.complaints, events: st.events }[key] }))} />

            <div className="grid min-h-[560px] flex-1 gap-3 lg:grid-cols-[1fr_340px]">
                <div ref={wrap} className="card relative min-h-[460px] overflow-hidden bg-night">
                    {!data ? <div className="grid h-full place-items-center"><Spinner /></div> : view === '2d' ? (
                        <PlanMap site={data.site} houses={houses} signals={signals} selectedId={selected?.id} onSelect={select} route={route} flash={flash} focus={selected?.id} height="100%" className="absolute inset-0 !rounded-none"
                            markers={[...(data.markers?.cameras || []).map((c) => ({ key: 'cam' + c.id, x: c.map_x, y: c.map_y, icon: '📹', color: '#0f766e', label: c.name, title: 'CCTV · ' + c.name })),
                                ...(data.markers?.checkpoints || []).map((c) => { const old = !c.last_scan || Date.now() - new Date(c.last_scan.scanned_at) > 2 * 3600e3; return { key: 'cp' + c.id, x: c.map_x, y: c.map_y, icon: '📍', color: old ? '#dc2626' : '#2563eb', label: c.name, title: `Patrol checkpoint · ${c.name}${old ? ' — overdue' : ''}` }; })]} />
                    ) : (
                        <Canvas frameloop={inside ? 'never' : 'always'} shadows dpr={[1, 2]} camera={{ position: [-8, 62, 70], fov: 42, far: 2000 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
                            <Suspense fallback={null}>
                                <World data={mapData} layer={layer} selected={selected} onSelect={select} sun={sun} walkers={walkers} setWalkers={setWalkers} fly={fly} autoRotate={autoRotate} signals={layer === 'overview' || layer === 'requests' ? signals : []} flash={flash} route={route} home={home} />
                            </Suspense>
                        </Canvas>
                    )}

                    {data && (
                        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
                            {[['Requests', signals.length, '#f5a524', Inbox], ['Inside', st.inside, '#22c55e', Users], ['At gate', st.awaiting, '#f59e0b', BellRing], ['Overstay', st.overstay, '#ef4444', Hourglass], ['Events', st.events, '#f5a524', CalendarHeart], ...(st.sos ? [['SOS', st.sos, '#ff2a2a', Siren]] : [])].map(([l, v, c, I]) => (
                                <div key={l} className={`flex items-center gap-2 rounded-xl bg-night/75 px-3 py-1.5 text-white backdrop-blur ${l === 'SOS' ? 'animate-pulse ring-2 ring-red-500' : ''}`}>
                                    <I size={14} style={{ color: c }} /><span className="text-lg font-bold leading-none">{v ?? 0}</span><span className="text-[11px] text-white/60">{l}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {view === '3d' && (
                        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                            <div className="flex overflow-hidden rounded-xl bg-night/75 text-white backdrop-blur">
                                {[['auto', Clock3, 'Real time'], ['day', Sun, 'Day'], ['night', Moon, 'Night']].map(([m, I, t]) => (
                                    <button key={m} title={t} onClick={() => setMode(m)} className={`grid size-9 place-items-center ${mode === m ? 'bg-white/20' : 'hover:bg-white/10'}`}><I size={16} /></button>
                                ))}
                            </div>
                            <button title="Whole community" onClick={() => { setSelected(null); setFly(null); setHome((n) => n + 1); }} className="grid size-9 place-items-center rounded-xl bg-night/75 text-white backdrop-blur hover:bg-night"><MapIcon size={16} /></button>
                            <button title="Slow orbit" onClick={() => setAutoRotate(!autoRotate)} className={`grid size-9 place-items-center rounded-xl text-white backdrop-blur ${autoRotate ? 'bg-brand-600' : 'bg-night/75 hover:bg-night'}`}><Radio size={16} /></button>
                            <button title="Fullscreen" onClick={toggleFull} className="grid size-9 place-items-center rounded-xl bg-night/75 text-white backdrop-blur hover:bg-night">{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
                        </div>
                    )}
                    <div className="absolute bottom-3 left-3 flex max-w-[75%] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-night/75 px-3 py-2 text-[11px] text-white backdrop-blur">
                        {['sos', 'gate', 'complaint', 'event_request', 'noc', 'incident', 'payment'].map((t) => <span key={t} className="flex items-center gap-1">{SIGNAL_META[t].icon}<span>{SIGNAL_META[t].label}</span></span>)}
                        <span className="text-white/45">· zoom in to read plot numbers & streets</span>
                    </div>
                </div>

                <div className={`card overflow-hidden ${panel ? '' : 'hidden lg:block'} max-h-[78vh] lg:max-h-none`}>
                    {selected ? (
                        <HousePanel onInside={() => setInside(byId[selected.id] || selected)} house={byId[selected.id] || selected} data={mapData} signals={signals} onClose={() => { setSelected(null); setShowRoute(false); }} showRoute={showRoute} setShowRoute={setShowRoute} refresh={reload} />
                    ) : (
                        <InboxPanel signals={signals} byId={byId} onPick={select} flash={flash} filter={filter} setFilter={setFilter} />
                    )}
                </div>
            </div>
            {inside && (
                <Suspense fallback={<div className="fixed inset-0 z-[60] grid place-items-center bg-stone-200/90"><Spinner /></div>}>
                    <HouseInterior house={inside} signals={signals} onClose={() => setInside(null)} onRoute={() => { setInside(null); select(inside); setShowRoute(true); }} />
                </Suspense>
            )}
        </div>
    );
}
