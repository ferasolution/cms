import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * A small American subdivision at night, built from instanced parts. The landing page scrolls
 * through one evening: the gate, a work order, the patrol round and an SOS. `progress` is a
 * motion value 0..1; chapters sit at 0, .25, .5, .75 and 1.
 */

const STREETS = [-22, 0, 22];
const XS = Array.from({ length: 11 }, (_, i) => -38 + i * 7.6);
const GATE = new THREE.Vector3(-55, 0, 0);
const WORK = { x: 11.6, z: -14.5 };            // the house with the leaking pipe
const SOS = { x: 26.8, z: 29.5 };              // the house that presses SOS
const CLUB = { x: 4, z: 11 };

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function buildLots() {
    seed = 7;
    const lots = [];
    STREETS.forEach((s) => [-1, 1].forEach((side) => XS.forEach((x) => {
        const z = s + side * 7.5;
        if (z > 0 && z < 22 && x > -6 && x < 16) return;      // clubhouse block
        lots.push({ x, z, face: -side, floors: rnd() > 0.55 ? 2 : 1, hue: Math.floor(rnd() * 5), roof: Math.floor(rnd() * 3), w: 5.2 + rnd() * 0.8 });
    })));
    return lots;
}

const WALL = ['#e7dfcf', '#cfd6df', '#e6d5bb', '#bfc9d4', '#ddd7cc'];
const ROOF = ['#3a4150', '#4b3c36', '#2f3640'];

function useGlowTexture() {
    return useMemo(() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, 'rgba(255,255,255,1)');
        r.addColorStop(0.25, 'rgba(255,255,255,.55)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }, []);
}

function roofGeometry() {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 0.42); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
}

/** Instanced mesh helper: `items` → matrices (+ optional colors). */
function Instances({ items, geometry, material, color, castShadow }) {
    const ref = useRef();
    useLayoutEffect(() => {
        const m = new THREE.Object3D();
        const c = new THREE.Color();
        items.forEach((it, i) => {
            m.position.set(...it.p);
            m.rotation.set(0, it.r || 0, 0);
            m.scale.set(...(it.s || [1, 1, 1]));
            m.updateMatrix();
            ref.current.setMatrixAt(i, m.matrix);
            if (color) ref.current.setColorAt(i, c.set(color(it, i)));
        });
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }, [items]);
    return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} />;
}

