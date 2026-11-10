import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, RoundedBox, Sky, Stars, CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { Map as MapIcon, X, Users, MessageSquareWarning, Wallet, CalendarHeart, Home, Siren, Sun, Moon, Clock3, Search, Maximize2, Minimize2, Radio, Hourglass, BellRing } from 'lucide-react';
import { useGet, Spinner, Badge, Tabs } from '../components/ui';
import { get, dt, money, title, ago } from '../lib/api';
import { useAuth } from '../lib/auth';
import SiteScene, { housePos } from '../components/SiteScene';
import { useLive } from '../lib/alerts';

const GAP = 2.4;
const LAYERS = {
    overview: { label: 'Live overview', icon: Radio },
    visitors: { label: 'Visitors', icon: Users, official: true },
    complaints: { label: 'Complaints', icon: MessageSquareWarning },
    maintenance: { label: 'Dues', icon: Wallet, finance: true },
    events: { label: 'Events', icon: CalendarHeart },
};

/** Sun position, light colour and "is it night" from the local hour (or a forced day/night mode). */
function useSun(mode) {
    const [h, setH] = useState(() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; });
    useEffect(() => { const i = setInterval(() => { const d = new Date(); setH(d.getHours() + d.getMinutes() / 60); }, 60000); return () => clearInterval(i); }, []);
    const hour = mode === 'day' ? 13 : mode === 'night' ? 22 : h;
    const t = ((hour - 6) / 12) * Math.PI; // 6am → 0, 6pm → π
    const elev = Math.sin(t);
    const night = elev < -0.05;
    const dusk = !night && elev < 0.25;
    return {
        hour, night, dusk,
        sun: [Math.cos(t) * 60, Math.max(elev, -0.2) * 60, -25],
        light: night ? 0.12 : dusk ? 0.75 : 1.35,
        ambient: night ? 0.18 : dusk ? 0.45 : 0.6,
        color: night ? '#7f9cff' : dusk ? '#ffb070' : '#fff7e8',
    };
}

function houseColor(h, layer) {
    if (h.sos) return '#ef4444';
    if (layer === 'overview') return h.mine ? '#e0a94f' : h.type === 'commercial' ? '#8aa8c8' : h.type === 'plot' ? '#b7c4a4' : '#eef2ee';
    switch (layer) {
        case 'visitors': return h.awaiting ? '#f59e0b' : h.overstay ? '#ef4444' : h.visitors ? '#22c55e' : '#d3dbda';
        case 'complaints': return h.complaints ? ['#fca5a5', '#f87171', '#ef4444', '#dc2626'][Math.min(3, h.complaints - 1)] : '#d3dbda';
        case 'maintenance': return h.paid ? '#1f7a74' : '#f59e0b';
        case 'events': return h.event ? '#c98a2b' : '#d3dbda';
        default: return '#eef2ee';
    }
}

/** Floating status beacon above a house (rotating ring + orb). */
function Beacon({ y, color, pulse = 1, size = 0.28 }) {
    const g = useRef();
    useFrame(({ clock }) => {
        if (!g.current) return;
        g.current.rotation.y = clock.elapsedTime * 1.5;
        g.current.position.y = y + Math.sin(clock.elapsedTime * 2.2) * 0.12;
        const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.12 * pulse;
        g.current.scale.setScalar(s);
    });
    return (
        <group ref={g} position={[0, y, 0]}>
            <mesh><octahedronGeometry args={[size, 0]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[size * 1.7, 0.035, 8, 32]} /><meshBasicMaterial color={color} transparent opacity={0.7} /></mesh>
        </group>
    );
}

/** SOS: pillar of red light + expanding shockwave rings. */
function SosPillar() {
    const ring = useRef();
    const beam = useRef();
    useFrame(({ clock }) => {
        const t = (clock.elapsedTime % 1.6) / 1.6;
        if (ring.current) { ring.current.scale.setScalar(1 + t * 5); ring.current.material.opacity = 0.8 * (1 - t); }
        if (beam.current) beam.current.material.opacity = 0.35 + Math.sin(clock.elapsedTime * 8) * 0.15;
    });
    return (
        <group>
            <mesh ref={beam} position={[0, 7, 0]}><cylinderGeometry args={[0.35, 0.9, 14, 16, 1, true]} /><meshBasicMaterial color="#ff2a2a" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} /></mesh>
            <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[0.9, 1.05, 48]} /><meshBasicMaterial color="#ff2a2a" transparent side={THREE.DoubleSide} /></mesh>
            <pointLight color="#ff2a2a" intensity={25} distance={9} position={[0, 2, 0]} />
        </group>
    );
}

