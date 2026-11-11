import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Realistic Karachi-style houses for every plot, fully instanced (one draw call per part):
 * boundary wall + gate, paved driveway with a parked car, ground floor + upper floors with balcony slab,
 * windows & main door, roof parapet, stair room (mumty), black water tank, garden tree / street lamp.
 * Each plot's front (street side) is found automatically: the short end that does not touch another plot.
 */
export const FLOOR = 0.42;           // scene units per storey (S = 0.1 → ~3.6 m)
const S = 0.1;

const FACADE = ['#f2ede4', '#ebe3d6', '#e6dccb', '#f4efe8', '#ddd5c8', '#efe1cd', '#e9d5c0', '#d8dcd3', '#f0e6da', '#e4d3c1', '#cfc8bc', '#f3e9dc'];
const ACCENT = ['#b5654a', '#a9a39a', '#8f9a8c', '#c9a27a', '#7d8a95'];
const CARS = ['#f4f4f2', '#c9ccd0', '#1d1f22', '#a51c1c', '#2d4f86', '#6b6f75', '#e9e6dc', '#3c3f44'];
const rng = (seed) => { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

/** Unit geometries shared by all parts. */
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const CROWN = new THREE.IcosahedronGeometry(0.5, 1);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);

/** Which short end of each plot faces the street (+1 or −1 along the long axis). */
function fronts(placed) {
    const cell = 40, grid = new Map();
    const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    placed.forEach((h) => { const k = key(h.mx, h.my); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(h); });
    const inside = (h, px, py) => {
        const a = THREE.MathUtils.degToRad(h.ma), dx = px - h.mx, dy = py - h.my;
        const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
        return Math.abs(u) < h.mw / 2 && Math.abs(v) < h.mh / 2;
    };
    const blocked = (self, px, py) => {
        const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${cx + i},${cy + j}`) || []) if (o !== self && inside(o, px, py)) return true;
        return false;
    };
    const out = new Map();
    for (const h of placed) {
        const a = THREE.MathUtils.degToRad(h.ma), ux = Math.cos(a), uy = Math.sin(a), r = h.mw / 2 + 4;
        const p = blocked(h, h.mx + ux * r, h.my + uy * r), m = blocked(h, h.mx - ux * r, h.my - uy * r);
        out.set(h.id, p && !m ? -1 : 1);
    }
    return out;
}

function Part({ mref, geo, count, mat, cast, recv, ev }) {
    return (
        <instancedMesh ref={mref} args={[geo, null, Math.max(1, count)]} castShadow={cast} receiveShadow={recv} frustumCulled={false} {...ev}>
            {mat}
        </instancedMesh>
    );
}

export default function RealHouses({ houses, to, layer, night, colorOf, hover, setHover, onSelect }) {
    const placed = useMemo(() => houses.filter((h) => h.mx != null), [houses]);
    const front = useMemo(() => fronts(placed), [placed]);

    /* ---------- build every part's matrices once per layout ---------- */
    const L = useMemo(() => {
        const parts = {};
        const P = (name) => (parts[name] ||= { m: [], c: [], ids: [] });
        const o = new THREE.Object3D();
        const put = (name, h, cx, cz, rot, lx, ly, lz, sx, sy, sz, color, ry = 0) => {
            const cs = Math.cos(rot), sn = Math.sin(rot);
            o.position.set(cx + lx * cs + lz * sn, ly, cz - lx * sn + lz * cs);
            o.rotation.set(0, rot + ry, 0); o.scale.set(sx, sy, sz); o.updateMatrix();
            const p = P(name); p.m.push(o.matrix.clone()); p.c.push(color); p.ids.push(h.id);
        };
        placed.forEach((h) => {
            const r = rng(h.id * 13 + 7);
            const [cx, cz] = to(h.mx, h.my);
            const rot = -THREE.MathUtils.degToRad(h.ma);
            const f = front.get(h.id) || 1;
            const Lp = h.mw * S * 0.98, Wp = h.mh * S * 0.96;          // plot (long × short)
            const bung = h.series === 'N';
            const fl = Math.max(1, h.floors || 1);
            const yardF = Lp * (bung ? 0.22 : 0.17), yardB = Lp * (bung ? 0.08 : 0.05);
            const Lb = Lp - yardF - yardB, Wb = Wp * (bung ? 0.84 : 0.94);
            const bx = f * (Lp / 2 - yardF - Lb / 2);                  // building centre along the long axis
            const facade = FACADE[(h.id * 7) % FACADE.length];
            const accent = r() < 0.22 ? ACCENT[h.id % ACCENT.length] : facade;
            const wallC = r() < 0.5 ? '#d9d1c2' : facade;

            // ground: paved front yard + garden / back yard
            put('yard', h, cx, cz, rot, f * (Lp / 2 - yardF / 2), 0.012, 0, yardF, 0.02, Wp, bung ? '#c7c0b2' : '#bdb6a8');
            put('lawn', h, cx, cz, rot, bx, 0.008, 0, Lp - yardF, 0.012, Wp, bung ? '#86ad6a' : '#a3a68e');
            if (bung) put('lawn', h, cx, cz, rot, f * (Lp / 2 - yardF / 2), 0.016, Wp * 0.33, yardF * 0.85, 0.02, Wp * 0.28, '#7fae5f');

            // boundary wall (1.7 m) with a gate in the front
            const wh = 0.2, wt = 0.022, gw = Math.min(Wp * 0.45, 0.42);
            put('cwall', h, cx, cz, rot, -f * Lp / 2, wh / 2, 0, wt, wh, Wp, wallC);
            put('cwall', h, cx, cz, rot, 0, wh / 2, Wp / 2, Lp, wh, wt, wallC);
            put('cwall', h, cx, cz, rot, 0, wh / 2, -Wp / 2, Lp, wh, wt, wallC);
            const seg = (Wp - gw) / 2;
            put('cwall', h, cx, cz, rot, f * Lp / 2, wh / 2, -Wp / 2 + seg / 2 + (bung ? 0 : Wp * 0.05), wt, wh, seg, wallC);
            put('cwall', h, cx, cz, rot, f * Lp / 2, wh / 2, Wp / 2 - seg / 2 + (bung ? 0 : Wp * 0.05), wt, wh, seg, wallC);
            put('gate', h, cx, cz, rot, f * Lp / 2, wh * 0.48, Wp * 0.05, wt * 0.6, wh * 0.92, gw, ['#2b2f33', '#3d2f25', '#24384a', '#4a4a4a'][h.id % 4]);

            // ground floor + upper floors (upper set back a little behind a balcony slab)
            put('gf', h, cx, cz, rot, bx, FLOOR / 2, 0, Lb, FLOOR, Wb, facade);
            const set = bung ? Lb * 0.1 : Lb * 0.06;
            if (fl > 1) {
                const uh = (fl - 1) * FLOOR;
                put('up', h, cx, cz, rot, bx - f * set / 2, FLOOR + uh / 2, 0, Lb - set, uh, Wb, accent);
                for (let k = 1; k < fl; k++) put('slab', h, cx, cz, rot, bx + f * 0.04, k * FLOOR, 0, Lb + 0.08, 0.035, Wb + 0.04, '#e9e4da');
                // balcony railing on the front edge of each slab
                for (let k = 1; k < fl; k++) put('rail', h, cx, cz, rot, f * (Lb / 2 + 0.08) + bx, k * FLOOR + 0.06, 0, 0.012, 0.09, Wb * 0.9, '#3b3f42');
            }
            const topY = fl * FLOOR;
            put('slab', h, cx, cz, rot, bx - (fl > 1 ? f * set / 2 : 0), topY, 0, (fl > 1 ? Lb - set : Lb) + 0.05, 0.03, Wb + 0.05, '#d8d2c6');
            // parapet
            const rl = fl > 1 ? Lb - set : Lb, rbx = bx - (fl > 1 ? f * set / 2 : 0);
            [[rbx + rl / 2, 0, 0.018, Wb], [rbx - rl / 2, 0, 0.018, Wb], [rbx, Wb / 2, rl, 0.018], [rbx, -Wb / 2, rl, 0.018]].forEach(([x, z, sx, sz]) => put('parapet', h, cx, cz, rot, x, topY + 0.05, z, sx, 0.08, sz, facade));
            // stair room (mumty) + water tank (+ some solar panels)
            const mx = rbx - f * rl * 0.28, mz = -Wb * 0.22;
            put('mumty', h, cx, cz, rot, mx, topY + 0.14, mz, rl * 0.22, 0.28, Wb * 0.38, facade);
            put('tank', h, cx, cz, rot, mx, topY + 0.28 + 0.09, mz + Wb * 0.05, 0.16, 0.18, 0.16, r() < 0.7 ? '#1d1f22' : '#2e5a8a');
            if (r() < 0.3) put('solar', h, cx, cz, rot, rbx + f * rl * 0.12, topY + 0.08, Wb * 0.18, rl * 0.3, 0.02, Wb * 0.4, '#1f2d45', 0.0);

            // windows: front & back facades every floor, long sides for bungalows
            for (let k = 0; k < fl; k++) {
                const y = k * FLOOR + FLOOR * 0.55;
                const faceF = (k === 0 ? bx + f * Lb / 2 : bx - f * set / 2 + f * (Lb - set) / 2) + f * 0.004;
                const faceB = bx - f * Lb / 2 - f * 0.004;
                const nw = Wb > 1.2 ? 3 : 2;
                for (let i = 0; i < nw; i++) {
                    const z = (i - (nw - 1) / 2) * (Wb / nw);
                    if (!(k === 0 && i === Math.floor(nw / 2))) put('win', h, cx, cz, rot, faceF, y, z, 0.012, 0.15, Math.min(0.2, Wb / nw * 0.55), '');
                    put('win', h, cx, cz, rot, faceB, y, z, 0.012, 0.13, Math.min(0.16, Wb / nw * 0.45), '');
                }
                if (bung) for (let i = 0; i < 3; i++) [1, -1].forEach((sd) => put('win', h, cx, cz, rot, bx + (i - 1) * Lb * 0.28, y, sd * (Wb / 2 + 0.004), Math.min(0.2, Lb * 0.12), 0.13, 0.012, ''));
            }
            put('door', h, cx, cz, rot, bx + f * (Lb / 2 + 0.005), 0.115, 0, 0.012, 0.23, 0.13, ['#5a3a24', '#3d2a1d', '#6b4a2f'][h.id % 3]);

            // car in the driveway
            if (r() < (bung ? 0.8 : 0.55)) {
                const car = CARS[Math.floor(r() * CARS.length)];
                const zc = bung ? -Wp * 0.18 : 0;
                put('car', h, cx, cz, rot, f * (Lp / 2 - yardF / 2), 0.07, zc, 0.48, 0.1, 0.2, car);
                put('cabin', h, cx, cz, rot, f * (Lp / 2 - yardF / 2) - f * 0.03, 0.155, zc, 0.26, 0.08, 0.18, car);
            }
            // garden tree (bungalows) / street tree + lamp outside the front wall of some plots
            if (bung) {
                const s = 0.7 + r() * 0.5;
                put('trunk', h, cx, cz, rot, f * (Lp / 2 - yardF * 0.35), 0.18 * s, Wp * 0.33, 0.05, 0.36 * s, 0.05, '#6b4f3a');
                put('crown', h, cx, cz, rot, f * (Lp / 2 - yardF * 0.35), 0.48 * s, Wp * 0.33, 0.55 * s, 0.5 * s, 0.55 * s, ['#3f7d3a', '#4a8a3f', '#56913f', '#3a6f35'][h.id % 4]);
            } else if (h.id % 3 === 0) {
                put('trunk', h, cx, cz, rot, f * (Lp / 2 + 0.16), 0.15, Wp * 0.4, 0.04, 0.3, 0.04, '#6b4f3a');
                put('crown', h, cx, cz, rot, f * (Lp / 2 + 0.16), 0.42, Wp * 0.4, 0.42, 0.4, 0.42, ['#4b8a42', '#3f7a3a', '#5b9a48'][h.id % 3]);
            }
            if (h.id % 4 === 1) {
                put('pole', h, cx, cz, rot, f * (Lp / 2 + 0.12), 0.32, -Wp / 2, 0.025, 0.64, 0.025, '#3a4245');
                put('lamp', h, cx, cz, rot, f * (Lp / 2 + 0.2), 0.64, -Wp / 2, 0.14, 0.03, 0.06, '');
            }
        });
        return parts;
    }, [placed, to, front]);

    /* ---------- refs for every part ---------- */
    const names = ['yard', 'lawn', 'cwall', 'gate', 'gf', 'up', 'slab', 'rail', 'parapet', 'mumty', 'tank', 'solar', 'win', 'door', 'car', 'cabin', 'trunk', 'crown', 'pole', 'lamp'];
    const refs = Object.fromEntries(names.map((n) => [n, useRef()])); // eslint-disable-line react-hooks/rules-of-hooks
    const count = (n) => L[n]?.m.length || 0;

    useLayoutEffect(() => {
        for (const n of names) {
            const mesh = refs[n].current, p = L[n];
            if (!mesh || !p) continue;
            p.m.forEach((m, i) => mesh.setMatrixAt(i, m));
            mesh.count = p.m.length;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
        }
    }, [L, night]); // eslint-disable-line

    // colours depend on the data layer and day / night
    useLayoutEffect(() => {
        const c = new THREE.Color();
        const byId = Object.fromEntries(placed.map((h) => [h.id, h]));
        const lit = (id, i) => ((id * 31 + i * 7) % 10) > 3;
        for (const n of names) {
            const mesh = refs[n].current, p = L[n];
            if (!mesh || !p) continue;
            p.c.forEach((col, i) => {
                const h = byId[p.ids[i]];
                let v = col;
                if ((n === 'gf' || n === 'up' || n === 'parapet' || n === 'mumty') && (layer !== 'overview' || h.sos || h.mine)) v = colorOf(h, layer);
                if (n === 'win') v = night ? (lit(h.id, i) ? '#ffd58a' : '#1a242b') : '#3e4f5a';
                if (n === 'lamp') v = night ? '#fff0c2' : '#d7dcdc';
                if (n === 'lawn' && night) v = '#2f4a2c';
                mesh.setColorAt(i, c.set(v));
            });
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    }, [L, layer, night, colorOf, placed]); // eslint-disable-line

    // picking on the building bodies
    const ev = (n) => ({
        onPointerMove: (e) => { e.stopPropagation(); const h = placed.find((x) => x.id === L[n].ids[e.instanceId]); if (h && hover?.id !== h.id) { setHover(h); document.body.style.cursor = 'pointer'; } },
        onPointerOut: () => { setHover(null); document.body.style.cursor = ''; },
        onClick: (e) => { e.stopPropagation(); const h = placed.find((x) => x.id === L[n].ids[e.instanceId]); if (h) onSelect(h); },
    });
    const std = (props = {}) => <meshStandardMaterial roughness={0.85} {...props} />;

    return (
        <group>
            <Part mref={refs.yard} geo={BOX} count={count('yard')} mat={std({ roughness: 0.95 })} recv />
            <Part mref={refs.lawn} geo={BOX} count={count('lawn')} mat={std({ roughness: 1 })} recv />
            <Part mref={refs.cwall} geo={BOX} count={count('cwall')} mat={std()} cast recv />
            <Part mref={refs.gate} geo={BOX} count={count('gate')} mat={std({ metalness: 0.5, roughness: 0.45 })} cast />
            <Part mref={refs.gf} geo={BOX} count={count('gf')} mat={std({ roughness: 0.75 })} cast recv ev={ev('gf')} />
            <Part mref={refs.up} geo={BOX} count={count('up')} mat={std({ roughness: 0.75 })} cast recv ev={ev('up')} />
            <Part mref={refs.slab} geo={BOX} count={count('slab')} mat={std({ roughness: 0.7 })} cast recv />
            <Part mref={refs.rail} geo={BOX} count={count('rail')} mat={std({ metalness: 0.6, roughness: 0.4 })} />
            <Part mref={refs.parapet} geo={BOX} count={count('parapet')} mat={std()} cast />
            <Part mref={refs.mumty} geo={BOX} count={count('mumty')} mat={std()} cast recv />
            <Part mref={refs.tank} geo={CYL} count={count('tank')} mat={std({ roughness: 0.45 })} cast />
            <Part mref={refs.solar} geo={BOX} count={count('solar')} mat={std({ metalness: 0.7, roughness: 0.25 })} />
            {night
                ? <Part key="wn" mref={refs.win} geo={BOX} count={count('win')} mat={<meshBasicMaterial toneMapped={false} />} />
                : <Part key="wd" mref={refs.win} geo={BOX} count={count('win')} mat={std({ metalness: 0.55, roughness: 0.12 })} />}
            <Part mref={refs.door} geo={BOX} count={count('door')} mat={std({ roughness: 0.6 })} />
            <Part mref={refs.car} geo={BOX} count={count('car')} mat={std({ metalness: 0.55, roughness: 0.3 })} cast />
            <Part mref={refs.cabin} geo={BOX} count={count('cabin')} mat={std({ metalness: 0.6, roughness: 0.2 })} cast />
            <Part mref={refs.trunk} geo={BOX} count={count('trunk')} mat={std()} cast />
            <Part mref={refs.crown} geo={CROWN} count={count('crown')} mat={std({ roughness: 0.9, flatShading: true })} cast recv />
            <Part mref={refs.pole} geo={BOX} count={count('pole')} mat={std({ metalness: 0.4 })} />
            {night
                ? <Part key="ln" mref={refs.lamp} geo={BOX} count={count('lamp')} mat={<meshBasicMaterial toneMapped={false} />} />
                : <Part key="ld" mref={refs.lamp} geo={BOX} count={count('lamp')} mat={std()} />}
        </group>
    );
}

export { CONE, CROWN, BOX, CYL, rng };