function Neighborhood({ lots }) {
    const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
    const roof = useMemo(roofGeometry, []);
    const tree = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
    const plane = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
    const lambert = useMemo(() => new THREE.MeshLambertMaterial(), []);
    const basic = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);

    const parts = useMemo(() => {
        seed = 99;
        const bodies = [], roofs = [], windows = [], lawns = [], drives = [], garages = [], trees = [], trunks = [];
        lots.forEach((l) => {
            const h = l.floors === 2 ? 5.6 : 3.1;
            bodies.push({ p: [l.x, h / 2, l.z], s: [l.w, h, 5.6], hue: l.hue });
            roofs.push({ p: [l.x, h, l.z], s: [l.w + 0.7, 4.2, 6.2], roof: l.roof });
            lawns.push({ p: [l.x, 0.02, l.z + l.face * 0.6], s: [7.2, 1, 7] });
            const fz = l.z + l.face * 2.81;
            drives.push({ p: [l.x + l.w / 2 - 1.1, 0.03, l.z + l.face * 4.4], s: [2.4, 1, 3.4] });
            garages.push({ p: [l.x + l.w / 2 - 1.1, 1.05, fz + l.face * 0.02], s: [2.1, 1.9, 0.05] });
            for (let f = 0; f < l.floors; f++) {
                [-l.w / 2 + 1.1, l.floors === 2 || f ? 0.2 : -0.3].slice(0, f ? 2 : 1).forEach((dx) => windows.push({ p: [l.x + dx, 1.6 + f * 2.6, fz + l.face * 0.04], s: [1.2, 1.1, 0.05], lit: rnd() > 0.32 }));
            }
            if (rnd() > 0.35) {
                const tx = l.x - l.w / 2 - 0.6, tz = l.z - l.face * 2.4, sc = 1.3 + rnd() * 0.9;
                trees.push({ p: [tx, 2.2 + sc * 0.6, tz], s: [sc, sc * 1.25, sc], r: rnd() * 3 });
                trunks.push({ p: [tx, 1.1, tz], s: [0.25, 2.2, 0.25] });
            }
        });
        // park trees around the clubhouse
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2, rr = 9 + rnd() * 2.5, sc = 1.2 + rnd();
            const tx = CLUB.x + Math.cos(a) * rr * 1.1, tz = CLUB.z + Math.sin(a) * rr * 0.55;
            trees.push({ p: [tx, 2 + sc * 0.6, tz], s: [sc, sc * 1.3, sc], r: rnd() * 3 });
            trunks.push({ p: [tx, 1, tz], s: [0.25, 2, 0.25] });
        }
        return { bodies, roofs, windows, lawns, drives, garages, trees, trunks };
    }, [lots]);

    return (
        <group>
            <Instances items={parts.lawns} geometry={plane} material={lambert} color={() => '#16301f'} />
            <Instances items={parts.drives} geometry={plane} material={lambert} color={() => '#3a4152'} />
            <Instances items={parts.bodies} geometry={box} material={lambert} color={(it) => WALL[it.hue]} castShadow />
            <Instances items={parts.roofs} geometry={roof} material={lambert} color={(it) => ROOF[it.roof]} castShadow />
            <Instances items={parts.garages} geometry={box} material={lambert} color={() => '#f1ede4'} />
            <Instances items={parts.windows} geometry={box} material={basic} color={(it) => (it.lit ? '#ffc56b' : '#1c2433')} />
            <Instances items={parts.trunks} geometry={box} material={lambert} color={() => '#3b2b20'} />
            <Instances items={parts.trees} geometry={tree} material={lambert} color={(it, i) => ['#1d3a2a', '#24452f', '#1a3326'][i % 3]} castShadow />
        </group>
    );
}

function Roads() {
    const plane = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
    const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
    const mat = useMemo(() => new THREE.MeshLambertMaterial(), []);
    const basic = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
    const { roads, dashes, walls } = useMemo(() => {
        const roads = [
            ...STREETS.map((z) => ({ p: [0, 0.04, z], s: [96, 1, 7] })),
            { p: [-44, 0.045, 0], s: [7, 1, 51] }, { p: [44, 0.045, 0], s: [7, 1, 51] },
            { p: [-95, 0.04, 0], s: [90, 1, 8] },                                  // road in from town
            { p: [-50, 0.04, 0], s: [12, 1, 8] },
            { p: [-140, 0.04, 0], s: [9, 1, 260] },                                // highway across
        ];
        const dashes = [];
        STREETS.forEach((z) => { for (let x = -40; x <= 40; x += 5) dashes.push({ p: [x, 0.06, z], s: [2, 1, 0.18] }); });
        for (let x = -135; x <= -60; x += 5) dashes.push({ p: [x, 0.06, 0], s: [2, 1, 0.18] });
        for (let z = -120; z <= 120; z += 6) dashes.push({ p: [-140, 0.06, z], s: [0.2, 1, 2.6] });
        const h = 1.4;
        const walls = [
            { p: [0, h / 2, -37], s: [101, h, 0.4] }, { p: [0, h / 2, 37], s: [101, h, 0.4] },
            { p: [50.5, h / 2, 0], s: [0.4, h, 74] }, { p: [-50.5, h / 2, -21], s: [0.4, h, 32] }, { p: [-50.5, h / 2, 21], s: [0.4, h, 32] },
        ];
        return { roads, dashes, walls };
    }, []);
    return (
        <group>
            <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[600, 600]} /><meshLambertMaterial color="#0d1b2a" /></mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow><planeGeometry args={[101, 74]} /><meshLambertMaterial color="#13261e" /></mesh>
            <Instances items={roads} geometry={plane} material={mat} color={() => '#1c2230'} />
            <Instances items={dashes} geometry={plane} material={basic} color={() => '#6b5d3e'} />
            <Instances items={walls} geometry={box} material={mat} color={() => '#8b8576'} />
        </group>
    );
}