function Building({ h, pos, layer, selected, onSelect, night }) {
    const ref = useRef();
    const [hover, setHover] = useState(false);
    const height = h.type === 'plot' ? 0.12 : 0.55 + h.floors * 0.55;
    const color = houseColor(h, layer);
    const lit = night && h.type !== 'plot' && (h.id * 7) % 10 > 2;
    useFrame(() => {
        if (!ref.current) return;
        const target = selected ? 1.12 : hover ? 1.06 : 1;
        ref.current.scale.x += (target - ref.current.scale.x) * 0.2;
        ref.current.scale.z += (target - ref.current.scale.z) * 0.2;
    });
    const beaconY = height + 1.6;
    const beacons = [];
    if (layer === 'overview' || layer === 'visitors') {
        if (h.awaiting) beacons.push('#f59e0b');
        else if (h.overstay) beacons.push('#ef4444');
        else if (h.visitors) beacons.push('#22c55e');
    }
    if ((layer === 'overview' || layer === 'complaints') && h.complaints) beacons.push('#f43f5e');
    if ((layer === 'overview' || layer === 'events') && h.event) beacons.push('#e0a94f');

    return (
        <group position={[pos[0], 0, pos[1]]}>
            <RoundedBox ref={ref} args={[1.6, height, 1.6]} radius={0.08} position={[0, height / 2, 0]} castShadow receiveShadow
                onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
                onClick={(e) => { e.stopPropagation(); onSelect(h, pos); }}>
                <meshStandardMaterial color={color} roughness={0.55} emissive={h.sos ? '#ff0000' : '#000'} emissiveIntensity={h.sos ? 0.5 : 0} />
            </RoundedBox>
            {/* windows glow at night */}
            {h.type !== 'plot' && Array.from({ length: h.floors }).map((_, f) => (
                <mesh key={f} position={[0, 0.65 + f * 0.55, 0.805]}>
                    <planeGeometry args={[1.1, 0.22]} />
                    <meshStandardMaterial color={lit ? '#ffd27a' : '#3d5260'} emissive={lit ? '#ffb347' : '#000'} emissiveIntensity={lit ? 1.6 : 0} />
                </mesh>
            ))}
            {h.type !== 'plot' && h.type !== 'commercial' && (
                <mesh position={[0, height + 0.28, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[1.25, 0.55, 4]} />
                    <meshStandardMaterial color={h.mine ? '#b5762a' : '#8a4b36'} roughness={0.8} />
                </mesh>
            )}
            {beacons.map((c, i) => <group key={c} position={[(i - (beacons.length - 1) / 2) * 0.7, 0, 0]}><Beacon y={beaconY} color={c} /></group>)}
            {h.sos && <SosPillar />}
            {(hover || selected) && (
                <Html position={[0, height + (beacons.length ? 2.6 : 1.2), 0]} center distanceFactor={16} style={{ pointerEvents: 'none' }}>
                    <div className="whitespace-nowrap rounded-xl bg-[#0b1514]/90 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur">
                        <div>{h.label}{h.owner ? ' · ' + h.owner : ''}</div>
                        <div className="mt-0.5 flex gap-2 text-[10px] font-normal text-white/70">
                            {h.sos && <span className="font-bold text-red-300">SOS {h.sos}</span>}
                            {h.awaiting > 0 && <span className="text-amber-300">{h.awaiting} at gate</span>}
                            {h.visitors > 0 && <span className="text-emerald-300">{h.visitors} visitor{h.visitors > 1 ? 's' : ''}</span>}
                            {h.overstay > 0 && <span className="text-red-300">{h.overstay} overstay</span>}
                            {h.complaints > 0 && <span className="text-rose-300">{h.complaints} complaint{h.complaints > 1 ? 's' : ''}</span>}
                            {h.event && <span className="text-amber-200">event today</span>}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

function Tree({ p, s = 1 }) {
    return (
        <group position={[p[0], 0, p[1]]} scale={s}>
            <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, 0.6]} /><meshStandardMaterial color="#6b4f3a" /></mesh>
            <mesh position={[0, 0.85, 0]} castShadow><icosahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color="#3f8f5a" flatShading /></mesh>
            <mesh position={[0, 1.25, 0]} castShadow><icosahedronGeometry args={[0.28, 0]} /><meshStandardMaterial color="#4ea56a" flatShading /></mesh>
        </group>
    );
}

function StreetLamp({ p, night }) {
    return (
        <group position={[p[0], 0, p[1]]}>
            <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.04, 0.05, 1.8]} /><meshStandardMaterial color="#2d3a3a" /></mesh>
            <mesh position={[0, 1.85, 0]}><sphereGeometry args={[0.13, 12, 12]} /><meshStandardMaterial color={night ? '#fff1c4' : '#d9dfe0'} emissive={night ? '#ffd27a' : '#000'} emissiveIntensity={night ? 3 : 0} /></mesh>
        </group>
    );
}

/** Community facilities strip: mosque, hall, gym, park with lake, guard post. */
function Facilities({ z, w, night }) {
    const x0 = -w / 2;
    return (
        <group position={[0, 0, z]}>
            {/* Mosque */}
            <group position={[x0 + w * 0.14, 0, 0]}>
                <mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[3, 1.6, 2.4]} /><meshStandardMaterial color="#f4efe4" /></mesh>
                <mesh position={[0, 1.9, 0]} castShadow><sphereGeometry args={[0.9, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#2f8f7f" metalness={0.2} roughness={0.4} /></mesh>
                <mesh position={[1.7, 1.8, 0.9]} castShadow><cylinderGeometry args={[0.16, 0.2, 3.6, 12]} /><meshStandardMaterial color="#f4efe4" /></mesh>
                <mesh position={[1.7, 3.8, 0.9]}><coneGeometry args={[0.22, 0.5, 12]} /><meshStandardMaterial color="#2f8f7f" emissive={night ? '#2f8f7f' : '#000'} emissiveIntensity={night ? 0.8 : 0} /></mesh>
                <Label text="MOSQUE" y={4.4} />
            </group>
            {/* Community hall */}
            <group position={[x0 + w * 0.36, 0, 0]}>
                <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[3.6, 2, 2.6]} /><meshStandardMaterial color="#d7c3a1" /></mesh>
                <mesh position={[0, 2.25, 0]} rotation={[0, 0, 0]} castShadow><cylinderGeometry args={[1.5, 1.5, 3.6, 3, 1, false, 0, Math.PI]} /><meshStandardMaterial color="#9b5d3a" /></mesh>
                <mesh position={[0, 0.7, 1.31]}><planeGeometry args={[2.6, 0.5]} /><meshStandardMaterial color={night ? '#ffd27a' : '#55707a'} emissive={night ? '#ffb347' : '#000'} emissiveIntensity={night ? 1.5 : 0} /></mesh>
                <Label text="COMMUNITY HALL" y={3.6} />
            </group>
            {/* Gym & club */}
            <group position={[x0 + w * 0.58, 0, 0]}>
                <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[3, 1.8, 2.4]} /><meshStandardMaterial color="#3b4c5a" metalness={0.3} roughness={0.4} /></mesh>
                <mesh position={[0, 0.95, 1.21]}><planeGeometry args={[2.6, 1.2]} /><meshStandardMaterial color="#7fd1e8" emissive={night ? '#3cc9f0' : '#1a6f86'} emissiveIntensity={night ? 1.4 : 0.25} transparent opacity={0.9} /></mesh>
                <mesh position={[2.4, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.6, 2.4]} /><meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.4} /></mesh>
                <Label text="GYM · POOL" y={2.6} />
            </group>
            {/* Park + lake */}
            <group position={[x0 + w * 0.82, 0, 0]}>
                <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.5, 40]} /><meshStandardMaterial color="#4cc3e0" roughness={0.15} metalness={0.3} /></mesh>
                {[[-2.2, -1], [2.2, -0.8], [-1.8, 1.3], [2, 1.2], [0, -1.9], [0.2, 1.9]].map((p, i) => <Tree key={i} p={p} s={1.2} />)}
                <Label text="PARK" y={2.2} />
            </group>
        </group>
    );
}

