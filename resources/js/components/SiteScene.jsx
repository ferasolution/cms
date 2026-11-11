import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { gatesOf, routeTo, signalsByHouse, SIGNAL_META } from '../lib/siteplan';
import * as THREE from 'three';
import RealHouses, { FLOOR } from './site/RealHouses';
import Surroundings from './site/Surroundings';

/**
 * Real site-plan renderer. Plots come from the digitised society map (source pixels); everything is
 * converted to scene units here. All houses are instanced, so ~400 plots stay smooth on phones.
 */
export const S = 0.1; // scene units per plan pixel

export function siteTransform(site) {
    const xs = site.boundary.map((p) => p[0]), ys = site.boundary.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const to = (px, py) => [(px - cx) * S, (py - cy) * S];
    return { to, w: (Math.max(...xs) - Math.min(...xs)) * S, d: (Math.max(...ys) - Math.min(...ys)) * S };
}
export const housePos = (site, h) => siteTransform(site).to(h.mx, h.my);

const shapeOf = (pts, to) => { const s = new THREE.Shape(); pts.forEach((p, i) => { const [x, z] = to(p[0], p[1]); i ? s.lineTo(x, -z) : s.moveTo(x, -z); }); return s; };
const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
const bbox = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
function inPoly([x, y], pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
const rnd = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

const PAINT = ['#f4efe6', '#ece6da', '#f7f3ec', '#e3ddd2', '#efe2cf', '#e8d9c4', '#f2ebe0', '#dcd6cc', '#eadfd0', '#f5eee3'];
export function houseColor(h, layer) {
    if (h.sos) return '#ef4444';
    switch (layer) {
        case 'requests': return h.sig ? SIGNAL_META[h.sig]?.color || '#f59e0b' : '#d9dedd';
        case 'visitors': return h.awaiting ? '#f59e0b' : h.overstay ? '#ef4444' : h.visitors ? '#22c55e' : '#cfd6d5';
        case 'complaints': return h.complaints ? ['#fca5a5', '#f87171', '#ef4444', '#dc2626'][Math.min(3, h.complaints - 1)] : '#cfd6d5';
        case 'maintenance': return h.paid ? '#3a55e0' : '#f59e0b';
        case 'events': return h.event ? '#d98a0b' : '#cfd6d5';
        default: return h.mine ? '#f5a524' : PAINT[h.id % PAINT.length];
    }
}

function Label({ text, pos, size = 'm', dim }) {
    return (
        <Html position={pos} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
            <div className={`whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold tracking-wider ${dim ? 'bg-black/35 text-white/80' : 'bg-[#101833]/85 text-white'} ${size === 'l' ? 'text-[11px]' : 'text-[9.5px]'}`}>{text}</div>
        </Html>
    );
}

/* Glow frame around hovered / selected house */
function Highlight({ h, site, color }) {
    const ref = useRef();
    const { to } = siteTransform(site);
    useFrame(({ clock }) => { if (ref.current) ref.current.material.opacity = 0.45 + Math.sin(clock.elapsedTime * 5) * 0.2; });
    if (!h || h.mx == null) return null;
    const [x, z] = to(h.mx, h.my);
    const ht = Math.max(1, h.floors) * FLOOR + 0.3;
    return (
        <mesh ref={ref} position={[x, ht / 2, z]} rotation={[0, -THREE.MathUtils.degToRad(h.ma), 0]}>
            <boxGeometry args={[h.mw * S * 1.02, ht, h.mh * S * 1.02]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
        </mesh>
    );
}

/* ---------------- landmarks ---------------- */
function Zone({ z, to, night }) {
    const shape = useMemo(() => shapeOf(z.pts, to), [z, to]);
    const [cx, cy] = centroid(z.pts);
    const [x, zz] = to(cx, cy);
    const [bw, bh] = bbox(z.pts).map((v) => v * S);
    const m = Math.min(bw, bh);
    const trees = useMemo(() => {
        if (z.type !== 'park') return [];
        const r = rnd(Math.round(cx * 31 + cy)), out = [];
        const [w0, h0] = bbox(z.pts), minX = Math.min(...z.pts.map((p) => p[0])), minY = Math.min(...z.pts.map((p) => p[1]));
        for (let i = 0; out.length < 26 && i < 400; i++) { const p = [minX + r() * w0, minY + r() * h0]; if (inPoly(p, z.pts)) out.push(to(...p)); }
        return out;
    }, [z, to, cx, cy]);
    const flat = (color, y = 0.04, h = 0.02) => (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow><extrudeGeometry args={[shape, { depth: h, bevelEnabled: false }]} /><meshStandardMaterial color={color} roughness={1} /></mesh>
    );

    switch (z.type) {
        case 'park':
            return (
                <group>
                    {flat(night ? '#2c5a35' : '#5fa35a', 0.05)}
                    {trees.map(([tx, tz], i) => (
                        <group key={i} position={[tx, 0, tz]} scale={0.9 + (i % 3) * 0.25}>
                            <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.06, 0.08, 0.6]} /><meshStandardMaterial color="#6b4f3a" /></mesh>
                            <mesh position={[0, 0.85, 0]} castShadow><icosahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color={i % 2 ? '#3f8f5a' : '#4ea56a'} flatShading /></mesh>
                        </group>
                    ))}
                    <Label text={z.label.toUpperCase()} pos={[x, 2.2, zz]} />
                </group>
            );
        case 'mosque':
            return (
                <group>
                    {flat('#efe6f0', 0.05)}
                    <group position={[x, 0, zz]} rotation={[0, -0.45, 0]}>
                        <mesh position={[0, 0.9, 0]} castShadow receiveShadow><boxGeometry args={[m * 0.62, 1.8, m * 0.62]} /><meshStandardMaterial color="#f7f3ea" /></mesh>
                        <mesh position={[0, 1.8, 0]} castShadow><sphereGeometry args={[m * 0.22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#2f8f7f" metalness={0.3} roughness={0.35} /></mesh>
                        {[[1, 1], [-1, -1]].map(([a, b]) => (
                            <group key={a} position={[a * m * 0.36, 0, b * m * 0.36]}>
                                <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.16, 0.2, 4, 12]} /><meshStandardMaterial color="#f7f3ea" /></mesh>
                                <mesh position={[0, 4.25, 0]}><coneGeometry args={[0.24, 0.55, 12]} /><meshStandardMaterial color="#2f8f7f" emissive="#3ed6bd" emissiveIntensity={night ? 1.2 : 0} /></mesh>
                            </group>
                        ))}
                    </group>
                    <Label text="MOSQUE" pos={[x, 5.3, zz]} />
                </group>
            );
        case 'commercial':
            return (
                <group>
                    {flat('#d9cfc4', 0.05)}
                    <group position={[x, 0, zz]} rotation={[0, 0.3, 0]}>
                        <mesh position={[0, 1.4, 0]} castShadow receiveShadow><boxGeometry args={[m * 0.75, 2.8, m * 0.6]} /><meshStandardMaterial color="#b84a3a" roughness={0.5} /></mesh>
                        {[0.6, 1.4, 2.2].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[m * 0.76, 0.28, m * 0.61]} /><meshStandardMaterial color="#9fd3ea" emissive="#6ad1ff" emissiveIntensity={night ? 1.4 : 0.15} metalness={0.4} roughness={0.15} /></mesh>)}
                    </group>
                    <Label text="SHOPPING COMPLEX" pos={[x, 3.6, zz]} />
                </group>
            );
        case 'amenity':
        case 'office':
            return (
                <group>
                    {flat(z.type === 'office' ? '#e7d58a' : '#efe0a0', 0.05)}
                    <mesh position={[x, z.type === 'office' ? 0.45 : 0.7, zz]} castShadow><boxGeometry args={[bw * 0.6, z.type === 'office' ? 0.9 : 1.4, bh * 0.55]} /><meshStandardMaterial color={z.type === 'office' ? '#2737a3' : '#e9d9b0'} /></mesh>
                    <Label text={z.label.toUpperCase()} pos={[x, z.type === 'office' ? 1.6 : 2.2, zz]} />
                </group>
            );
        case 'outside_commercial':
            return (
                <group>{flat(night ? '#3a3330' : '#a59a8c', 0.02, 0.02)}
                    {[...Array(Math.max(1, Math.round(Math.max(bw, bh) / 2.2)))].map((_, i, a) => {
                        const t = (i + 0.5) / a.length - 0.5, long = bw > bh;
                        return <mesh key={i} position={[x + (long ? t * bw * 0.85 : 0), 0.55, zz + (long ? 0 : t * bh * 0.85)]} castShadow receiveShadow><boxGeometry args={[long ? bw * 0.85 / a.length * 0.9 : Math.min(bw, 1.6), 1.1, long ? Math.min(bh, 1.6) : bh * 0.85 / a.length * 0.9]} /><meshStandardMaterial color={['#c96f55', '#d8c8a8', '#9fb7c4', '#e0b46a'][i % 4]} roughness={0.6} /></mesh>;
                    })}
                    <Label text={z.label} pos={[x, 1.6, zz]} dim /></group>
            );
        default: // neighbouring areas
            return (
                <group>
                    {flat(z.tone === 'graveyard' ? (night ? '#3b3a33' : '#b3a98f') : (night ? '#2c2d2a' : '#8f8f88'), 0.01, 0.02)}
                    <Label text={z.label} pos={[x, 1.3, zz]} dim size={z.tone === 'graveyard' ? 'l' : 'm'} />
                </group>
            );
    }
}