function Clubhouse() {
    return (
        <group position={[CLUB.x, 0, CLUB.z]}>
            <mesh position={[-4, 2.2, -1]} castShadow><boxGeometry args={[9, 4.4, 6]} /><meshLambertMaterial color="#e8e1d2" /></mesh>
            <mesh position={[-4, 4.5, -1]}><boxGeometry args={[9.8, 0.3, 6.8]} /><meshLambertMaterial color="#2f3640" /></mesh>
            <mesh position={[-4, 2, 2.05]}><boxGeometry args={[6, 2.2, 0.05]} /><meshBasicMaterial color="#ffd38a" toneMapped={false} /></mesh>
            <mesh position={[5, 0.06, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[8, 5]} /><meshBasicMaterial color="#1fb8d6" toneMapped={false} /></mesh>
            <mesh position={[5, 0.05, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[9.4, 6.4]} /><meshLambertMaterial color="#cfc8b8" /></mesh>
            <pointLight position={[5, 1.5, 0]} color="#3fd2ef" intensity={18} distance={14} />
        </group>
    );
}

function Gatehouse({ lift }) {
    const arm = useRef();
    const beacon = useRef();
    useFrame((st, dt) => {
        const target = -lift.current * 1.35;
        arm.current.rotation.x = THREE.MathUtils.damp(arm.current.rotation.x, target, 4, dt);
        beacon.current.intensity = 6 + Math.sin(st.clock.elapsedTime * 4) * 3 * lift.current + lift.current * 10;
    });
    return (
        <group position={[GATE.x + 4.5, 0, 0]}>
            <mesh position={[0, 1.6, -5.4]} castShadow><boxGeometry args={[3, 3.2, 2.6]} /><meshLambertMaterial color="#d9d2c3" /></mesh>
            <mesh position={[0, 3.35, -5.4]}><boxGeometry args={[3.6, 0.3, 3.2]} /><meshLambertMaterial color="#2f3640" /></mesh>
            <mesh position={[1.52, 1.7, -5.4]}><boxGeometry args={[0.05, 1.1, 1.6]} /><meshBasicMaterial color="#ffd38a" toneMapped={false} /></mesh>
            <mesh position={[0, 0.6, -3.6]}><boxGeometry args={[0.5, 1.2, 0.5]} /><meshLambertMaterial color="#555" /></mesh>
            <group ref={arm} position={[0, 1.1, -3.6]}>
                <mesh position={[0, 0, 3.4]} rotation-x={0}><boxGeometry args={[0.18, 0.18, 6.8]} /><meshBasicMaterial color="#f5a524" toneMapped={false} /></mesh>
            </group>
            <pointLight ref={beacon} position={[0, 3.8, -4]} color="#f5a524" intensity={6} distance={18} />
        </group>
    );
}

/** A pin with a pulsing ring; `show` is a ref 0..1. */
function Pin({ at, color, show, y = 9 }) {
    const g = useRef();
    const ring = useRef();
    const mat = useRef();
    useFrame((st) => {
        const v = show.current;
        g.current.visible = v > 0.01;
        g.current.scale.setScalar(Math.max(0.001, v));
        g.current.children[0].position.y = y + Math.sin(st.clock.elapsedTime * 2.4) * 0.4;
        const k = (st.clock.elapsedTime * 0.7) % 1;
        ring.current.scale.setScalar(1 + k * 7);
        mat.current.opacity = (1 - k) * 0.7 * v;
    });
    return (
        <group ref={g} position={[at.x, 0, at.z]}>
            <group>
                <mesh rotation-x={Math.PI}><coneGeometry args={[0.9, 2.2, 20]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
                <mesh position={[0, 1.4, 0]}><sphereGeometry args={[1.1, 24, 16]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
            </group>
            <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.15, 0]}><ringGeometry args={[0.9, 1.2, 40]} /><meshBasicMaterial ref={mat} color={color} transparent depthWrite={false} toneMapped={false} /></mesh>
            <pointLight color={color} intensity={30} distance={16} position={[0, 4, 0]} />
        </group>
    );
}

class Path {
    constructor(pts) {
        this.pts = pts.map((p) => new THREE.Vector3(p[0], 0.4, p[1]));
        this.len = [0];
        for (let i = 1; i < this.pts.length; i++) this.len.push(this.len[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
        this.total = this.len[this.len.length - 1];
    }
    at(t, out = new THREE.Vector3()) {
        const d = THREE.MathUtils.clamp(t, 0, 1) * this.total;
        let i = 1;
        while (i < this.len.length - 1 && this.len[i] < d) i++;
        const k = (d - this.len[i - 1]) / (this.len[i] - this.len[i - 1] || 1);
        return out.lerpVectors(this.pts[i - 1], this.pts[i], k);
    }
}

const SOS_PATH = new Path([[GATE.x + 2, 0], [-44, 0], [-44, 22], [SOS.x, 22], [SOS.x, SOS.z - 3.6]]);
const PATROL = new Path([[-46, 3.5], [-41, 3.5], [-41, 18.5], [41, 18.5], [41, -18.5], [-41, -18.5], [-41, -3.5], [-46, -3.5]]);
const CHECKPOINTS = [0.02, 0.27, 0.5, 0.73, 0.97];
const LOOP = new Path([[-44, -1.6], [44, -1.6], [44, 20.4], [-44, 20.4], [-44, -23.6], [44, -23.6], [44, -1.6]].reverse());

/** Breadcrumb dots from the gate to the SOS house, drawn as the chapter scrolls in. */
function Route({ path, reveal, color }) {
    const ref = useRef();
    const n = 90;
    const pts = useMemo(() => Array.from({ length: n }, (_, i) => path.at(i / (n - 1))), [path]);
    useFrame((st) => {
        const m = new THREE.Object3D();
        const r = reveal.current;
        for (let i = 0; i < n; i++) {
            const on = i / n < r;
            const pulse = 0.6 + 0.4 * Math.sin(st.clock.elapsedTime * 6 - i * 0.35);
            m.position.copy(pts[i]);
            m.scale.setScalar(on ? 0.42 * pulse : 0.0001);
            m.updateMatrix();
            ref.current.setMatrixAt(i, m.matrix);
        }
        ref.current.instanceMatrix.needsUpdate = true;
    });
    return <instancedMesh ref={ref} args={[undefined, undefined, n]}><sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial color={color} toneMapped={false} /></instancedMesh>;
}

function Patrol({ amount }) {
    const guard = useRef();
    const cps = useRef([]);
    const pos = useMemo(() => CHECKPOINTS.map((t) => PATROL.at(t)), []);
    useFrame((st) => {
        const a = amount.current;
        guard.current.visible = a > 0.02 && a < 0.999;
        PATROL.at(a, guard.current.position);
        guard.current.position.y = 0.9 + Math.abs(Math.sin(st.clock.elapsedTime * 9)) * 0.15;
        cps.current.forEach((m, i) => {
            const done = a >= CHECKPOINTS[i];
            m.material.color.set(done ? '#34d399' : a > 0.02 ? '#64748b' : '#33405a');
            m.scale.setScalar(done ? 1 + Math.sin(st.clock.elapsedTime * 3 + i) * 0.08 : 0.8);
        });
    });
    return (
        <group>
            <mesh ref={guard}><capsuleGeometry args={[0.55, 0.9, 6, 12]} /><meshBasicMaterial color="#93c5fd" toneMapped={false} /><pointLight color="#93c5fd" intensity={14} distance={10} /></mesh>
            {pos.map((p, i) => (
                <mesh key={i} ref={(el) => (cps.current[i] = el)} position={[p.x, 0.2, p.z]} rotation-x={-Math.PI / 2}>
                    <ringGeometry args={[0.8, 1.3, 32]} />
                    <meshBasicMaterial color="#33405a" toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
}

function Cars({ count = 7, still }) {
    const ref = useRef();
    const lights = useRef();
    const offsets = useMemo(() => Array.from({ length: count }, (_, i) => i / count + (i % 2) * 0.03), [count]);
    const tmp = useMemo(() => ({ o: new THREE.Object3D(), a: new THREE.Vector3(), b: new THREE.Vector3() }), []);
    useFrame((st) => {
        const t = still ? 0.3 : st.clock.elapsedTime * 0.012;
        offsets.forEach((o, i) => {
            const u = (t + o) % 1;
            LOOP.at(u, tmp.a);
            LOOP.at((u + 0.002) % 1, tmp.b);
            tmp.o.position.set(tmp.a.x, 0.75, tmp.a.z);
            tmp.o.lookAt(tmp.b.x, 0.75, tmp.b.z);
            tmp.o.scale.set(1.9, 1.2, 4.2);
            tmp.o.updateMatrix();
            ref.current.setMatrixAt(i, tmp.o.matrix);
            tmp.o.translateZ(0.52);
            tmp.o.scale.set(1.5, 0.25, 0.1);
            tmp.o.updateMatrix();
            lights.current.setMatrixAt(i, tmp.o.matrix);
        });
        ref.current.instanceMatrix.needsUpdate = true;
        lights.current.instanceMatrix.needsUpdate = true;
    });
    const colors = ['#c9d2de', '#7f1d1d', '#1e293b', '#e5e7eb', '#334155', '#9a3412', '#475569'];
    useLayoutEffect(() => {
        const c = new THREE.Color();
        for (let i = 0; i < count; i++) ref.current.setColorAt(i, c.set(colors[i % colors.length]));
        ref.current.instanceColor.needsUpdate = true;
    }, [count]);
    return (
        <group>
            <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow><boxGeometry args={[1, 1, 1]} /><meshLambertMaterial /></instancedMesh>
            <instancedMesh ref={lights} args={[undefined, undefined, count]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#fff6d8" toneMapped={false} /></instancedMesh>
        </group>
    );
}

/** Street lamps + window light spill + far-off town lights, as additive glow sprites. */
function Glows({ lots }) {
    const tex = useGlowTexture();
    const { lamps, poles, town } = useMemo(() => {
        seed = 5;
        const lamps = [], poles = [];
        STREETS.forEach((z) => { for (let x = -40; x <= 40; x += 13.3) { lamps.push(x, 4.6, z + 3.9); poles.push({ p: [x, 2.3, z + 3.9], s: [0.15, 4.6, 0.15] }); } });
        for (let x = -130; x <= -60; x += 14) { lamps.push(x, 4.6, 4.5); poles.push({ p: [x, 2.3, 4.5], s: [0.15, 4.6, 0.15] }); }
        const town = [];
        for (let i = 0; i < 420; i++) {
            const a = rnd() * Math.PI * 2, r = 130 + rnd() * 160;
            town.push(Math.cos(a) * r, 0.5 + rnd() * 3, Math.sin(a) * r);
        }
        return { lamps: new Float32Array(lamps), poles, town: new Float32Array(town) };
    }, [lots]);
    const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
    const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#2b3342' }), []);
    return (
        <group>
            <Instances items={poles} geometry={box} material={mat} />
            <points>
                <bufferGeometry><bufferAttribute attach="attributes-position" args={[lamps, 3]} /></bufferGeometry>
                <pointsMaterial map={tex} size={9} color="#ffbe5c" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </points>
            <points>
                <bufferGeometry><bufferAttribute attach="attributes-position" args={[lamps.map((v, i) => (i % 3 === 1 ? 0.2 : v)), 3]} /></bufferGeometry>
                <pointsMaterial map={tex} size={16} color="#7a5520" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </points>
            <points>
                <bufferGeometry><bufferAttribute attach="attributes-position" args={[town, 3]} /></bufferGeometry>
                <pointsMaterial map={tex} size={3.2} color="#f6c27a" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </points>
        </group>
    );
}

// camera keyframes per chapter: position, look-at
const SHOTS = [
    [[62, 52, 78], [2, 0, 4]],
    [[-80, 22, 30], [-50, 1, 0]],
    [[30, 22, -44], [WORK.x, 2, WORK.z]],
    [[0, 92, 30], [0, 0, 0]],
    [[-30, 46, 70], [SOS.x - 18, 0, SOS.z - 10]],
];
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function Director({ progress, reduced, refs }) {
    const { camera, pointer, size } = useThree();
    const look = useRef(new THREE.Vector3(...SHOTS[0][1]));
    const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }), []);
    useFrame((st, dt) => {
        const f = clamp01(progress.get()) * (SHOTS.length - 1);
        const i = Math.min(SHOTS.length - 2, Math.floor(f));
        const k = smooth(clamp01(f - i));
        tmp.p.lerpVectors(tmp.a.set(...SHOTS[i][0]), tmp.b.set(...SHOTS[i + 1][0]), k);
        tmp.l.lerpVectors(tmp.a.set(...SHOTS[i][1]), tmp.b.set(...SHOTS[i + 1][1]), k);
        // slow drift on the opening shot, a little parallax everywhere
        const t = st.clock.elapsedTime;
        const calm = reduced ? 0 : Math.max(0, 1 - f * 2);
        tmp.p.x += Math.sin(t * 0.08) * 14 * calm + (reduced ? 0 : pointer.x * 3);
        tmp.p.z += Math.cos(t * 0.08) * 6 * calm;
        tmp.p.y += reduced ? 0 : pointer.y * 2;
        if (size.width < 700) tmp.p.multiplyScalar(1.28).setY(tmp.p.y * 1.05);  // portrait: step back
        const lam = reduced ? 50 : 3.2;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, tmp.p.x, lam, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, tmp.p.y, lam, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, tmp.p.z, lam, dt);
        look.current.lerp(tmp.l, 1 - Math.exp(-lam * dt));
        camera.lookAt(look.current);

        // chapter-driven state: ramps up as a chapter arrives, fades after the next one
        const arrive = (c) => clamp01((f - (c - 1) - 0.35) / 0.65);
        const leave = (c) => 1 - clamp01((f - c - 0.45) / 0.4);
        refs.lift.current = clamp01(arrive(1) * 1.2) * leave(1);
        refs.gatePin.current = clamp01(arrive(1)) * leave(1);
        refs.workPin.current = clamp01(arrive(2)) * leave(2);
        refs.patrol.current = clamp01((f - 2.4) / 0.9);
        refs.sos.current = clamp01(arrive(4));
        refs.route.current = clamp01((f - 3.4) / 0.6);
    });
    return null;
}

export default function HeroScene({ progress, active = true, reduced = false }) {
    const lots = useMemo(buildLots, []);
    const refs = {
        lift: useRef(0), gatePin: useRef(0), workPin: useRef(0), patrol: useRef(0), sos: useRef(0), route: useRef(0),
    };
    return (
        <Canvas
            frameloop={active ? 'always' : 'never'}
            dpr={[1, 1.75]}
            shadows
            camera={{ position: SHOTS[0][0], fov: 38, near: 1, far: 900 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ scene, gl }) => {
                scene.background = new THREE.Color('#0a1226');
                scene.fog = new THREE.FogExp2('#0a1226', 0.0062);
                gl.toneMapping = THREE.ACESFilmicToneMapping;
            }}
        >
            <hemisphereLight args={['#4a5f99', '#0b1320', 1.15]} />
            <directionalLight position={[-60, 90, 40]} intensity={1.1} color="#9fb4ff" castShadow
                shadow-mapSize={[2048, 2048]} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-bias={-0.0005} />
            <Roads />
            <Neighborhood lots={lots} />
            <Clubhouse />
            <Gatehouse lift={refs.lift} />
            <Glows lots={lots} />
            <Cars still={reduced} />
            <Pin at={{ x: GATE.x + 4.5, z: -1 }} color="#f5a524" show={refs.gatePin} y={8} />
            <Pin at={WORK} color="#fb923c" show={refs.workPin} y={10} />
            <Pin at={SOS} color="#ef4444" show={refs.sos} y={10} />
            <Route path={SOS_PATH} reveal={refs.route} color="#ef4444" />
            <Patrol amount={refs.patrol} />
            <Director progress={progress} reduced={reduced} refs={refs} />
        </Canvas>
    );
}