function Label({ text, y }) {
    return <Html position={[0, y, 0]} center distanceFactor={22} style={{ pointerEvents: 'none' }}><div className="rounded-md bg-[#0b2e2c]/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">{text}</div></Html>;
}

/** A visitor walking (or driving) from the gate to the house — spawned from live gate movements. */
function Walker({ from, to, color, car, onDone }) {
    const ref = useRef();
    const t0 = useRef(null);
    const path = useMemo(() => {
        const mid1 = [from[0], to[1] + GAP / 2 + 0.2];
        const mid2 = [to[0], to[1] + GAP / 2 + 0.2];
        const pts = [from, mid1, mid2, [to[0], to[1] + 0.9]];
        const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
        return { pts, seg, total: seg.reduce((a, b) => a + b, 0) };
    }, [from, to]);
    useFrame(({ clock }) => {
        if (!ref.current) return;
        if (t0.current === null) t0.current = clock.elapsedTime;
        const speed = car ? 9 : 5;
        let d = (clock.elapsedTime - t0.current) * speed;
        if (d >= path.total) { onDone(); return; }
        let i = 0;
        while (d > path.seg[i]) { d -= path.seg[i]; i++; }
        const a = path.pts[i], b = path.pts[i + 1], k = d / path.seg[i];
        ref.current.position.set(a[0] + (b[0] - a[0]) * k, car ? 0.25 : 0.35 + Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.08, a[1] + (b[1] - a[1]) * k);
        ref.current.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    });
    return (
        <group ref={ref}>
            {car ? (
                <>
                    <mesh castShadow><boxGeometry args={[0.55, 0.3, 1]} /><meshStandardMaterial color={color} /></mesh>
                    <mesh position={[0, 0.25, -0.05]}><boxGeometry args={[0.45, 0.22, 0.55]} /><meshStandardMaterial color="#cfe8ff" /></mesh>
                    <pointLight color="#fff6d0" intensity={4} distance={3} position={[0, 0.2, 0.6]} />
                </>
            ) : (
                <>
                    <mesh castShadow position={[0, 0.25, 0]}><capsuleGeometry args={[0.13, 0.3, 4, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} /></mesh>
                    <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.11, 10, 10]} /><meshStandardMaterial color="#f1c7a3" /></mesh>
                </>
            )}
            <mesh position={[0, 1.15, 0]}><coneGeometry args={[0.12, 0.28, 8]} /><meshBasicMaterial color={color} /></mesh>
        </group>
    );
}