function Road({ r, to, night }) {
    const segs = useMemo(() => r.pts.slice(1).map((p, i) => {
        const [x1, z1] = to(...r.pts[i]), [x2, z2] = to(...p);
        return { x: (x1 + x2) / 2, z: (z1 + z2) / 2, len: Math.hypot(x2 - x1, z2 - z1), rot: -Math.atan2(z2 - z1, x2 - x1) };
    }), [r, to]);
    const lamps = useMemo(() => {
        if (!r.main) return [];
        const out = [];
        segs.forEach((s) => { for (let t = -s.len / 2; t < s.len / 2; t += 5) [1, -1].forEach((side) => out.push([s.x + Math.cos(-s.rot) * t - Math.sin(-s.rot) * side * (r.width * S / 2 + 0.3), s.z + Math.sin(-s.rot) * t + Math.cos(-s.rot) * side * (r.width * S / 2 + 0.3)])); });
        return out;
    }, [segs, r]);
    const mid = segs[Math.floor(segs.length / 2)];
    return (
        <group>
            {segs.map((s, i) => (
                <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]}>
                    <mesh position={[0, 0.035, 0]} receiveShadow><boxGeometry args={[s.len + r.width * S * 0.5, 0.03, r.width * S]} /><meshStandardMaterial color={night ? '#1f2322' : '#4a4e4d'} roughness={0.95} /></mesh>
                    {!r.main && [...Array(Math.max(1, Math.floor(s.len / 0.9)))].map((_, k, a) => <mesh key={k} position={[(k - (a.length - 1) / 2) * 0.9, 0.052, 0]}><boxGeometry args={[0.45, 0.004, 0.05]} /><meshBasicMaterial color="#f1efe6" /></mesh>)}
                    {r.main && <mesh position={[0, 0.08, 0]} receiveShadow><boxGeometry args={[s.len, 0.08, 0.5]} /><meshStandardMaterial color={night ? '#28401f' : '#6f9b5f'} /></mesh>}
                    {r.main && [1, -1].map((sd) => <mesh key={sd} position={[0, 0.06, sd * (r.width * S / 2 - 0.08)]}><boxGeometry args={[s.len, 0.004, 0.04]} /><meshBasicMaterial color="#f1efe6" /></mesh>)}
                </group>
            ))}
            {lamps.map(([lx, lz], i) => (
                <group key={i} position={[lx, 0, lz]}>
                    <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.035, 0.045, 1.6]} /><meshStandardMaterial color="#2d3a3a" /></mesh>
                    <mesh position={[0, 1.62, 0]}><sphereGeometry args={[0.11, 10, 10]} /><meshStandardMaterial color={night ? '#fff1c4' : '#d9dfe0'} emissive={night ? '#ffd27a' : '#000'} emissiveIntensity={night ? 3 : 0} /></mesh>
                </group>
            ))}
            {night && lamps.filter((_, i) => i % 6 === 0).map(([lx, lz], i) => <pointLight key={'l' + i} position={[lx, 1.7, lz]} intensity={5} distance={6} color="#ffcf80" />)}
            {mid && <Html position={[mid.x, 0.4, mid.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}><div className="whitespace-nowrap rounded bg-black/30 px-1.5 text-[10px] font-bold tracking-widest text-white/90">{r.name.toUpperCase()}</div></Html>}
        </group>
    );
}

