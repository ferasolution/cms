import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import { Map as MapIcon, X, Users, MessageSquareWarning, Wallet, CalendarHeart, Home, RotateCcw } from 'lucide-react';
import { useGet, PageHeader, Spinner, Badge, Tabs } from '../components/ui';
import { get, dt, money, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAlerts } from '../lib/alerts';

const GAP = 2.4;

const LAYERS = {
    overview: { label: 'Overview', icon: Home },
    visitors: { label: 'Visitors inside', icon: Users, official: true },
    complaints: { label: 'Open complaints', icon: MessageSquareWarning },
    maintenance: { label: 'Maintenance dues', icon: Wallet, official: true },
    events: { label: 'Events today', icon: CalendarHeart },
};

function colorFor(h, layer) {
    if (h.mine && layer === 'overview') return '#e0a94f';
    switch (layer) {
        case 'visitors': return h.visitors ? '#16a34a' : '#d6dedd';
        case 'complaints': return h.complaints ? '#dc2626' : '#d6dedd';
        case 'maintenance': return h.paid ? '#1f7a74' : '#f59e0b';
        case 'events': return h.event ? '#c98a2b' : '#d6dedd';
        default: return h.type === 'commercial' ? '#7c9cbf' : h.type === 'plot' ? '#b7c4a4' : '#e9efe9';
    }
}

function Building({ h, pos, layer, selected, onSelect }) {
    const ref = useRef();
    const [hover, setHover] = useState(false);
    const height = h.type === 'plot' ? 0.12 : 0.55 + h.floors * 0.55;
    const color = colorFor(h, layer);
    const pulse = (layer === 'visitors' && h.visitors) || (layer === 'complaints' && h.complaints) || (layer === 'events' && h.event);

    useFrame(({ clock }) => {
        if (!ref.current) return;
        const target = selected ? 1.12 : hover ? 1.06 : 1;
        const s = ref.current.scale;
        s.x += (target - s.x) * 0.2;
        s.z += (target - s.z) * 0.2;
        if (pulse && ref.current.material) ref.current.material.emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 3) * 0.2;
    });

    return (
        <group position={[pos[0], 0, pos[1]]}>
            <RoundedBox ref={ref} args={[1.6, height, 1.6]} radius={0.08} position={[0, height / 2, 0]} castShadow receiveShadow
                onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
                onClick={(e) => { e.stopPropagation(); onSelect(h); }}>
                <meshStandardMaterial color={color} emissive={pulse ? color : '#000000'} emissiveIntensity={pulse ? 0.3 : 0} roughness={0.6} />
            </RoundedBox>
            {h.type !== 'plot' && h.type !== 'commercial' && (
                <mesh position={[0, height + 0.28, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[1.25, 0.55, 4]} />
                    <meshStandardMaterial color={h.mine ? '#b5762a' : '#7a4b3a'} roughness={0.8} />
                </mesh>
            )}
            {(hover || selected) && (
                <Html position={[0, height + 1.1, 0]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
                    <div className="whitespace-nowrap rounded-lg bg-ink/90 px-2 py-1 text-xs font-semibold text-white shadow-lg">
                        {h.label}{h.owner ? ' · ' + h.owner : ''}
                        {h.visitors > 0 && <span className="ml-1 text-emerald-300">· {h.visitors} visitor{h.visitors > 1 ? 's' : ''}</span>}
                        {h.complaints > 0 && <span className="ml-1 text-red-300">· {h.complaints} complaint{h.complaints > 1 ? 's' : ''}</span>}
                    </div>
                </Html>
            )}
        </group>
    );
}

function Tree({ p }) {
    return (
        <group position={[p[0], 0, p[1]]}>
            <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.07, 0.09, 0.6]} /><meshStandardMaterial color="#6b4f3a" /></mesh>
            <mesh position={[0, 0.85, 0]} castShadow><icosahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color="#3f8f5a" flatShading /></mesh>
        </group>
    );
}