function Gate({ z, night }) {
    const bar = useRef();
    useFrame(({ clock }) => { if (bar.current) bar.current.rotation.z = Math.max(0, Math.sin(clock.elapsedTime * 0.7)) * 1.2; });
    return (
        <group position={[0, 0, z]}>
            {[-1.6, 1.6].map((x) => <mesh key={x} position={[x, 1.1, 0]} castShadow><boxGeometry args={[0.45, 2.2, 0.45]} /><meshStandardMaterial color="#124f4b" /></mesh>)}
            <mesh position={[0, 2.3, 0]} castShadow><boxGeometry args={[3.6, 0.38, 0.5]} /><meshStandardMaterial color="#124f4b" emissive={night ? '#e0a94f' : '#000'} emissiveIntensity={night ? 0.25 : 0} /></mesh>
            <group ref={bar} position={[-1.3, 0.85, 0.5]}><mesh position={[1.3, 0, 0]}><boxGeometry args={[2.6, 0.08, 0.08]} /><meshStandardMaterial color="#ef4444" /></mesh></group>
            <mesh position={[2.6, 0.7, 0.4]} castShadow><boxGeometry args={[1, 1.4, 1]} /><meshStandardMaterial color="#e8e2d4" /></mesh>
            <mesh position={[2.6, 0.85, 0.91]}><planeGeometry args={[0.6, 0.35]} /><meshStandardMaterial color="#ffd27a" emissive="#ffb347" emissiveIntensity={night ? 1.5 : 0.2} /></mesh>
            <Label text="MAIN GATE" y={3.1} />
        </group>
    );
}

function FlyTo({ target, controls, near }) {
    useEffect(() => {
        if (!target || !controls.current) return;
        const [x, z] = target;
        if (near) controls.current.setLookAt(x + 9, 13, z + 15, x, 0.6, z, true);
        else controls.current.setLookAt(x + 7, 9, z + 10, x, 0.8, z, true);
    }, [target, controls, near]);
    return null;
}

function AutoRotate({ enabled, controls }) {
    useFrame((_, dt) => { if (enabled && controls.current) controls.current.azimuthAngle += dt * 0.05; });
    return null;
}