function Wall({ site, to }) {
    const segs = useMemo(() => site.boundary.map((p, i) => {
        const q = site.boundary[(i + 1) % site.boundary.length];
        const [x1, z1] = to(...p), [x2, z2] = to(...q);
        return { x: (x1 + x2) / 2, z: (z1 + z2) / 2, len: Math.hypot(x2 - x1, z2 - z1), rot: -Math.atan2(z2 - z1, x2 - x1) };
    }), [site, to]);
    return segs.map((s, i) => (
        <mesh key={i} position={[s.x, 0.3, s.z]} rotation={[0, s.rot, 0]} castShadow><boxGeometry args={[s.len + 0.1, 0.6, 0.14]} /><meshStandardMaterial color="#d6cbb5" roughness={0.9} /></mesh>
    ));
}

function Gate({ g, to, night }) {
    const bar = useRef();
    useFrame(({ clock }) => { if (bar.current) bar.current.rotation.z = Math.max(0, Math.sin(clock.elapsedTime * 0.7)) * 1.2; });
    const [x, z] = to(g.x, g.y);
    return (
        <group position={[x, 0, z]} rotation={[0, -THREE.MathUtils.degToRad(g.ang) + Math.PI / 2, 0]}>
            {[-1.7, 1.7].map((o) => <mesh key={o} position={[o, 1.1, 0]} castShadow><boxGeometry args={[0.45, 2.2, 0.45]} /><meshStandardMaterial color="#2737a3" /></mesh>)}
            <mesh position={[0, 2.3, 0]} castShadow><boxGeometry args={[3.8, 0.38, 0.5]} /><meshStandardMaterial color="#2737a3" emissive={night ? '#f5a524' : '#000'} emissiveIntensity={night ? 0.3 : 0} /></mesh>
            <group ref={bar} position={[-1.4, 0.85, 0.4]}><mesh position={[1.4, 0, 0]}><boxGeometry args={[2.8, 0.08, 0.08]} /><meshStandardMaterial color="#ef4444" /></mesh></group>
            <mesh position={[2.7, 0.7, 0.6]} castShadow><boxGeometry args={[1, 1.4, 1]} /><meshStandardMaterial color="#e8e2d4" /></mesh>
            <Label text={(g.label || 'Main Gate').toUpperCase()} pos={[0, 3.2, 0]} />
        </group>
    );
}