function Scene({ houses, layer, selected, onSelect }) {
    const { placed, w, d, cx, cz } = useMemo(() => {
        const xs = houses.map((h) => h.x);
        const ys = houses.map((h) => h.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const cx = ((minX + maxX) / 2) * GAP, cz = ((minY + maxY) / 2) * GAP;
        return {
            placed: houses.map((h) => ({ h, pos: [h.x * GAP - cx, h.y * GAP - cz] })),
            w: (maxX - minX + 4) * GAP, d: (maxY - minY + 4) * GAP, cx, cz,
        };
    }, [houses]);

    // Roads run along every grid row/column that has no house.
    const roads = useMemo(() => {
        const occX = new Set(houses.map((h) => h.x));
        const occY = new Set(houses.map((h) => h.y));
        const xs = houses.map((h) => h.x), ys = houses.map((h) => h.y);
        const out = [];
        for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) if (!occX.has(x)) out.push({ x: x * GAP - cx, vertical: true });
        for (let y = Math.min(...ys) - 1; y <= Math.max(...ys) + 1; y++) if (!occY.has(y)) out.push({ z: y * GAP - cz, vertical: false });
        return out;
    }, [houses, cx, cz]);

    const trees = useMemo(() => {
        const t = [];
        for (let i = 0; i < 28; i++) {
            const side = i % 4;
            const k = (i / 28) * 2 - 1;
            t.push(side === 0 ? [k * w * 0.48, -d / 2 + 0.6] : side === 1 ? [k * w * 0.48, d / 2 - 0.6] : side === 2 ? [-w / 2 + 0.6, k * d * 0.45] : [w / 2 - 0.6, k * d * 0.45]);
        }
        return t;
    }, [w, d]);

    return (
        <>
            <ambientLight intensity={0.65} />
            <directionalLight position={[18, 30, 14]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
            <hemisphereLight args={['#fdf6e8', '#3f6f5a', 0.35]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={() => onSelect(null)}>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial color="#a9c79a" />
            </mesh>
            {roads.map((r, i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[r.vertical ? r.x : 0, 0.01, r.vertical ? 0 : r.z]} receiveShadow>
                    <planeGeometry args={r.vertical ? [1.5, d] : [w, 1.5]} />
                    <meshStandardMaterial color="#5d6766" />
                </mesh>
            ))}
            {/* boundary wall + main gate */}
            {[[0, -d / 2, w, 0.12], [0, d / 2, w, 0.12], [-w / 2, 0, 0.12, d], [w / 2, 0, 0.12, d]].map(([x, z, sx, sz], i) => (
                <mesh key={i} position={[x, 0.35, z]} castShadow><boxGeometry args={[sx, 0.7, sz]} /><meshStandardMaterial color="#cbbfa8" /></mesh>
            ))}
            <group position={[0, 0, d / 2]}>
                <mesh position={[-1.3, 1, 0]} castShadow><boxGeometry args={[0.4, 2, 0.4]} /><meshStandardMaterial color="#124f4b" /></mesh>
                <mesh position={[1.3, 1, 0]} castShadow><boxGeometry args={[0.4, 2, 0.4]} /><meshStandardMaterial color="#124f4b" /></mesh>
                <mesh position={[0, 2.1, 0]} castShadow><boxGeometry args={[3, 0.35, 0.45]} /><meshStandardMaterial color="#124f4b" /></mesh>
                <Html position={[0, 2.9, 0]} center distanceFactor={18} style={{ pointerEvents: 'none' }}>
                    <div className="rounded-md bg-brand-700 px-2 py-0.5 text-[11px] font-bold text-white">MAIN GATE</div>
                </Html>
            </group>
            {trees.map((p, i) => <Tree key={i} p={p} />)}
            {placed.map(({ h, pos }) => <Building key={h.id} h={h} pos={pos} layer={layer} selected={selected?.id === h.id} onSelect={onSelect} />)}
        </>
    );
}

function HousePanel({ id, onClose }) {
    const [d, setD] = useState(null);
    useEffect(() => { setD(null); get(`houses/${id}`).then(setD).catch(() => setD({ error: true })); }, [id]);
    return (
        <div className="card absolute bottom-3 right-3 top-3 z-10 flex w-[min(340px,calc(100%-1.5rem))] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                <div className="font-bold">{d?.house ? `House ${d.house.label}` : 'House'}</div>
                <button className="btn-ghost btn-sm" onClick={onClose}><X size={15} /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                {!d ? <div className="grid h-32 place-items-center"><Spinner /></div> : d.error ? <div className="text-black/50">You can only view your own house.</div> : (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            {[['Owner', d.house.owner_name], ['Phone', d.house.owner_phone], ['Street', d.house.street], ['Type', title(d.house.type)], ['Maintenance', money(d.house.monthly_maintenance)], ['Floors', d.house.floors]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-black/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {d.house.residents?.length > 0 && <div><div className="mb-1 font-semibold">Residents</div>{d.house.residents.map((r) => <div key={r.id} className="text-black/70">{r.name} <span className="text-xs text-black/40">{r.phone}</span></div>)}</div>}
                        {d.visitors?.length > 0 && <div><div className="mb-1 font-semibold">Recent visitors</div>{d.visitors.map((v) => <div key={v.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{v.name} <span className="text-xs text-black/45">({v.category})</span></span><Badge value={v.exit_at ? 'exited' : 'inside'} /></div>)}</div>}
                        {d.complaints?.length > 0 && <div><div className="mb-1 font-semibold">Complaints</div>{d.complaints.map((c) => <div key={c.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{c.title}</span><Badge value={c.status} /></div>)}</div>}
                        {d.payments?.length > 0 && <div><div className="mb-1 font-semibold">Payments</div>{d.payments.map((p) => <div key={p.id} className="flex justify-between py-0.5 text-black/70"><span>{title(p.category)} {p.period || ''}</span><span>{money(p.amount)} · {dt(p.date, false)}</span></div>)}</div>}
                    </>
                )}
            </div>
        </div>
    );
}

export default function MapPage() {
    const { isResident } = useAuth();
    const { data, reload } = useGet('map');
    const [layer, setLayer] = useState('overview');
    const [selected, setSelected] = useState(null);
    const [resetKey, setResetKey] = useState(0);
    const { tick } = useAlerts();
    useEffect(() => { if (tick) reload(); }, [tick]); // eslint-disable-line
    useEffect(() => { const i = setInterval(reload, 30000); return () => clearInterval(i); }, [reload]);

    const counts = useMemo(() => !data ? {} : {
        visitors: data.reduce((a, h) => a + h.visitors, 0),
        complaints: data.filter((h) => h.complaints).length,
        maintenance: data.filter((h) => h.paid === false).length,
        events: data.filter((h) => h.event).length,
    }, [data]);

    const legend = {
        overview: [['#e9efe9', 'House'], ['#7c9cbf', 'Commercial'], ['#e0a94f', 'Your house']],
        visitors: [['#16a34a', 'Has visitors inside'], ['#d6dedd', 'None']],
        complaints: [['#dc2626', 'Open complaint'], ['#d6dedd', 'None']],
        maintenance: [['#1f7a74', 'Paid this month'], ['#f59e0b', 'Unpaid']],
        events: [['#c98a2b', 'Event today'], ['#d6dedd', 'None']],
    }[layer];

    return (
        <div className="mx-auto flex h-full max-w-7xl flex-col">
            <PageHeader icon={MapIcon} title="3D Community Map" subtitle="Drag to rotate, scroll to zoom, tap a house for details. Updates live.">
                <button className="btn-outline" onClick={() => setResetKey((k) => k + 1)}><RotateCcw size={15} />Reset view</button>
            </PageHeader>
            <Tabs value={layer} onChange={setLayer} tabs={Object.entries(LAYERS).filter(([, l]) => !(l.official && isResident)).map(([key, l]) => ({ key, label: l.label, icon: l.icon, count: counts[key] }))} />
            <div className="card relative min-h-[460px] flex-1 overflow-hidden bg-gradient-to-b from-sky-100 to-sand-50">
                {!data ? <div className="grid h-full place-items-center"><Spinner /></div> : !data.length ? <div className="grid h-full place-items-center text-sm text-black/50">Add houses with map positions to see the community map.</div> : (
                    <Canvas key={resetKey} shadows dpr={[1, 2]} camera={{ position: [0, 26, 30], fov: 45 }}>
                        <Suspense fallback={null}>
                            <Scene houses={data} layer={layer} selected={selected} onSelect={setSelected} />
                        </Suspense>
                        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.2} minDistance={8} maxDistance={80} />
                    </Canvas>
                )}
                <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
                    {legend.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ background: c }} />{l}</span>)}
                </div>
                {selected && <HousePanel id={selected.id} onClose={() => setSelected(null)} />}
            </div>
        </div>
    );
}