function Scene({ data, layer, selected, onSelect, sun, walkers, setWalkers, fly, autoRotate }) {
    const houses = data.houses;
    const controls = useRef();
    const geo = useMemo(() => {
        const xs = houses.map((h) => h.x), ys = houses.map((h) => h.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const cx = ((minX + maxX) / 2) * GAP, cz = ((minY + maxY) / 2) * GAP;
        const w = (maxX - minX + 4) * GAP;
        const dHouses = (maxY - minY + 4) * GAP;
        const extra = 9; // facilities strip at the back
        const pos = {};
        houses.forEach((h) => { pos[h.id] = [h.x * GAP - cx, h.y * GAP - cz]; });
        const occX = new Set(xs), occY = new Set(ys);
        const roads = [];
        for (let x = minX - 1; x <= maxX + 1; x++) if (!occX.has(x)) roads.push({ x: x * GAP - cx, v: true });
        for (let y = minY - 1; y <= maxY + 1; y++) if (!occY.has(y)) roads.push({ z: y * GAP - cz, v: false });
        return { w, d: dHouses + extra, frontZ: dHouses / 2, backZ: -dHouses / 2 - extra, facZ: -dHouses / 2 - extra / 2, pos, roads, centerZ: -extra / 2 };
    }, [houses]);
    const { w, d, frontZ, backZ, pos, roads, centerZ } = geo;
    const trees = useMemo(() => Array.from({ length: 30 }, (_, i) => { const k = (i / 29) * 2 - 1; return i % 2 ? [k * w * 0.47, frontZ - 0.7] : [i % 4 === 0 ? -w / 2 + 0.7 : w / 2 - 0.7, backZ + 9 + ((i * 37) % 100) / 100 * (frontZ - backZ - 10)]; }), [w, frontZ, backZ]);
    const lamps = useMemo(() => roads.flatMap((r) => (r.v ? [-0.3, 0, 0.3].map((k) => [r.x + 0.9, k * (frontZ - backZ) + centerZ]) : [-0.35, 0, 0.35].map((k) => [k * w, r.z + 0.9]))).slice(0, 26), [roads, w, frontZ, backZ, centerZ]);
    const gate = [0, frontZ];

    return (
        <>
            <Sky sunPosition={sun.sun} turbidity={sun.night ? 20 : 6} rayleigh={sun.night ? 0.2 : sun.dusk ? 3 : 1.2} mieCoefficient={0.006} mieDirectionalG={0.85} />
            {sun.night && <Stars radius={120} depth={40} count={2500} factor={4} fade speed={0.6} />}
            <fog attach="fog" args={[sun.night ? '#0a1424' : sun.dusk ? '#f0c9a0' : '#cfe4ea', 45, 140]} />
            <ambientLight intensity={sun.ambient} />
            <hemisphereLight args={[sun.night ? '#24345a' : '#fdf6e8', '#3f6f5a', sun.night ? 0.25 : 0.4]} />
            <directionalLight position={sun.night ? [-30, 40, 20] : sun.sun} intensity={sun.light} color={sun.color} castShadow shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-bias={-0.0004} />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, centerZ]} receiveShadow onClick={() => onSelect(null)}>
                <planeGeometry args={[w + 30, d + 30]} /><meshStandardMaterial color={sun.night ? '#24402f' : '#7fae6b'} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]} receiveShadow>
                <planeGeometry args={[w, d]} /><meshStandardMaterial color={sun.night ? '#2e4a37' : '#a9c79a'} />
            </mesh>
            {roads.map((r, i) => (
                <group key={i}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.v ? r.x : 0, 0.012, r.v ? centerZ : r.z]} receiveShadow>
                        <planeGeometry args={r.v ? [1.5, d] : [w, 1.5]} /><meshStandardMaterial color="#4b5554" />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.v ? r.x : 0, 0.016, r.v ? centerZ : r.z]}>
                        <planeGeometry args={r.v ? [0.06, d] : [w, 0.06]} /><meshBasicMaterial color="#e8d38a" transparent opacity={0.6} />
                    </mesh>
                </group>
            ))}
            {[[0, backZ, w, 0.14], [0, frontZ, w, 0.14], [-w / 2, centerZ, 0.14, d], [w / 2, centerZ, 0.14, d]].map(([x, z, sx, sz], i) => (
                <mesh key={i} position={[x, 0.4, z]} castShadow><boxGeometry args={[sx, 0.8, sz]} /><meshStandardMaterial color="#cbbfa8" /></mesh>
            ))}
            <Gate z={frontZ} night={sun.night} />
            <Facilities z={geo.facZ} w={w} night={sun.night} />
            {trees.map((p, i) => <Tree key={i} p={p} />)}
            {lamps.map((p, i) => <StreetLamp key={i} p={p} night={sun.night} />)}
            {sun.night && lamps.filter((_, i) => i % 3 === 0).map((p, i) => <pointLight key={'pl' + i} position={[p[0], 1.9, p[1]]} intensity={6} distance={6} color="#ffcf80" />)}
            {houses.map((h) => <Building key={h.id} h={h} pos={pos[h.id]} layer={layer} selected={selected?.id === h.id} onSelect={onSelect} night={sun.night} />)}
            {walkers.map((wk) => pos[wk.house_id] && (
                <Walker key={wk.key} from={gate} to={pos[wk.house_id]} car={!!wk.vehicle_no} color={wk.status === 'awaiting' ? '#f59e0b' : wk.status === 'exited' ? '#94a3b8' : '#22c55e'}
                    onDone={() => setWalkers((ws) => ws.filter((x) => x.key !== wk.key))} />
            ))}
            <CameraControls ref={controls} makeDefault minDistance={6} maxDistance={110} maxPolarAngle={Math.PI / 2.15} smoothTime={0.6} />
            <FlyTo target={fly} controls={controls} />
            <AutoRotate enabled={autoRotate} controls={controls} />
        </>
    );
}