/* ---------------- status overlays ---------------- */
function Beacon({ pos, color }) {
    const g = useRef();
    useFrame(({ clock }) => {
        if (!g.current) return;
        g.current.rotation.y = clock.elapsedTime * 1.5;
        g.current.position.y = pos[1] + Math.sin(clock.elapsedTime * 2.2) * 0.12;
        g.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.12);
    });
    return (
        <group ref={g} position={pos}>
            <mesh><octahedronGeometry args={[0.38, 0]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} toneMapped={false} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.7, 0.05, 8, 32]} /><meshBasicMaterial color={color} transparent opacity={0.75} /></mesh>
        </group>
    );
}
function SosPillar({ pos }) {
    const ring = useRef(), beam = useRef();
    useFrame(({ clock }) => {
        const t = (clock.elapsedTime % 1.6) / 1.6;
        if (ring.current) { ring.current.scale.setScalar(1 + t * 6); ring.current.material.opacity = 0.8 * (1 - t); }
        if (beam.current) beam.current.material.opacity = 0.35 + Math.sin(clock.elapsedTime * 8) * 0.15;
    });
    return (
        <group position={pos}>
            <mesh ref={beam} position={[0, 9, 0]}><cylinderGeometry args={[0.35, 1, 18, 16, 1, true]} /><meshBasicMaterial color="#ff2a2a" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} /></mesh>
            <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}><ringGeometry args={[0.9, 1.05, 48]} /><meshBasicMaterial color="#ff2a2a" transparent side={THREE.DoubleSide} /></mesh>
            <pointLight color="#ff2a2a" intensity={30} distance={10} position={[0, 2, 0]} />
        </group>
    );
}

/** Visitor walking / driving from the gate along the main road, then to the house. */
function Walker({ path, color, car, onDone }) {
    const ref = useRef(), t0 = useRef(null);
    const seg = useMemo(() => { const s = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1])); return { s, total: s.reduce((a, b) => a + b, 0) }; }, [path]);
    useFrame(({ clock }) => {
        if (!ref.current) return;
        if (t0.current === null) t0.current = clock.elapsedTime;
        let d = (clock.elapsedTime - t0.current) * (car ? 10 : 6);
        if (d >= seg.total) { onDone(); return; }
        let i = 0;
        while (d > seg.s[i]) { d -= seg.s[i]; i++; }
        const a = path[i], b = path[i + 1], k = d / seg.s[i];
        ref.current.position.set(a[0] + (b[0] - a[0]) * k, car ? 0.3 : 0.4 + Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.08, a[1] + (b[1] - a[1]) * k);
        ref.current.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    });
    return (
        <group ref={ref}>
            {car ? (<><mesh castShadow><boxGeometry args={[0.6, 0.32, 1.1]} /><meshStandardMaterial color={color} /></mesh><mesh position={[0, 0.26, -0.05]}><boxGeometry args={[0.5, 0.22, 0.6]} /><meshStandardMaterial color="#cfe8ff" /></mesh></>)
                : (<><mesh castShadow position={[0, 0.25, 0]}><capsuleGeometry args={[0.14, 0.32, 4, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} /></mesh><mesh position={[0, 0.62, 0]}><sphereGeometry args={[0.12, 10, 10]} /><meshStandardMaterial color="#f1c7a3" /></mesh></>)}
            <mesh position={[0, 1.25, 0]}><coneGeometry args={[0.14, 0.32, 8]} /><meshBasicMaterial color={color} /></mesh>
        </group>
    );
}

function walkPath(site, to, houses, h) {
    const r = routeTo(site, houses, h);
    if (r) return r.path.map(([x, y]) => to(x, y));
    const g = gatesOf(site)[0];
    return [to(g.x, g.y), to(h.mx, h.my)];
}

/** Plot numbers painted above roofs — only near the camera target, so hundreds of plots stay fast. */
function PlotNumbers({ houses, to, all }) {
    const [list, setList] = useState([]);
    const last = useRef(0);
    useFrame(({ camera, controls, clock }) => {
        if (clock.elapsedTime - last.current < 0.3) return;
        last.current = clock.elapsedTime;
        const t = controls?.getTarget ? controls.getTarget(new THREE.Vector3()) : (controls?.target || new THREE.Vector3());
        const dist = camera.position.distanceTo(t);
        if (!all && dist > 55) { if (list.length) setList([]); return; }
        const r = all ? 1e9 : Math.max(10, dist * 0.55);
        const next = houses.filter((h) => { const [x, z] = to(h.mx, h.my); return Math.hypot(x - t.x, z - t.z) < r; }).slice(0, 90).map((h) => h.id);
        if (next.join() !== list.join()) setList(next);
    });
    const byId = useMemo(() => Object.fromEntries(houses.map((h) => [h.id, h])), [houses]);
    return list.map((id) => {
        const h = byId[id]; const [x, z] = to(h.mx, h.my);
        return (
            <Html key={id} position={[x, Math.max(1, h.floors) * FLOOR + 0.25, z]} center style={{ pointerEvents: 'none' }} zIndexRange={[4, 0]}>
                <div className="rounded bg-white/85 px-1 text-[9px] font-extrabold leading-tight text-[#3b1f3a] shadow-sm">{h.house_no}</div>
            </Html>
        );
    });
}

function StreetNames({ site, to }) {
    const [show, setShow] = useState(false);
    useFrame(({ camera, controls }) => {
        const t = controls?.getTarget ? controls.getTarget(new THREE.Vector3()) : (controls?.target || new THREE.Vector3());
        const v = camera.position.distanceTo(t) < 95;
        if (v !== show) setShow(v);
    });
    if (!show) return null;
    return (site.streets || []).map((st) => {
        const [x, z] = to(st.x, st.y);
        return (
            <Html key={st.text} position={[x, 0.15, z]} center style={{ pointerEvents: 'none' }} zIndexRange={[3, 0]}>
                <div className="whitespace-nowrap rounded bg-night/55 px-1 text-[8.5px] font-bold uppercase tracking-wider text-white/90" style={{ transform: `rotate(${st.ang > 45 ? st.ang - 90 : st.ang}deg)` }}>{st.text}</div>
            </Html>
        );
    });
}