function SiteWorld({ data, layer, selected, onSelect, sun, walkers, setWalkers, fly, autoRotate }) {
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
            <SiteScene data={data} layer={layer} selected={selected} onSelect={onSelect} night={sun.night} walkers={walkers} setWalkers={setWalkers} />
            <CameraControls ref={controls} makeDefault minDistance={4} maxDistance={220} maxPolarAngle={Math.PI / 2.15} smoothTime={0.6} />
            <FlyTo target={fly} controls={controls} near />
            <AutoRotate enabled={autoRotate} controls={controls} />
        </>
    );
}

function HousePanel({ id, onClose }) {
    const [d, setD] = useState(null);
    useEffect(() => { setD(null); get(`houses/${id}`).then(setD).catch(() => setD({ error: true })); }, [id]);
    return (
        <div className="card absolute bottom-3 right-3 top-3 z-10 flex w-[min(340px,calc(100%-1.5rem))] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3">
                <div className="font-bold">{d?.house ? `House ${d.house.label}` : 'House'}</div>
                <button className="btn-ghost btn-sm" onClick={onClose}><X size={15} /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                {!d ? <div className="grid h-32 place-items-center"><Spinner /></div> : d.error ? <div className="text-ink/50">You can only view your own house.</div> : (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            {[['Owner', d.house.owner_name], ['Phone', d.house.owner_phone], ['Street', d.house.street], ['Type', title(d.house.type)], ['Maintenance', money(d.house.monthly_maintenance)], ['Floors', d.house.floors]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-ink/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {d.house.residents?.length > 0 && <div><div className="mb-1 font-semibold">Accounts</div>{d.house.residents.map((r) => <div key={r.id} className="text-ink/70">{r.name} <span className="text-xs text-ink/40">{r.household_role ? title(r.household_role) : ''} {r.phone}</span></div>)}</div>}
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

export default function MapPage() {
    const { isResident, can } = useAuth();
    const { data, reload } = useGet('map');
    const [layer, setLayer] = useState('overview');
    const [selected, setSelected] = useState(null);
    const [fly, setFly] = useState(null);
    const [mode, setMode] = useState('auto');
    const [walkers, setWalkers] = useState([]);
    const [search, setSearch] = useState('');
    const [full, setFull] = useState(false);
    const [autoRotate, setAutoRotate] = useState(false);
    const seen = useRef(null);
    const sun = useSun(mode);
    const wrap = useRef();
    useLive(['security', 'complaints', 'events', 'emergency', 'finance', 'users'], reload);
    useEffect(() => { const i = setInterval(reload, 15000); return () => clearInterval(i); }, [reload]);

    // Spawn walkers for gate movements we haven't animated yet.
    useEffect(() => {
        if (!data?.moves) return;
        const keyOf = (m) => `${m.id}-${m.status}`;
        if (seen.current === null) { seen.current = new Set(data.moves.map(keyOf)); return; }
        const fresh = data.moves.filter((m) => !seen.current.has(keyOf(m)) && m.status !== 'exited' && m.status !== 'rejected');
        data.moves.forEach((m) => seen.current.add(keyOf(m)));
        if (fresh.length) setWalkers((w) => [...w, ...fresh.map((m) => ({ ...m, key: keyOf(m) + Math.random() }))].slice(-12));
    }, [data]);

    // Deep link: /map?house=12 flies to that house.
    useEffect(() => {
        const id = Number(new URLSearchParams(location.search).get('house'));
        if (id && data?.houses) { const h = data.houses.find((x) => x.id === id); if (h) setSelected(h); }
    }, [data?.houses?.length]); // eslint-disable-line

    const siteMode = !!(data?.site && data.houses?.some((h) => h.mx != null));
    const housesPos = useMemo(() => {
        if (!data?.houses?.length) return {};
        if (siteMode) return Object.fromEntries(data.houses.filter((h) => h.mx != null).map((h) => [h.id, housePos(data.site, h)]));
        const xs = data.houses.map((h) => h.x), ys = data.houses.map((h) => h.y);
        const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * GAP, cz = ((Math.min(...ys) + Math.max(...ys)) / 2) * GAP;
        return Object.fromEntries(data.houses.map((h) => [h.id, [h.x * GAP - cx, h.y * GAP - cz]]));
    }, [data?.houses, siteMode]); // eslint-disable-line
    useEffect(() => { if (selected) setFly(housesPos[selected.id]); }, [selected, housesPos]);

    const st = data?.stats || {};
    const legend = {
        overview: [['#22c55e', 'Visitors inside'], ['#f59e0b', 'Waiting at gate'], ['#f43f5e', 'Complaint'], ['#e0a94f', 'Event / your house'], ['#ef4444', 'SOS']],
        visitors: [['#22c55e', 'Visitors inside'], ['#f59e0b', 'Waiting approval'], ['#ef4444', 'Overstay'], ['#d3dbda', 'None']],
        complaints: [['#fca5a5', '1'], ['#ef4444', '3'], ['#dc2626', '4+'], ['#d3dbda', 'None']],
        maintenance: [['#1f7a74', 'Paid this month'], ['#f59e0b', 'Unpaid']],
        events: [['#c98a2b', 'Event today'], ['#d3dbda', 'None']],
    }[layer];
    const findHouse = (e) => {
        e.preventDefault();
        const q = search.trim().toUpperCase().replace(/\s/g, '');
        const h = data?.houses.find((x) => x.label.toUpperCase().replace(/\s/g, '') === q) || data?.houses.find((x) => x.label.toUpperCase().endsWith('-' + q))
            || data?.houses.find((x) => (x.owner || '').toUpperCase().includes(q));
        if (h) setSelected(h);
    };
    const toggleFull = () => { if (!document.fullscreenElement) { wrap.current?.requestFullscreen?.(); setFull(true); } else { document.exitFullscreen?.(); setFull(false); } };

    return (
        <div className="mx-auto flex h-full max-w-[1600px] flex-col">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm"><MapIcon size={22} /></div>
                    <div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">3D Community Map{data?.site ? <span className="ml-2 text-base font-semibold text-ink/45">· {data.site.name}</span> : null}</h1><p className="text-sm text-ink/55">Live — real plot layout, gate movements walk in, beacons show what's happening, SOS lights up red.</p></div>
                </div>
                <form onSubmit={findHouse} className="flex gap-2">
                    <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" /><input className="input w-44 pl-9" placeholder="Plot e.g. N-143 or 143" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
                    <button className="btn-outline">Go</button>
                </form>
            </div>
            <Tabs value={layer} onChange={setLayer} tabs={Object.entries(LAYERS).filter(([, l]) => !(l.official && isResident) && !(l.finance && !can('finance', true))).map(([key, l]) => ({ key, label: l.label, icon: l.icon, count: { visitors: st.inside, complaints: st.complaints, events: st.events }[key] }))} />
            <div ref={wrap} className="card relative min-h-[520px] flex-1 overflow-hidden bg-[#0b1514]">
                {!data ? <div className="grid h-full place-items-center"><Spinner /></div> : !data.houses.length ? <div className="grid h-full place-items-center text-sm text-white/60">Add houses with map positions to see the community map.</div> : (
                    <Canvas shadows dpr={[1, 2]} camera={siteMode ? { position: [-8, 62, 70], fov: 42, far: 2000 } : { position: [0, 34, 42], fov: 42 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
                        <Suspense fallback={null}>
                            {siteMode
                                ? <SiteWorld data={data} layer={layer} selected={selected} onSelect={(h) => setSelected(h)} sun={sun} walkers={walkers} setWalkers={setWalkers} fly={fly} autoRotate={autoRotate} />
                                : <Scene data={data} layer={layer} selected={selected} onSelect={(h) => setSelected(h)} sun={sun} walkers={walkers} setWalkers={setWalkers} fly={fly} autoRotate={autoRotate} />}
                        </Suspense>
                    </Canvas>
                )}

                {/* HUD: live counters */}
                {data && (
                    <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
                        {[['Inside', st.inside, '#22c55e', Users], ['At gate', st.awaiting, '#f59e0b', BellRing], ['Overstay', st.overstay, '#ef4444', Hourglass], ['Events', st.events, '#e0a94f', CalendarHeart], ...(st.complaints != null ? [['Complaints', st.complaints, '#f43f5e', MessageSquareWarning]] : []), ...(st.sos ? [['SOS', st.sos, '#ff2a2a', Siren]] : [])].map(([l, v, c, I]) => (
                            <div key={l} className={`flex items-center gap-2 rounded-xl bg-[#0b1514]/75 px-3 py-1.5 text-white backdrop-blur ${l === 'SOS' ? 'animate-pulse ring-2 ring-red-500' : ''}`}>
                                <I size={14} style={{ color: c }} /><span className="text-lg font-bold leading-none">{v ?? 0}</span><span className="text-[11px] text-white/60">{l}</span>
                            </div>
                        ))}
                    </div>
                )}
                {/* HUD: controls */}
                <div className="absolute right-3 top-3 flex flex-col gap-2" style={{ right: selected ? 'calc(min(340px, 100% - 1.5rem) + 1.5rem)' : undefined }}>
                    <div className="flex overflow-hidden rounded-xl bg-[#0b1514]/75 text-white backdrop-blur">
                        {[['auto', Clock3, 'Real time'], ['day', Sun, 'Day'], ['night', Moon, 'Night']].map(([m, I, t]) => (
                            <button key={m} title={t} onClick={() => setMode(m)} className={`grid size-9 place-items-center ${mode === m ? 'bg-white/20' : 'hover:bg-white/10'}`}><I size={16} /></button>
                        ))}
                    </div>
                    <button title="Slow orbit" onClick={() => setAutoRotate(!autoRotate)} className={`grid size-9 place-items-center self-end rounded-xl text-white backdrop-blur ${autoRotate ? 'bg-brand-600' : 'bg-[#0b1514]/75 hover:bg-[#0b1514]'}`}><Radio size={16} /></button>
                    <button title="Fullscreen" onClick={toggleFull} className="grid size-9 place-items-center self-end rounded-xl bg-[#0b1514]/75 text-white backdrop-blur hover:bg-[#0b1514]">{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
                </div>
                {/* Legend */}
                <div className="absolute bottom-3 left-3 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-[#0b1514]/75 px-3 py-2 text-[11px] text-white backdrop-blur">
                    {legend.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} />{l}</span>)}
                    <span className="text-white/45">· {String(Math.floor(sun.hour)).padStart(2, '0')}:{String(Math.round((sun.hour % 1) * 60)).padStart(2, '0')} {sun.night ? 'night' : sun.dusk ? 'dusk' : 'day'}</span>
                </div>
                {/* Live ticker */}
                {!selected && data?.feed?.length > 0 && (
                    <div className="absolute bottom-3 right-3 hidden w-80 rounded-xl bg-[#0b1514]/75 p-3 text-white backdrop-blur md:block">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300"><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />Live feed</div>
                        {data.feed.slice(0, 5).map((a) => <div key={a.id} className="truncate border-t border-white/5 py-1 text-[11px] text-white/80"><span className="text-white/40">{ago(a.created_at)}</span> · {a.description}</div>)}
                    </div>
                )}
                {selected && <HousePanel id={selected.id} onClose={() => { setSelected(null); setFly(null); }} />}
            </div>
        </div>
    );
}