/** Request pin above a house: icon of the most urgent request + count; flashes when new. */
function SignalPin({ pos, group, flash, onClick }) {
    const ring = useRef();
    const m = SIGNAL_META[group.top.type] || {};
    useFrame(({ clock }) => {
        if (!ring.current) return;
        const t = (clock.elapsedTime % 1.4) / 1.4;
        ring.current.scale.setScalar(1 + t * (flash ? 7 : 3));
        ring.current.material.opacity = (flash ? 0.9 : 0.5) * (1 - t);
    });
    return (
        <group position={pos}>
            <Beacon pos={[0, 0, 0]} color={m.color} />
            {(flash || group.top.type === 'sos' || group.top.level === 'danger') && (
                <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, -pos[1] + 0.12, 0]}><ringGeometry args={[0.9, 1.15, 40]} /><meshBasicMaterial color={m.color} transparent side={THREE.DoubleSide} depthWrite={false} /></mesh>
            )}
            <Html position={[0, 1.1, 0]} center zIndexRange={[30, 20]}>
                <button onClick={onClick} className={`flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-white px-2 py-0.5 text-[11px] font-bold text-white shadow-lg ${flash ? 'animate-bounce' : ''}`} style={{ background: m.color }}>
                    <span>{m.icon}</span>{group.list.length > 1 ? group.list.length : m.label}
                </button>
            </Html>
        </group>
    );
}

/** Animated route (gate → house) — used for emergencies and "show route". */
function RouteLine({ path, to }) {
    const ref = useRef();
    const pts = useMemo(() => path.map(([x, y]) => { const [a, b] = to(x, y); return [a, 0.35, b]; }), [path, to]);
    useFrame((_, dt) => { if (ref.current?.material) ref.current.material.dashOffset -= dt * 3; });
    const end = pts[pts.length - 1];
    return (
        <group>
            <Line points={pts} color="#38bdf8" lineWidth={9} transparent opacity={0.25} />
            <Line ref={ref} points={pts} color="#0ea5e9" lineWidth={4} dashed dashSize={1.1} gapSize={0.7} />
            <mesh position={[pts[0][0], 0.5, pts[0][2]]}><sphereGeometry args={[0.45, 16, 16]} /><meshBasicMaterial color="#0ea5e9" /></mesh>
            <mesh position={[end[0], 0.2, end[2]]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.1, 1.5, 40]} /><meshBasicMaterial color="#0ea5e9" side={THREE.DoubleSide} /></mesh>
        </group>
    );
}

/* ---------------- whole site ---------------- */
export default function SiteScene({ data, layer, selected, onSelect, night, walkers, setWalkers, signals = [], flash = [], route, allNumbers }) {
    const site = data.site;
    const { to, w, d } = useMemo(() => siteTransform(site), [site]);
    const ground = useMemo(() => shapeOf(site.boundary, to), [site, to]);
    const [hover, setHover] = useState(null);
    const byId = useMemo(() => Object.fromEntries(data.houses.map((h) => [h.id, h])), [data.houses]);
    useEffect(() => () => { document.body.style.cursor = ''; }, []);

    const top = (h) => { const [x, z] = to(h.mx, h.my); return [x, Math.max(1, h.floors) * FLOOR + 1.1, z]; };
    const placedHouses = useMemo(() => data.houses.filter((h) => h.mx != null), [data.houses]);
    const groups = useMemo(() => signalsByHouse(signals), [signals]);
    const flashSet = useMemo(() => new Set(flash), [flash]);
    const pinned = useMemo(() => new Set(groups.map((g) => g.house_id)), [groups]);
    const status = data.houses.filter((h) => h.mx != null && !pinned.has(h.id) && (h.visitors || h.event));
    const tip = hover || selected;

    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow onClick={() => onSelect(null)}>
                <planeGeometry args={[w * 4, d * 4]} /><meshStandardMaterial color={night ? '#23271f' : '#b3ab95'} roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={() => onSelect(null)}>
                <shapeGeometry args={[ground]} /><meshStandardMaterial color={night ? '#2b2f2e' : '#6f7371'} roughness={0.95} />
            </mesh>
            <Wall site={site} to={to} />
            {(site.roads || []).map((r) => <Road key={r.name} r={r} to={to} night={night} />)}
            {site.zones.map((z, i) => <Zone key={i} z={z} to={to} night={night} />)}
            {(site.labels || []).map((l, i) => { const [x, z] = to(l.x, l.y); return <Label key={i} text={l.text} pos={[x, 0.6, z]} dim size={l.size} />; })}
            {gatesOf(site).map((g) => <Gate key={g.label} g={g} to={to} night={night} />)}
            <StreetNames site={site} to={to} />
            <PlotNumbers houses={placedHouses} to={to} all={allNumbers} />
            {route && <RouteLine path={route.path} to={to} />}
            {groups.map((g) => byId[g.house_id]?.mx != null && <SignalPin key={g.house_id} pos={top(byId[g.house_id])} group={g} flash={flashSet.has(g.house_id)} onClick={() => onSelect(byId[g.house_id])} />)}
            <RealHouses houses={data.houses} to={to} layer={layer} night={night} colorOf={houseColor} hover={hover} setHover={setHover} onSelect={onSelect} />
            <Surroundings site={site} to={to} night={night} />
            <Highlight h={selected && byId[selected.id]} site={site} color="#f5a524" />
            {hover && hover.id !== selected?.id && <Highlight h={hover} site={site} color="#ffffff" />}

            {status.map((h) => {
                const p = top(h), list = [];
                if ((layer === 'overview' || layer === 'visitors') && h.visitors) list.push('#22c55e');
                if ((layer === 'overview' || layer === 'events') && h.event) list.push('#f5a524');
                return (
                    <group key={h.id}>
                        {list.map((c, i) => <Beacon key={c} pos={[p[0] + (i - (list.length - 1) / 2) * 0.9, p[1], p[2]]} color={c} />)}
                    </group>
                );
            })}
            {data.houses.filter((h) => h.sos && h.mx != null).map((h) => { const p = top(h); return <SosPillar key={'sos' + h.id} pos={[p[0], 0, p[2]]} />; })}
            {walkers.map((wk) => byId[wk.house_id]?.mx != null && (
                <Walker key={wk.key} path={walkPath(site, to, data.houses, byId[wk.house_id])} car={!!wk.vehicle_no} color={wk.status === 'awaiting' ? '#f59e0b' : '#22c55e'}
                    onDone={() => setWalkers((ws) => ws.filter((x) => x.key !== wk.key))} />
            ))}

            {tip && tip.mx != null && (
                <Html position={top(tip).map((v, i) => (i === 1 ? v + 1.2 : v))} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 10]}>
                    <div className="whitespace-nowrap rounded-xl bg-night/90 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur">
                        <div>Plot {tip.label}{tip.owner ? ' · ' + tip.owner : ''}</div>
                        <div className="mt-0.5 flex gap-2 text-[10px] font-normal text-white/70">
                            {tip.sos && <span className="font-bold text-red-300">SOS {tip.sos}</span>}
                            {tip.awaiting > 0 && <span className="text-amber-300">{tip.awaiting} at gate</span>}
                            {tip.visitors > 0 && <span className="text-emerald-300">{tip.visitors} visitor{tip.visitors > 1 ? 's' : ''}</span>}
                            {tip.overstay > 0 && <span className="text-red-300">{tip.overstay} overstay</span>}
                            {tip.complaints > 0 && <span className="text-rose-300">{tip.complaints} complaint{tip.complaints > 1 ? 's' : ''}</span>}
                            {tip.event && <span className="text-amber-200">event today</span>}
                            {!tip.sos && !tip.awaiting && !tip.visitors && !tip.complaints && !tip.event && <span>{tip.floors} floor{tip.floors > 1 ? 's' : ''}</span>}
                        </div>
                    </div>
                </Html>
            )}
        </>
    );
}
