import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UNIT } from '../lib/api';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, RoundedBox, Environment, Lightformer } from '@react-three/drei';
import CC from 'camera-controls';
import * as THREE from 'three';
import { X, ChevronLeft, ChevronRight, Box, Footprints, Maximize2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Info, Layers } from 'lucide-react';
import { makePlan, wallPieces, roomFrame, walkable, roomAt, WALL_H, FLOOR_H } from '../lib/floorplan';
import { SIGNAL_META } from '../lib/siteplan';

/* ============================== styles & textures ============================== */

const STYLES = {
    warm: { name: 'Warm', wall: '#ece3d6', accent: '#5b3a25', wood: '#b98b5e', marble: '#efe9df', vein: '#c4b49c', tile: '#e6e1d8', fabric: '#d9ccb9', fabric2: '#7c3f2b', metal: '#b08d57', rug: '#cdbfa8', bed: '#f3eee6', bg: '#e9e2d8', light: '#ffd9a8', grass: '#6f8f4e' },
    modern: { name: 'Modern', wall: '#f3f3f1', accent: '#30353a', wood: '#cdb898', marble: '#f5f5f5', vein: '#c3c3c3', tile: '#e9ecee', fabric: '#a0a8ad', fabric2: '#2e4a5a', metal: '#202020', rug: '#d8dbde', bed: '#ffffff', bg: '#e8ebee', light: '#fff0dc', grass: '#6c9152' },
    classic: { name: 'Classic', wall: '#efe5cc', accent: '#3d2a1c', wood: '#8a5a35', marble: '#ebe2cb', vein: '#b49f72', tile: '#e8e0cb', fabric: '#2f5d50', fabric2: '#8c2f39', metal: '#b8962e', rug: '#7e3b33', bed: '#f6f0e1', bg: '#e8dfca', light: '#ffd49a', grass: '#62844a' },
};

function canvasTex(draw, size = 512) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}
const shade = (hex, f) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return '#' + c.getHexString(); };

function makeTextures(p) {
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    return {
        wood: canvasTex((g, n) => {
            const rows = 8, h = n / rows;
            for (let r = 0; r < rows; r++) {
                let x = -rnd() * n;
                while (x < n) {
                    const w = n * (0.45 + rnd() * 0.5);
                    g.fillStyle = shade(p.wood, (rnd() - 0.5) * 0.08); g.fillRect(x, r * h, w, h);
                    g.strokeStyle = 'rgba(60,35,15,.10)';
                    for (let k = 0; k < 6; k++) { g.beginPath(); const y = r * h + rnd() * h; g.moveTo(x, y); g.bezierCurveTo(x + w * 0.3, y + 3, x + w * 0.6, y - 3, x + w, y + 1); g.stroke(); }
                    g.fillStyle = 'rgba(40,25,10,.35)'; g.fillRect(x, r * h, 1.5, h);
                    x += w;
                }
                g.fillStyle = 'rgba(40,25,10,.3)'; g.fillRect(0, r * h, n, 1.5);
            }
        }),
        marble: canvasTex((g, n) => {
            g.fillStyle = p.marble; g.fillRect(0, 0, n, n);
            for (let k = 0; k < 14; k++) {
                g.strokeStyle = `rgba(120,110,95,${0.05 + rnd() * 0.1})`; g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath();
                let x = rnd() * n, y = 0; g.moveTo(x, y);
                while (y < n) { x += (rnd() - 0.5) * 60; y += 20 + rnd() * 40; g.lineTo(x, y); }
                g.stroke();
            }
            g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; g.strokeRect(0, 0, n, n);
        }),
        tile: canvasTex((g, n) => {
            g.fillStyle = p.tile; g.fillRect(0, 0, n, n);
            g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3;
            for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * n / 4, 0); g.lineTo(i * n / 4, n); g.moveTo(0, i * n / 4); g.lineTo(n, i * n / 4); g.stroke(); }
        }),
        grass: canvasTex((g, n) => {
            g.fillStyle = p.grass; g.fillRect(0, 0, n, n);
            for (let i = 0; i < 9000; i++) { g.fillStyle = shade(p.grass, (rnd() - 0.5) * 0.14); g.fillRect(rnd() * n, rnd() * n, 2, 4); }
        }, 256),
        paving: canvasTex((g, n) => {
            g.fillStyle = '#c9c3b8'; g.fillRect(0, 0, n, n);
            for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = shade('#c9c3b8', (rnd() - 0.5) * 0.06); g.fillRect(x * n / 4 + (y % 2) * n / 8 + 2, y * n / 8 + 2, n / 4 - 4, n / 8 - 4); }
        }, 256),
        art: [0, 1, 2, 3].map((i) => canvasTex((g, n) => {
            const cols = [[p.fabric2, p.marble, p.metal], ['#2e4a5a', '#e9e2d8', '#c58b5a'], ['#6d7b5a', '#efe6d5', '#3c2f28'], ['#b4553c', '#f1e7d8', '#24323a']][i];
            g.fillStyle = cols[1]; g.fillRect(0, 0, n, n);
            g.fillStyle = cols[0]; g.beginPath(); g.arc(n * (0.35 + i * 0.08), n * 0.45, n * 0.26, 0, 7); g.fill();
            g.fillStyle = cols[2]; g.fillRect(n * 0.15, n * (0.62 + i * 0.03), n * 0.7, n * 0.08);
            g.strokeStyle = cols[0]; g.lineWidth = 6; g.beginPath(); g.moveTo(n * 0.6, n * 0.15); g.quadraticCurveTo(n * 0.9, n * 0.5, n * 0.55, n * 0.85); g.stroke();
        }, 256)),
    };
}
const rep = (tex, w, d, size) => { const t = tex.clone(); t.repeat.set(w / size, d / size); t.needsUpdate = true; return t; };

/* ============================== primitives ============================== */

const Bx = ({ p, s, c, r = 0, rough = 0.75, metal = 0, emissive, ei = 0, map, shadow = true, rx = 0 }) => (
    <mesh position={p} rotation={[rx, r, 0]} castShadow={shadow} receiveShadow>
        <boxGeometry args={s} />
        <meshStandardMaterial color={c} roughness={rough} metalness={metal} map={map} emissive={emissive || '#000'} emissiveIntensity={ei} />
    </mesh>
);
const Cy = ({ p, r = 0.1, r2, h, c, rough = 0.6, metal = 0, emissive, ei = 0, seg = 24, rot }) => (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
        <cylinderGeometry args={[r, r2 ?? r, h, seg]} />
        <meshStandardMaterial color={c} roughness={rough} metalness={metal} emissive={emissive || '#000'} emissiveIntensity={ei} />
    </mesh>
);
const RB = ({ p, s, c, rad = 0.06, rough = 0.9 }) => (
    <RoundedBox args={s} radius={rad} smoothness={3} position={p} castShadow receiveShadow>
        <meshStandardMaterial color={c} roughness={rough} />
    </RoundedBox>
);

/* ============================== furniture (back at z=0, facing +z) ============================== */

const Sofa = ({ w = 2.3, c, c2 }) => (
    <group>
        <RB p={[0, 0.24, 0.48]} s={[w, 0.34, 0.92]} c={c} rad={0.05} />
        <RB p={[0, 0.62, 0.13]} s={[w, 0.6, 0.24]} c={c} rad={0.08} />
        <RB p={[-w / 2 + 0.1, 0.5, 0.5]} s={[0.2, 0.42, 0.95]} c={c} rad={0.07} />
        <RB p={[w / 2 - 0.1, 0.5, 0.5]} s={[0.2, 0.42, 0.95]} c={c} rad={0.07} />
        {[-1, 1].map((k) => <RB key={k} p={[k * (w / 4 - 0.05), 0.47, 0.5]} s={[w / 2 - 0.3, 0.14, 0.7]} c={shade(c, 0.03)} rad={0.06} />)}
        {[-1, 1].map((k) => <RB key={'p' + k} p={[k * (w / 2 - 0.5), 0.68, 0.32]} s={[0.42, 0.38, 0.14]} c={c2} rad={0.07} />)}
        {[-1, 1].map((k) => <Bx key={'l' + k} p={[k * (w / 2 - 0.12), 0.04, 0.48]} s={[0.05, 0.08, 0.8]} c="#2a2018" />)}
    </group>
);
const Armchair = ({ c }) => (
    <group>
        <RB p={[0, 0.25, 0.42]} s={[0.8, 0.34, 0.78]} c={c} rad={0.1} />
        <RB p={[0, 0.62, 0.12]} s={[0.8, 0.55, 0.22]} c={c} rad={0.12} />
        <RB p={[-0.36, 0.48, 0.42]} s={[0.16, 0.32, 0.74]} c={c} rad={0.07} />
        <RB p={[0.36, 0.48, 0.42]} s={[0.16, 0.32, 0.74]} c={c} rad={0.07} />
    </group>
);
const Plant = ({ s = 1 }) => (
    <group scale={s}>
        <Cy p={[0, 0.22, 0]} r={0.2} r2={0.15} h={0.44} c="#d9d2c6" rough={0.5} />
        {[...Array(9)].map((_, i) => {
            const a = (i / 9) * Math.PI * 2, t = 0.5 + (i % 3) * 0.12;
            return <mesh key={i} position={[Math.cos(a) * 0.14, 0.75 + (i % 3) * 0.18, Math.sin(a) * 0.14]} rotation={[Math.sin(a) * t, a, Math.cos(a) * t]} castShadow>
                <sphereGeometry args={[0.2, 10, 8]} /><meshStandardMaterial color={i % 2 ? '#3f6b35' : '#4d7d3c'} roughness={0.8} />
            </mesh>;
        })}
        <Cy p={[0, 0.55, 0]} r={0.02} h={0.4} c="#4a3b28" />
    </group>
);
const FloorLamp = ({ p, metal, light }) => (
    <group position={p}>
        <Cy p={[0, 0.02, 0]} r={0.16} h={0.03} c={metal} metal={0.7} rough={0.3} />
        <Cy p={[0, 0.75, 0]} r={0.015} h={1.5} c={metal} metal={0.7} rough={0.3} />
        <Cy p={[0, 1.55, 0]} r={0.16} r2={0.24} h={0.3} c="#f6eee2" emissive={light} ei={0.9} />
    </group>
);
const TableLamp = ({ p, light, metal }) => (
    <group position={p}>
        <Cy p={[0, 0.12, 0]} r={0.06} r2={0.09} h={0.24} c={metal} metal={0.5} rough={0.35} />
        <Cy p={[0, 0.34, 0]} r={0.1} r2={0.15} h={0.2} c="#f6eee2" emissive={light} ei={0.8} />
    </group>
);
const Rug = ({ w, d, c, round }) => (
    <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        {round ? <circleGeometry args={[w / 2, 48]} /> : <planeGeometry args={[w, d]} />}
        <meshStandardMaterial color={c} roughness={1} />
    </mesh>
);
const Art = ({ p, w = 1, h = 0.75, tex, frame = '#2a2018' }) => (
    <group position={p}>
        <Bx p={[0, 0, 0]} s={[w + 0.06, h + 0.06, 0.035]} c={frame} rough={0.4} shadow={false} />
        <mesh position={[0, 0, 0.019]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} roughness={0.9} /></mesh>
    </group>
);
const Bed = ({ w = 1.8, pal }) => (
    <group>
        <Bx p={[0, 0.17, 1.05]} s={[w + 0.1, 0.3, 2.1]} c={pal.accent} rough={0.6} />
        <RB p={[0, 0.42, 1.05]} s={[w, 0.24, 2.0]} c={pal.bed} rad={0.06} />
        <RB p={[0, 0.56, 1.35]} s={[w + 0.06, 0.1, 1.35]} c={pal.fabric} rad={0.05} />
        <RB p={[0, 0.58, 1.95]} s={[w + 0.06, 0.08, 0.35]} c={pal.fabric2} rad={0.04} />
        {(w > 1.3 ? [-1, 1] : [0]).map((k) => <RB key={k} p={[k * w / 4, 0.62, 0.32]} s={[w > 1.3 ? w / 2 - 0.15 : 0.7, 0.18, 0.42]} c="#fbf8f2" rad={0.08} />)}
        <RB p={[0, 0.75, 0.05]} s={[w + 0.3, 1.2, 0.1]} c={pal.fabric} rad={0.04} />
    </group>
);
const SideTable = ({ p, pal }) => (
    <group position={p}>
        <Bx p={[0, 0.25, 0]} s={[0.48, 0.5, 0.42]} c={pal.accent} rough={0.5} />
        <Bx p={[0, 0.3, 0.212]} s={[0.4, 0.01, 0.01]} c={pal.metal} metal={0.8} rough={0.3} />
        <TableLamp p={[0, 0.5, 0]} light={pal.light} metal={pal.metal} />
    </group>
);
const Wardrobe = ({ w = 2, pal }) => (
    <group>
        <Bx p={[0, 1.15, 0.31]} s={[w, 2.3, 0.62]} c={shade(pal.accent, 0.05)} rough={0.55} />
        {[...Array(Math.round(w / 0.5))].map((_, i, a) => <Bx key={i} p={[-w / 2 + (i + 0.5) * (w / a.length), 1.15, 0.625]} s={[w / a.length - 0.012, 2.26, 0.01]} c={shade(pal.accent, 0.08)} rough={0.5} shadow={false} />)}
        {[...Array(Math.round(w / 1))].map((_, i) => <Bx key={'h' + i} p={[-w / 2 + (i + 0.5) * (w / Math.round(w / 1)), 1.1, 0.64]} s={[0.02, 0.45, 0.02]} c={pal.metal} metal={0.8} rough={0.25} shadow={false} />)}
    </group>
);
const TVWall = ({ w = 2.2, pal }) => (
    <group>
        <Bx p={[0, 1.4, 0.03]} s={[w + 0.8, 2.6, 0.06]} c={pal.accent} rough={0.5} />
        <Bx p={[0, 0.22, 0.25]} s={[w, 0.4, 0.42]} c={shade(pal.accent, 0.1)} rough={0.4} />
        <Bx p={[0, 1.35, 0.09]} s={[1.5, 0.86, 0.04]} c="#0b0d10" rough={0.2} metal={0.3} emissive="#13273a" ei={0.35} />
        <Plant s={0.6} />
    </group>
);
const Dining = ({ pal, n = 6 }) => (
    <group>
        <Bx p={[0, 0.74, 0]} s={[1.9, 0.05, 0.95]} c={pal.accent} rough={0.35} />
        {[[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]].map(([x, z], i) => <Bx key={i} p={[x, 0.36, z]} s={[0.06, 0.72, 0.06]} c={pal.accent} />)}
        {[...Array(n)].map((_, i) => {
            const side = i < n / 2 ? -1 : 1, k = i % (n / 2), x = (k - (n / 2 - 1) / 2) * 0.62;
            return <group key={i} position={[x, 0, side * 0.72]} rotation-y={side < 0 ? 0 : Math.PI}>
                <RB p={[0, 0.46, 0]} s={[0.46, 0.08, 0.44]} c={pal.fabric} rad={0.03} />
                <RB p={[0, 0.82, -0.2]} s={[0.46, 0.66, 0.06]} c={pal.fabric} rad={0.03} />
                {[[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].map(([a, b], j) => <Bx key={j} p={[a, 0.21, b]} s={[0.035, 0.42, 0.035]} c={pal.accent} />)}
            </group>;
        })}
        <Cy p={[0, 0.82, 0]} r={0.12} r2={0.08} h={0.12} c={pal.metal} metal={0.6} rough={0.3} />
    </group>
);
const Pendant = ({ p, pal }) => (
    <group position={p}>
        <Cy p={[0, -0.4, 0]} r={0.006} h={0.8} c="#222" />
        <mesh position={[0, -0.85, 0]}><sphereGeometry args={[0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={pal.metal} metalness={0.7} roughness={0.3} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, -0.86, 0]}><sphereGeometry args={[0.08, 12, 8]} /><meshStandardMaterial color="#fff" emissive={pal.light} emissiveIntensity={2} /></mesh>
    </group>
);
const Kitchen = ({ len, side, pal }) => (
    <group>
        <Bx p={[0, 0.44, 0.3]} s={[len, 0.88, 0.6]} c={shade(pal.accent, 0.12)} rough={0.5} />
        <Bx p={[0, 0.9, 0.31]} s={[len + 0.02, 0.04, 0.63]} c={pal.marble} rough={0.25} />
        <Bx p={[0, 1.85, 0.18]} s={[len - 0.9, 0.7, 0.35]} c={shade(pal.accent, 0.14)} rough={0.5} />
        <Bx p={[0, 1.2, 0.02]} s={[len, 0.6, 0.02]} c={pal.tile} rough={0.3} shadow={false} />
        <Bx p={[-len / 4, 0.915, 0.32]} s={[0.6, 0.02, 0.45]} c="#9aa1a6" metal={0.8} rough={0.25} />
        <Bx p={[len / 4, 0.92, 0.3]} s={[0.6, 0.012, 0.5]} c="#111" rough={0.15} />
        {[[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]].map(([a, b], i) => <Cy key={i} p={[len / 4 + a, 0.93, 0.3 + b]} r={0.08} h={0.005} c="#333" emissive="#ff4d1a" ei={i === 0 ? 0.6 : 0} />)}
        <Bx p={[len / 4, 1.55, 0.24]} s={[0.7, 0.35, 0.45]} c="#cfd3d6" metal={0.8} rough={0.25} />
        <Bx p={[len / 2 - 0.38, 0.93, 0.35]} s={[0.75, 1.86, 0.7]} c="#d8dcdf" metal={0.6} rough={0.3} />
        {side > 0 && <group position={[-len / 2 + 0.3, 0, 0.6 + side / 2]} rotation-y={Math.PI / 2}><Bx p={[0, 0.44, 0]} s={[side, 0.88, 0.6]} c={shade(pal.accent, 0.12)} /><Bx p={[0, 0.9, 0]} s={[side, 0.04, 0.62]} c={pal.marble} rough={0.25} /></group>}
    </group>
);
const BathSet = ({ len, depth, pal }) => (
    <group>
        <group position={[-len / 2 + 0.45, 0, 0.05]}>
            <Bx p={[0, 0.2, 0.3]} s={[0.38, 0.4, 0.55]} c="#fafafa" rough={0.2} />
            <Bx p={[0, 0.6, 0.08]} s={[0.4, 0.4, 0.16]} c="#fafafa" rough={0.2} />
        </group>
        <group position={[len / 2 - 0.62, 0, 0]}>
            <Bx p={[0, 0.42, 0.26]} s={[1.0, 0.5, 0.5]} c={pal.accent} rough={0.45} />
            <Bx p={[0, 0.7, 0.26]} s={[1.02, 0.06, 0.52]} c={pal.marble} rough={0.2} />
            <Cy p={[0, 0.76, 0.28]} r={0.2} r2={0.16} h={0.1} c="#fdfdfd" rough={0.15} />
            <Bx p={[0, 1.6, 0.02]} s={[0.9, 0.9, 0.02]} c="#dfe7ea" metal={1} rough={0.05} />
        </group>
        {depth > 1.9 && <group position={[0, 0, depth - 0.55]}>
            <Bx p={[0, 0.03, 0]} s={[len * 0.6, 0.06, 1.0]} c={pal.tile} rough={0.3} />
            <mesh position={[0, 1.05, -0.5]}><boxGeometry args={[len * 0.6, 2.0, 0.015]} /><meshPhysicalMaterial color="#e8f4f8" transmission={0.9} roughness={0.05} thickness={0.01} transparent opacity={0.35} /></mesh>
            <Cy p={[0, 2.1, 0.35]} r={0.1} h={0.02} c="#bbb" metal={0.9} rough={0.2} />
        </group>}
    </group>
);
const Desk = ({ pal }) => (
    <group>
        <Bx p={[0, 0.74, 0.32]} s={[1.3, 0.04, 0.62]} c={pal.wood} rough={0.4} />
        <Bx p={[-0.6, 0.36, 0.32]} s={[0.04, 0.72, 0.6]} c={pal.accent} /><Bx p={[0.6, 0.36, 0.32]} s={[0.04, 0.72, 0.6]} c={pal.accent} />
        <Bx p={[0.2, 0.98, 0.15]} s={[0.55, 0.36, 0.03]} c="#111" emissive="#1d3550" ei={0.4} />
        <TableLamp p={[-0.45, 0.76, 0.2]} light={pal.light} metal={pal.metal} />
        <group position={[0, 0, 0.95]} rotation-y={Math.PI}><RB p={[0, 0.46, 0]} s={[0.5, 0.08, 0.48]} c={pal.fabric2} rad={0.03} /><RB p={[0, 0.85, -0.22]} s={[0.5, 0.6, 0.06]} c={pal.fabric2} rad={0.03} /><Cy p={[0, 0.22, 0]} r={0.03} h={0.44} c="#222" /></group>
        <Bx p={[0, 1.65, 0.12]} s={[1.3, 0.03, 0.25]} c={pal.wood} />
        {[...Array(6)].map((_, i) => <Bx key={i} p={[-0.5 + i * 0.12, 1.79, 0.12]} s={[0.05, 0.24 + (i % 3) * 0.03, 0.18]} c={['#8c2f39', '#2f5d50', '#d8b45a', '#2e4a5a'][i % 4]} />)}
    </group>
);
const Car = ({ c = '#b3b8bd' }) => (
    <group>
        <RB p={[0, 0.55, 0]} s={[1.8, 0.6, 4.4]} c={c} rad={0.18} rough={0.25} />
        <RB p={[0, 1.02, -0.2]} s={[1.6, 0.48, 2.3]} c="#1b2228" rad={0.16} rough={0.1} />
        {[[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.35], [0.85, -1.35]].map(([x, z], i) => <Cy key={i} p={[x, 0.34, z]} r={0.34} h={0.24} c="#151515" rot={[0, 0, Math.PI / 2]} />)}
        {[-0.6, 0.6].map((x) => <Bx key={x} p={[x, 0.62, 2.2]} s={[0.35, 0.1, 0.02]} c="#fff" emissive="#fff6d0" ei={1} shadow={false} />)}
    </group>
);
const Stairs = ({ rm, pal, tex }) => {
    const w = rm.x1 - rm.x0, d = rm.z1 - rm.z0;
    const fw = Math.min(1.2, w / 2 - 0.1), steps = 8, rise = FLOOR_H / 16, tread = Math.min(0.28, (d - 1.1) / steps);
    const out = [];
    for (let i = 0; i < steps; i++) out.push(<Bx key={'a' + i} p={[rm.x0 + 0.1 + fw / 2, rise * (i + 0.5), rm.z0 + 0.25 + tread * (i + 0.5)]} s={[fw, rise, tread]} c={pal.marble} map={tex} rough={0.35} />);
    const landZ = rm.z0 + 0.25 + tread * steps;
    out.push(<Bx key="land" p={[rm.x0 + w / 2, rise * 8, (landZ + rm.z1) / 2]} s={[w - 0.2, 0.12, rm.z1 - landZ - 0.05]} c={pal.marble} map={tex} />);
    for (let i = 0; i < steps; i++) out.push(<Bx key={'b' + i} p={[rm.x1 - 0.1 - fw / 2, rise * (9 + i), landZ - tread * (i + 0.5)]} s={[fw, rise, tread]} c={pal.marble} map={tex} rough={0.35} />);
    out.push(<mesh key="rail" position={[rm.x0 + w / 2, rise * 8 + 0.5, rm.z0 + 0.25 + (tread * steps) / 2]}><boxGeometry args={[0.02, 1.0 + rise * 8, tread * steps]} /><meshPhysicalMaterial color="#dfe9ec" transparent opacity={0.3} roughness={0.05} /></mesh>);
    out.push(<Bx key="hand" p={[rm.x0 + w / 2, rise * 8 + 1.0, rm.z0 + 0.25 + (tread * steps) / 2]} s={[0.05, 0.05, tread * steps]} c={pal.metal} metal={0.8} rough={0.3} />);
    return <group>{out}</group>;
};

/* ============================== furnishing per room ============================== */

function furnish(f, rm, pal, tex, idx) {
    if (rm.type === 'stairs') return <Stairs rm={rm} pal={pal} tex={tex.marble} />;
    const F = roomFrame(f, rm);
    const put = (u, v, el, k, turn = 0, y = 0) => { const [x, z] = F.at(u, v); return <group key={k} position={[x, y, z]} rotation-y={F.rot + turn}>{el}</group>; };
    const L = F.len, Dp = F.depth, off = F.doorU > 0 ? -0.35 : 0.35; // shift big pieces away from the door side
    const items = [];
    const art = tex.art[idx % tex.art.length];
    switch (rm.type) {
        case 'drawing': {
            const sw = Math.min(2.6, L - 1.4);
            items.push(put(off, 0.05, <Sofa w={sw} c={pal.fabric} c2={pal.fabric2} />, 'sofa'));
            items.push(put(off, 1.7, <><Rug w={Math.min(3, L - 1)} round c={pal.rug} /><Cy p={[0, 0.38, 0]} r={0.5} h={0.04} c={pal.marble} rough={0.2} /><Cy p={[0, 0.18, 0]} r={0.18} r2={0.3} h={0.36} c={pal.accent} /></>, 'table'));
            if (Dp > 3.6) { items.push(put(off - 0.75, 2.9, <Armchair c={pal.fabric2} />, 'a1', Math.PI)); items.push(put(off + 0.75, 2.9, <Armchair c={pal.fabric2} />, 'a2', Math.PI)); }
            items.push(put(off, 0.02, <Art p={[0, 1.65, 0]} w={1.3} h={0.85} tex={art} />, 'art'));
            items.push(put(L / 2 - 0.4, 0.4, <Plant s={1.1} />, 'plant'));
            items.push(put(-L / 2 + 0.35, 0.3, <FloorLamp p={[0, 0, 0]} metal={pal.metal} light={pal.light} />, 'lamp'));
            break;
        }
        case 'lounge': {
            items.push(put(0, 0.02, <TVWall w={Math.min(2.2, L - 1)} pal={pal} />, 'tv'));
            if (Dp > 2.6) items.push(put(0, Dp - 0.1, <Sofa w={Math.min(2.3, L - 0.8)} c={pal.fabric} c2={pal.fabric2} />, 'sofa', Math.PI));
            items.push(put(0, Dp / 2, <><Rug w={Math.min(2.6, L - 0.8)} d={1.6} c={pal.rug} /><Bx p={[0, 0.2, 0]} s={[1.1, 0.06, 0.6]} c={pal.accent} rough={0.4} /></>, 'rug'));
            break;
        }
        case 'dining': {
            items.push(put(0, Dp / 2, <Dining pal={pal} n={L > 3.3 ? 6 : 4} />, 'dining', Math.PI / 2 * (L < Dp ? 1 : 0)));
            items.push(put(0, 0.02, <><Bx p={[0, 0.42, 0.22]} s={[Math.min(1.8, L - 1), 0.84, 0.44]} c={pal.accent} rough={0.45} /><Art p={[0, 1.65, 0]} w={1.1} h={0.75} tex={art} /></>, 'side'));
            items.push(<group key="pend" position={[rm.cx, WALL_H, rm.cz]}><Pendant p={[0, 0, 0]} pal={pal} /></group>);
            break;
        }
        case 'kitchen': {
            items.push(put(0, 0, <Kitchen len={Math.max(1.8, L - 0.2)} side={Dp > 3 ? Math.min(1.8, Dp - 2.2) : 0} pal={pal} />, 'k'));
            break;
        }
        case 'bedroom': case 'master': case 'kids': {
            const bw = rm.type === 'master' ? 1.9 : rm.type === 'kids' ? 1.1 : 1.6;
            const bu = rm.type === 'kids' ? off * 2.2 : off * 0.5;
            items.push(put(bu, 0.02, <Bed w={bw} pal={pal} />, 'bed'));
            items.push(put(bu, 1.25, <Rug w={bw + 1.1} d={1.6} c={pal.rug} />, 'rug'));
            items.push(put(bu - bw / 2 - 0.35, 0.25, <SideTable p={[0, 0, 0]} pal={pal} />, 's1'));
            if (rm.type !== 'kids') items.push(put(bu + bw / 2 + 0.35, 0.25, <SideTable p={[0, 0, 0]} pal={pal} />, 's2'));
            items.push(put(bu, 0.02, <Art p={[0, 1.75, 0]} w={rm.type === 'kids' ? 0.6 : 1.2} h={0.6} tex={art} />, 'art'));
            if (Dp > 3.2) items.push(put(0, Dp - 0.02, <Wardrobe w={Math.min(2.4, L - 1.6)} pal={pal} />, 'ward', Math.PI));
            if (rm.type === 'kids' && L > 2.8) items.push(put(-off * 2.4, 2.4, <Desk pal={pal} />, 'desk', Math.PI / 2 * Math.sign(off)));
            if (rm.type === 'master') items.push(put(-off * 3.2, 0.4, <Plant s={0.9} />, 'pl'));
            break;
        }
        case 'study': {
            items.push(put(0, 0.02, <Desk pal={pal} />, 'desk'));
            if (Dp > 2.6) items.push(put(0, Dp - 0.1, <Sofa w={Math.min(1.8, L - 1)} c={pal.fabric} c2={pal.fabric2} />, 'sofa', Math.PI));
            break;
        }
        case 'bath': {
            items.push(put(0, 0, <BathSet len={L} depth={Dp} pal={pal} />, 'bath'));
            break;
        }
        case 'corridor': {
            if (f.level === 0) {
                items.push(put(0, 0.02, <><Bx p={[0, 0.82, 0.18]} s={[Math.min(1.2, L - 0.3), 0.06, 0.34]} c={pal.accent} rough={0.4} /><Bx p={[0, 0.4, 0.18]} s={[Math.min(1.1, L - 0.4), 0.04, 0.3]} c={pal.accent} /><mesh position={[0, 1.6, 0.02]}><circleGeometry args={[0.4, 40]} /><meshStandardMaterial color="#e8eef0" metalness={1} roughness={0.05} /></mesh></>, 'console'));
            }
            items.push(<mesh key="runner" position={[rm.cx, 0.011, rm.cz]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[Math.max(0.6, rm.x1 - rm.x0 - 0.7), Math.max(0.6, rm.z1 - rm.z0 - 1)]} /><meshStandardMaterial color={pal.rug} roughness={1} /></mesh>);
            items.push(<group key="pl" position={[rm.x0 + 0.3, 0, rm.z0 + 0.4]}><Plant s={0.8} /></group>);
            break;
        }
        default:
    }
    return <group>{items}</group>;
}

/* ============================== doors, windows, walls ============================== */

function Door({ o, pal, open }) {
    const leaf = useRef();
    const cam = useThree((s) => s.camera);
    const w = o.to - o.from;
    const mid = new THREE.Vector3();
    useFrame((_, dt) => {
        if (!leaf.current) return;
        mid.set(o.line === 'z' ? o.mid : o.c, 1.2, o.line === 'z' ? o.c : o.mid).add(leaf.current.parent.parent.position);
        const near = cam.position.distanceTo(mid) < 2.6;
        const target = open || near ? 1.45 : 0;
        const sgn = o.line === 'z' ? -o.inward : o.inward;
        leaf.current.rotation.y += (target * sgn - leaf.current.rotation.y) * Math.min(1, dt * 3.5);
    });
    const along = o.line === 'z';
    const thick = o.kind === 'main' ? 0.07 : 0.045;
    return (
        <group position={[along ? o.from : o.c, 0, along ? o.c : o.from]} rotation-y={along ? 0 : -Math.PI / 2}>
            <Bx p={[-0.03, o.height / 2, 0]} s={[0.06, o.height, 0.16]} c={shade(pal.accent, -0.05)} />
            <Bx p={[w + 0.03, o.height / 2, 0]} s={[0.06, o.height, 0.16]} c={shade(pal.accent, -0.05)} />
            <Bx p={[w / 2, o.height + 0.03, 0]} s={[w + 0.12, 0.06, 0.16]} c={shade(pal.accent, -0.05)} />
            <group ref={leaf}>
                <Bx p={[w / 2, (o.height - 0.02) / 2, 0]} s={[w - 0.02, o.height - 0.02, thick]} c={pal.accent} rough={0.45} />
                {o.kind === 'main' && [0.6, 1.4].map((y) => <Bx key={y} p={[w / 2, y, 0.04]} s={[w - 0.25, 0.02, 0.01]} c={pal.metal} metal={0.8} rough={0.3} shadow={false} />)}
                <Bx p={[w - 0.1, 1.05, 0.05 * o.inward]} s={[0.025, o.kind === 'main' ? 0.6 : 0.16, 0.03]} c={pal.metal} metal={0.85} rough={0.25} />
            </group>
        </group>
    );
}

function Window({ wdw, pal, curtains }) {
    const along = wdw.line === 'z';
    const h = wdw.top - wdw.sill, w = wdw.to - wdw.from;
    return (
        <group position={[along ? wdw.mid : wdw.c, wdw.sill + h / 2, along ? wdw.c : wdw.mid]} rotation-y={along ? 0 : Math.PI / 2}>
            <mesh><boxGeometry args={[w, h, 0.02]} /><meshPhysicalMaterial color="#cfe3ea" transparent opacity={0.22} roughness={0.02} metalness={0.1} /></mesh>
            <Bx p={[0, h / 2, 0]} s={[w, 0.05, 0.12]} c="#2b2b2b" metal={0.6} rough={0.4} shadow={false} />
            <Bx p={[0, -h / 2, 0]} s={[w + 0.1, 0.05, 0.22]} c={pal.marble} shadow={false} />
            <Bx p={[0, 0, 0]} s={[0.04, h, 0.1]} c="#2b2b2b" metal={0.6} rough={0.4} shadow={false} />
            {curtains && [-1, 1].map((k) => (
                <mesh key={k} position={[k * (w / 2 + 0.12), 0.08, wdw.edge === 'front' || wdw.edge === 'left' ? 0.14 : -0.14]} castShadow>
                    <boxGeometry args={[0.32, h + 0.6, 0.06]} /><meshStandardMaterial color={pal.fabric} roughness={1} />
                </mesh>
            ))}
        </group>
    );
}

/** Exterior walls facing the camera disappear in dollhouse mode — the cut-away look. */
function Walls({ pieces, pal, doll, center }) {
    const refs = useRef([]);
    const cam = useThree((s) => s.camera);
    const v = new THREE.Vector3();
    useFrame(() => {
        v.copy(cam.position).sub(center); v.y = 0; v.normalize();
        pieces.forEach((pc, i) => {
            const m = refs.current[i];
            if (!m) return;
            m.visible = !(doll && pc.ext && pc.normal[0] * v.x + pc.normal[1] * v.z > 0.25);
        });
    });
    return pieces.map((pc, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[pc.x, pc.y + pc.h / 2, pc.z]} castShadow receiveShadow>
            <boxGeometry args={pc.line === 'z' ? [pc.len, pc.h, pc.t] : [pc.t, pc.h, pc.len]} />
            <meshStandardMaterial color={pc.ext ? shade(pal.wall, -0.02) : pal.wall} roughness={0.92} />
        </mesh>
    ));
}

/* ============================== the scene ============================== */

const FLOOR_TEX = { drawing: 'marble', dining: 'marble', corridor: 'marble', stairs: 'marble', kitchen: 'tile', bath: 'tile', lounge: 'wood', bedroom: 'wood', master: 'wood', kids: 'wood', study: 'wood' };
const TEX_SIZE = { marble: 1.2, tile: 1.2, wood: 2.4 };

function Floor({ plan, f, pal, tex, doll, onRoom, onFloorClick, highlight }) {
    const W = plan.width, D = plan.depth;
    const pieces = useMemo(() => wallPieces(plan, f), [plan, f]);
    const furniture = useMemo(() => f.rooms.map((rm, i) => <group key={'f' + rm.key}>{furnish(f, rm, pal, tex, i)}</group>), [f, pal, tex]);
    const center = useMemo(() => new THREE.Vector3(0, 0, 0), []);
    const floorTex = useMemo(() => Object.fromEntries(f.rooms.map((rm) => [rm.key, rep(tex[FLOOR_TEX[rm.type] || 'marble'], rm.x1 - rm.x0, rm.z1 - rm.z0, TEX_SIZE[FLOOR_TEX[rm.type] || 'marble'])])), [f, tex]);
    return (
        <group position={[-W / 2, 0, -D / 2]}>
            {/* slab under the floor */}
            <Bx p={[W / 2, -0.11, D / 2]} s={[W + 0.3, 0.2, D + 0.3]} c="#d6cfc4" shadow={false} />
            {f.rooms.map((rm) => (
                <mesh key={rm.key} position={[rm.cx, 0.002, rm.cz]} rotation-x={-Math.PI / 2} receiveShadow
                    onClick={(e) => { if (e.delta > 5) return; e.stopPropagation(); doll ? onRoom(rm.key) : onFloorClick(e.point); }}
                    onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
                    <planeGeometry args={[rm.x1 - rm.x0, rm.z1 - rm.z0]} />
                    <meshStandardMaterial map={floorTex[rm.key]} roughness={FLOOR_TEX[rm.type] === 'wood' ? 0.55 : 0.18} metalness={0.02} emissive={highlight === rm.key ? '#f5a524' : '#000'} emissiveIntensity={highlight === rm.key ? 0.25 : 0} />
                </mesh>
            ))}
            <Walls pieces={pieces} pal={pal} doll={doll} center={center} />
            {f.openings.filter((o) => o.kind === 'door' || o.kind === 'main').map((o, i) => <Door key={i} o={o} pal={pal} open={doll} />)}
            {f.windows.map((w, i) => <Window key={i} wdw={w} pal={pal} curtains={['drawing', 'master', 'bedroom', 'lounge', 'kids'].includes(f.rooms.find((r) => r.key === w.room)?.type)} />)}
            {furniture}
            {/* room lights */}
            {f.rooms.filter((rm) => rm.type !== 'stairs').map((rm) => <pointLight key={'l' + rm.key} position={[rm.cx, WALL_H - 0.35, rm.cz]} intensity={doll ? 2.2 : 3.2} distance={Math.max(5, (rm.x1 - rm.x0 + rm.z1 - rm.z0))} decay={1.6} color={pal.light} />)}
            {/* ceilings only when walking inside */}
            {!doll && f.rooms.map((rm) => (
                <group key={'c' + rm.key}>
                    <mesh position={[rm.cx, WALL_H, rm.cz]} rotation-x={Math.PI / 2}><planeGeometry args={[rm.x1 - rm.x0, rm.z1 - rm.z0]} /><meshStandardMaterial color="#f7f3ec" roughness={1} /></mesh>
                    {[...Array(Math.max(1, Math.round((rm.z1 - rm.z0) / 2)))].flatMap((_, a, arr) => [...Array(Math.max(1, Math.round((rm.x1 - rm.x0) / 2.2)))].map((__, b, brr) => (
                        <mesh key={a + '-' + b} position={[rm.x0 + (b + 0.5) * (rm.x1 - rm.x0) / brr.length, WALL_H - 0.01, rm.z0 + (a + 0.5) * (rm.z1 - rm.z0) / arr.length]} rotation-x={Math.PI / 2}>
                            <circleGeometry args={[0.06, 16]} /><meshStandardMaterial color="#fff" emissive={pal.light} emissiveIntensity={2.5} side={THREE.DoubleSide} />
                        </mesh>
                    )))}
                </group>
            ))}
            {/* skirting at the base of interior walls */}
            {pieces.filter((pc) => pc.kind === 'full').map((pc, i) => <mesh key={'sk' + i} position={[pc.x, 0.05, pc.z]}><boxGeometry args={pc.line === 'z' ? [pc.len, 0.1, pc.t + 0.02] : [pc.t + 0.02, 0.1, pc.len]} /><meshStandardMaterial color={shade(pal.accent, 0.1)} roughness={0.6} /></mesh>)}
        </group>
    );
}

function Plot({ plan, pal, tex, level }) {
    const W = plan.width, D = plan.depth;
    const pw = W + plan.side * 2, pd = D + plan.front + plan.back;
    const gx = -W / 2 - plan.side, gz = -D / 2 - plan.front;
    const t = useMemo(() => ({ grass: rep(tex.grass, pw, pd, 3), paving: rep(tex.paving, 6.5, plan.front, 1.6) }), [tex, pw, pd, plan.front]);
    if (level > 0) return <mesh position={[0, -0.25, 0]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[pw + 6, pd + 6]} /><meshStandardMaterial color="#d9d2c6" roughness={1} /></mesh>;
    return (
        <group>
            <mesh position={[gx + pw / 2, -0.02, gz + pd / 2]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[pw, pd]} /><meshStandardMaterial map={t.grass} roughness={1} /></mesh>
            <mesh position={[0, -0.01, gz + plan.front / 2]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[Math.min(W, 6.5), plan.front]} /><meshStandardMaterial map={t.paving} roughness={0.9} /></mesh>
            <mesh position={[gx + pw / 2, -0.04, gz - 4]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[pw + 30, 8]} /><meshStandardMaterial color="#5b5f63" roughness={0.95} /></mesh>
            <mesh position={[gx + pw / 2, -0.06, gz + pd / 2]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[pw + 40, pd + 40]} /><meshStandardMaterial color="#cfc8bb" roughness={1} /></mesh>
            {/* boundary wall with gate gap */}
            {[[gx, gz + pd / 2, 0.2, pd], [gx + pw, gz + pd / 2, 0.2, pd], [gx + pw / 2, gz + pd, pw, 0.2]].map(([x, z, a, b], i) => <Bx key={i} p={[x, 0.65, z]} s={[a, 1.3, b]} c={shade(pal.wall, -0.06)} />)}
            <Bx p={[gx + (pw / 2 - 2.6) / 2, 0.65, gz]} s={[pw / 2 - 2.6, 1.3, 0.2]} c={shade(pal.wall, -0.06)} />
            <Bx p={[gx + pw - (pw / 2 - 2.6) / 2, 0.65, gz]} s={[pw / 2 - 2.6, 1.3, 0.2]} c={shade(pal.wall, -0.06)} />
            {plan.front > 4 && <group position={[Math.min(1.4, W / 4), 0, gz + plan.front / 2 + 0.2]} rotation-y={Math.PI}><Car c={['#b3b8bd', '#1f2a36', '#8c2f39', '#efefef'][plan.width > 11 ? 1 : 0]} /></group>}
            {[[-W / 2 + 0.6, gz + 0.8], [W / 2 - 0.6, gz + 0.8], [W / 2 - 0.6, -D / 2 - 0.6]].map(([x, z], i) => <group key={i} position={[x, 0, z]}><Plant s={1.2} /></group>)}
        </group>
    );
}

/* ============================== camera rig ============================== */

function Fov({ mode }) {
    const cam = useThree((s) => s.camera);
    useEffect(() => { cam.fov = mode === 'walk' ? 64 : 38; cam.updateProjectionMatrix(); }, [mode, cam]);
    return null;
}

/** Moves DOM labels to the screen position of 3D points every frame (replaces drei <Html>, which crashes on unmount). */
const pv = new THREE.Vector3();
function LabelProjector({ points, refs, active }) {
    const { camera, size } = useThree();
    useFrame(() => {
        if (!active) return;
        for (const [key, x, y, z] of points) {
            const el = refs.current[key];
            if (!el) continue;
            pv.set(x, y, z).project(camera);
            const vis = pv.z < 1 && Math.abs(pv.x) < 1.2 && Math.abs(pv.y) < 1.2;
            el.style.transform = vis ? `translate(${((pv.x + 1) / 2) * size.width}px, ${((1 - pv.y) / 2) * size.height}px) translate(-50%, -50%)` : 'translate(-9999px,0)';
        }
    });
    return null;
}

const EYE = 1.6;
const tmp = new THREE.Vector3(), dirV = new THREE.Vector3();

function Rig({ plan, f, mode, cmd, setRoom, keys, ctrlRef }) {
    const ctrl = ctrlRef;
    const cam = useThree((s) => s.camera);
    const W = plan.width, D = plan.depth;
    const lastRoom = useRef(null);
    const run = useRef(0);   // newest camera command wins; older animated paths stop
    const toLocal = (x, z) => [x + W / 2, z + D / 2];

    // movement while walking
    useFrame((_, dt) => {
        const c = ctrl.current;
        if (!c || mode !== 'walk') return;
        const k = keys.current;
        const fwd = (k.ArrowUp || k.w ? 1 : 0) - (k.ArrowDown || k.s ? 1 : 0);
        const side = (k.ArrowRight || k.d ? 1 : 0) - (k.ArrowLeft || k.a ? 1 : 0);
        if (fwd || side) {
            cam.getWorldDirection(dirV); dirV.y = 0; dirV.normalize();
            const sp = 1.7 * Math.min(dt, 0.05);
            c.getTarget(tmp);
            const nx = tmp.x + dirV.x * fwd * sp - dirV.z * side * sp, nz = tmp.z + dirV.z * fwd * sp + dirV.x * side * sp;
            const [lx, lz] = toLocal(nx, nz);
            if (walkable(f, lx, lz)) { cam.getWorldDirection(dirV); c.setLookAt(nx, EYE, nz, nx + dirV.x * 1e-3, EYE + dirV.y * 1e-3, nz + dirV.z * 1e-3, false); }
        }
        c.getTarget(tmp);
        const [lx, lz] = toLocal(tmp.x, tmp.z);
        const rm = roomAt(f, lx, lz);
        if (rm && rm.key !== lastRoom.current) { lastRoom.current = rm.key; setRoom(rm.key); }
    });

    useEffect(() => {
        const c = ctrl.current;
        if (!c) return;
        if (mode === 'doll') {
            c.mouseButtons.left = CC.ACTION.ROTATE; c.mouseButtons.right = CC.ACTION.TRUCK; c.mouseButtons.wheel = CC.ACTION.DOLLY;
            c.touches.one = CC.ACTION.TOUCH_ROTATE; c.touches.two = CC.ACTION.TOUCH_DOLLY_TRUCK;
            c.azimuthRotateSpeed = 1; c.polarRotateSpeed = 1; c.minDistance = 4; c.maxDistance = 80; c.minPolarAngle = 0.12; c.maxPolarAngle = 1.32; c.smoothTime = 0.45;
            lastRoom.current = null;
        } else {
            c.mouseButtons.left = CC.ACTION.ROTATE; c.mouseButtons.right = CC.ACTION.NONE; c.mouseButtons.wheel = CC.ACTION.NONE;
            c.touches.one = CC.ACTION.TOUCH_ROTATE; c.touches.two = CC.ACTION.NONE;
            c.azimuthRotateSpeed = -0.32; c.polarRotateSpeed = -0.32; c.minDistance = 0; c.maxDistance = 1e-2; c.minPolarAngle = 0.35; c.maxPolarAngle = 2.75; c.smoothTime = 0.15;
        }
    }, [mode, ctrl]);

    // commands: { type: 'doll' | 'enter' | 'jump' | 'step', ... }
    useEffect(() => {
        const c = ctrl.current;
        if (!c || !cmd) return;
        const my = ++run.current;
        const L = Math.max(W, D);
        if (cmd.type === 'doll') {
            c.minDistance = 0; c.maxDistance = 80; c.minPolarAngle = 0.12; c.maxPolarAngle = 1.32;
            const aspect = cam.aspect || 1.6;
            const k = 1.2 * Math.max(1, 0.9 / aspect);
            c.setLookAt(L * 0.55 * k, L * 0.95 * k, -L * 0.95 * k, 0, 0.4, 0, true);
        } else if (cmd.type === 'enter' || cmd.type === 'jump') {
            const { eye, look, path } = cmd;
            const fp = () => { if (run.current !== my) return; const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2], n = Math.hypot(dx, dy, dz) || 1; c.minDistance = 0; c.maxDistance = 1e-2; c.setLookAt(eye[0], eye[1], eye[2], eye[0] + dx / n * 1e-3, eye[1] + dy / n * 1e-3, eye[2] + dz / n * 1e-3, false); cmd.done?.(); };
            if (cmd.type === 'jump') return fp();
            c.minDistance = 0; c.maxDistance = 200; c.minPolarAngle = 0.05; c.maxPolarAngle = 2.9;
            (async () => {
                for (const [e, l, t] of path) { if (run.current !== my) return; c.smoothTime = t; await c.setLookAt(e[0], e[1], e[2], l[0], l[1], l[2], true); }
                if (run.current !== my) return;
                c.smoothTime = 0.15;
                fp();
            })();
        } else if (cmd.type === 'step') {
            cam.getWorldDirection(dirV);
            c.smoothTime = 0.35;
            c.setLookAt(cmd.x, EYE, cmd.z, cmd.x + dirV.x * 1e-3, EYE + dirV.y * 1e-3, cmd.z + dirV.z * 1e-3, true).then(() => { c.smoothTime = 0.15; });
        }
    }, [cmd]); // eslint-disable-line

    return <CameraControls ref={ctrl} makeDefault dollyToCursor />;
}

/* ============================== main component ============================== */

export default function HouseInterior({ house, signals = [], onClose, onRoute }) {
    const plan = useMemo(() => makePlan(house), [house]);
    const [styleKey, setStyleKey] = useState(() => { try { return localStorage.getItem('interior-style') || 'warm'; } catch { return 'warm'; } });
    const pal = STYLES[styleKey];
    const tex = useMemo(() => makeTextures(pal), [pal]);
    const [level, setLevel] = useState(0);
    const [mode, setMode] = useState('doll');
    const [cmd, setCmd] = useState(null);
    const [room, setRoom] = useState(null);
    const [hover, setHover] = useState(null);
    const [fade, setFade] = useState(false);
    const [panel, setPanel] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
    const keys = useRef({});
    const labelRefs = useRef({});
    const ctrl = useRef();
    const wrap = useRef();
    const f = plan.floors[level];
    const W = plan.width, D = plan.depth;
    const w2 = (x, z) => [x - W / 2, z - D / 2];
    const mySignals = signals.filter((s) => s.house_id === house.id);

    useEffect(() => { try { localStorage.setItem('interior-style', styleKey); } catch { /* ignore */ } }, [styleKey]);
    useEffect(() => { const t = setTimeout(() => setCmd({ type: 'doll', n: Date.now() }), 60); return () => clearTimeout(t); }, []);
    useEffect(() => {
        const down = (e) => { if (e.key === 'Escape') { mode === 'walk' ? backToDoll() : onClose(); return; } keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true; };
        const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }); // eslint-disable-line

    /** Camera path into a room: stand outside its door, walk through it, look into the room. */
    const roomShot = useCallback((fl, key) => {
        const rm = fl.rooms.find((x) => x.key === key);
        const o = fl.openings.find((x) => x.room === key);
        const look = [...w2(rm.cx, rm.cz)];
        if (!o) { const [x, z] = w2(rm.cx, rm.z0 + 0.8); return { eye: [x, EYE, z], look: [look[0], 1.3, look[1] + 3], outside: [x, EYE, z - 1.5], door: null }; }
        const dm = o.line === 'z' ? [o.mid, o.c] : [o.c, o.mid];
        const n = o.line === 'z' ? [0, o.inward] : [o.inward, 0];
        const out = w2(dm[0] - n[0] * 1.6, dm[1] - n[1] * 1.6);
        const inn = w2(dm[0] + n[0] * 0.9, dm[1] + n[1] * 0.9);
        const doorP = w2(dm[0], dm[1]);
        // look further into the room along the door normal, biased to the room centre
        const far = w2(dm[0] + n[0] * 4, dm[1] + n[1] * 4);
        let lk = [(far[0] + look[0]) / 2, 1.35, (far[1] + look[1]) / 2];
        // narrow room entered from its long side (galley kitchen, long lounge): look down its length instead of at the opposite wall
        const across = o.line === 'x' ? rm.x1 - rm.x0 : rm.z1 - rm.z0;
        const along = o.line === 'x' ? rm.z1 - rm.z0 : rm.x1 - rm.x0;
        if (across < 4.5 && along > across * 1.6) {
            const lo = o.line === 'x' ? rm.z0 : rm.x0, hi = o.line === 'x' ? rm.z1 : rm.x1;
            const end = Math.abs(hi - o.mid) > Math.abs(o.mid - lo) ? hi - 0.4 : lo + 0.4;
            const mc = o.line === 'x' ? (rm.x0 + rm.x1) / 2 : (rm.z0 + rm.z1) / 2;
            const t = o.line === 'x' ? w2(mc, end) : w2(end, mc);
            lk = [t[0], 1.3, t[1]];
        }
        const hall = w2(dm[0] - n[0] * 0.7, dm[1] - n[1] * 0.7);   // just outside the door, inside a 1.5 m hall
        return { eye: [inn[0], EYE, inn[1]], look: lk, outside: [out[0], EYE, out[1]], hall: [hall[0], EYE, hall[1]], door: [doorP[0], 1.5, doorP[1]] };
    }, [W, D]); // eslint-disable-line

    const enter = (key, fl = f) => {
        const s = roomShot(fl, key);
        const L = Math.max(W, D);
        setMode('walk');
        setRoom(key);
        const o = s.hall || s.outside;   // a point in the hall in front of the door (never through a wall)
        setCmd({ type: 'enter', n: Date.now(), eye: s.eye, look: s.look, path: [
            [[o[0] + (o[0] - s.eye[0]) * 2.5, EYE + L * 0.3, o[2] + (o[2] - s.eye[2]) * 2.5], s.door || s.look, 0.55],
            [o, s.door || s.look, 0.45],
            [s.eye, s.look, 0.55],
        ] });
    };
    const jump = (key, lvl = level) => {
        const fl = plan.floors[lvl];
        setFade(true);
        setTimeout(() => {
            if (lvl !== level) setLevel(lvl);
            const s = roomShot(fl, key);
            setRoom(key);
            setCmd({ type: 'jump', n: Date.now(), eye: s.eye, look: s.look, done: () => setTimeout(() => setFade(false), 120) });
        }, 260);
    };
    /** Walking mode: leave the current room through its door, go along the hall, open the next door and step in. */
    const walkTo = (key) => {
        if (key === room) return;
        const from = room && f.rooms.find((r) => r.key === room);
        const s = roomShot(f, key);
        if (!s.door) return jump(key);
        const hubOf = (pt) => roomAt(f, pt[0] + W / 2, pt[2] + D / 2)?.key;
        const hub = hubOf(s.hall);
        const path = [];
        if (from && from.key === hub) { /* target door opens straight off this room */ }
        else if (from && from.type !== 'corridor') {
            const a0 = roomShot(f, from.key);
            if (!a0.door || hubOf(a0.hall) !== hub) return jump(key);   // not on the same hall → quick cut
        } else if (from && from.key !== hub) return jump(key);
        if (from && from.key !== hub && from.type !== 'corridor') {
            const a = roomShot(f, from.key);
            if (!a.door) return jump(key);
            path.push([[a.eye[0], EYE, a.eye[2]], [a.door[0], EYE, a.door[2]], 0.45], [a.hall, s.hall, 0.5]);
        }
        path.push([s.hall, s.door, 0.55], [s.eye, s.look, 0.6]);
        setRoom(key);
        setCmd({ type: "enter", n: Date.now(), eye: s.eye, look: s.look, path });
    };
    const goRoom = (key) => (mode === 'doll' ? enter(key) : walkTo(key));
    const explore = () => enter(f.rooms.find((r) => r.type === 'corridor').key);
    const backToDoll = () => { setMode('doll'); setRoom(null); setCmd({ type: 'doll', n: Date.now() }); };
    const changeFloor = (d) => {
        const n = Math.max(0, Math.min(plan.floors.length - 1, level + d));
        if (n === level) return;
        if (mode === 'walk') jump(plan.floors[n].rooms.find((r) => r.type === 'corridor').key, n); else setLevel(n);
    };
    const step = (pt) => {
        const [lx, lz] = [pt.x + W / 2, pt.z + D / 2];
        if (walkable(f, lx, lz, 0.3)) setCmd({ type: 'step', n: Date.now(), x: pt.x, z: pt.z });
    };
    const hold = (k) => ({ onPointerDown: (e) => { e.preventDefault(); keys.current[k] = true; }, onPointerUp: () => { keys.current[k] = false; }, onPointerLeave: () => { keys.current[k] = false; } });
    const cur = f.rooms.find((r) => r.key === room);
    const covered = Math.round(plan.width * plan.depth * plan.floors.length);

    return createPortal(
        <div ref={wrap} className="fixed inset-0 z-[60] select-none" style={{ background: pal.bg }}>
            <Canvas shadows dpr={[1, 1.75]} camera={{ fov: mode === 'walk' ? 62 : 38, position: [30, 30, -30], near: 0.05, far: 400 }}
                gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }} onPointerMissed={() => setHover(null)}>
                <color attach="background" args={[pal.bg]} />
                <fog attach="fog" args={[pal.bg, 45, 120]} />
                <hemisphereLight args={['#fff8ee', '#b8a990', mode === 'walk' ? 0.85 : 1.0]} />
                <directionalLight position={[W * 0.8, 18, -D * 0.6]} intensity={mode === 'walk' ? 1.6 : 2.1} color="#fff1dc" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
                    shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-far={80} />
                <Environment resolution={64} frames={1}>
                    <Lightformer intensity={1.4} position={[0, 6, -8]} scale={[12, 4, 1]} color="#fff4e6" />
                    <Lightformer intensity={0.8} position={[8, 3, 4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} color="#ffe2c2" />
                    <Lightformer intensity={0.6} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
                </Environment>
                <Suspense fallback={null}>
                    <Plot plan={plan} pal={pal} tex={tex} level={level} />
                    <Floor key={level + styleKey} plan={plan} f={f} pal={pal} tex={tex} doll={mode === 'doll'} onRoom={goRoom} onFloorClick={step} highlight={mode === 'doll' ? hover : null} />
                    <LabelProjector points={f.rooms.map((rm) => { const [x, z] = w2(rm.cx, rm.cz); return [rm.key, x, 0.4, z]; })} refs={labelRefs} active={mode === 'doll'} />
                </Suspense>
                <Fov mode={mode} />
                <Rig plan={plan} f={f} mode={mode} cmd={cmd} setRoom={setRoom} keys={keys} ctrlRef={ctrl} />
            </Canvas>

            {/* room labels (projected from 3D every frame — plain DOM, no portals) */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {mode === 'doll' && f.rooms.map((rm) => (
                    <button key={level + rm.key} ref={(el) => { labelRefs.current[rm.key] = el; }} onClick={() => goRoom(rm.key)} onMouseEnter={() => setHover(rm.key)} onMouseLeave={() => setHover(null)} style={{ transform: 'translate(-9999px,0)' }}
                        className="pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-stone-800 shadow-md backdrop-blur transition-[background,scale] hover:scale-105 hover:bg-white">
                        {rm.name} <span className="font-normal text-stone-500">{Math.round(rm.area)} m²</span>
                    </button>
                ))}
            </div>

            {/* fade between rooms / floors */}
            <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`} />

            {/* top bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
                <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/85 px-3 py-2 text-stone-800 shadow-lg backdrop-blur">
                    <button onClick={onClose} className="grid size-9 place-items-center rounded-xl bg-stone-900 text-white" title="Back to map"><X size={17} /></button>
                    <div>
                        <div className="text-sm font-bold leading-tight">{UNIT} {house.label} <span className="font-normal text-stone-500">· {plan.kind}</span></div>
                        <div className="text-[11px] text-stone-500">{house.owner || 'Owner not set'} · {plan.floors.length} floor{plan.floors.length > 1 ? 's' : ''} · ~{covered} m² covered · plot {Math.round(plan.plotW)}×{Math.round(plan.plotD)} m</div>
                    </div>
                </div>
                <div className="pointer-events-auto flex items-center gap-2">
                    <div className="flex rounded-2xl bg-white/85 p-1 text-xs font-semibold text-stone-700 shadow-lg backdrop-blur">
                        <button onClick={backToDoll} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 ${mode === 'doll' ? 'bg-stone-900 text-white' : ''}`}><Box size={14} />Dollhouse</button>
                        <button onClick={() => (mode === 'walk' ? null : explore())} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 ${mode === 'walk' ? 'bg-stone-900 text-white' : ''}`}><Footprints size={14} />Walk inside</button>
                    </div>
                    <div className="hidden rounded-2xl bg-white/85 p-1 text-xs font-semibold text-stone-700 shadow-lg backdrop-blur sm:flex">
                        {Object.entries(STYLES).map(([k, s]) => <button key={k} onClick={() => setStyleKey(k)} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 ${styleKey === k ? 'bg-stone-900 text-white' : ''}`}><span className="size-3 rounded-full border border-white/50" style={{ background: s.accent }} />{s.name}</button>)}
                    </div>
                    <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())} className="grid size-10 place-items-center rounded-2xl bg-white/85 text-stone-700 shadow-lg backdrop-blur"><Maximize2 size={16} /></button>
                </div>
            </div>

            {mySignals.length > 0 && (
                <div className="absolute left-3 top-36 z-10 max-w-xs space-y-1.5 sm:left-4 xl:top-24">
                    {mySignals.slice(0, 3).map((s) => (
                        <div key={s.key} className={`rounded-xl px-3 py-2 text-xs font-semibold shadow-lg ${s.type === 'sos' || s.type === 'emergency_entry' ? 'animate-pulse bg-red-600 text-white' : 'bg-white/90 text-stone-800'}`}>
                            {SIGNAL_META[s.type]?.icon} {s.title}
                            {(s.type === 'sos' || s.type === 'emergency_entry') && onRoute && <button className="ml-2 rounded-lg bg-white/25 px-2 py-0.5" onClick={onRoute}>Route from gate</button>}
                        </div>
                    ))}
                </div>
            )}

            {/* room list */}
            <div className={`absolute bottom-40 right-3 top-48 z-10 w-60 transition sm:bottom-24 sm:right-4 sm:top-36 xl:top-24 ${panel ? '' : 'pointer-events-none translate-x-[110%] opacity-0'}`}>
                <div className="max-h-full overflow-y-auto rounded-2xl bg-white/85 p-2 text-stone-800 shadow-lg backdrop-blur">
                    <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500"><span>{f.name}</span><span>{Math.round(f.rooms.reduce((a, r) => a + r.area, 0))} m²</span></div>
                    {f.rooms.map((rm) => (
                        <button key={rm.key} onClick={() => { goRoom(rm.key); if (window.innerWidth < 640) setPanel(false); }} onMouseEnter={() => setHover(rm.key)} onMouseLeave={() => setHover(null)}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-stone-900/5 ${room === rm.key ? 'bg-stone-900 text-white hover:bg-stone-900' : ''}`}>
                            <span className="font-medium">{rm.name}</span><span className={`text-xs ${room === rm.key ? 'text-white/70' : 'text-stone-500'}`}>{(rm.x1 - rm.x0).toFixed(1)}×{(rm.z1 - rm.z0).toFixed(1)} m</span>
                        </button>
                    ))}
                    <p className="flex gap-1.5 px-2 pb-1 pt-2 text-[10px] leading-snug text-stone-500"><Info size={12} className="mt-px shrink-0" />Representative layout generated from the plot size, not the owner’s actual interior.</p>
                </div>
            </div>
            <button onClick={() => setPanel(!panel)} className={`absolute right-3 top-36 z-20 flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold shadow-lg backdrop-blur sm:hidden ${panel ? 'bg-stone-900 text-white' : 'bg-white/85 text-stone-700'}`}><Layers size={15} />Rooms</button>

            {/* floor switcher / walk controls */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
                {mode === 'walk' && cur && <div className="rounded-full bg-black/55 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">{cur.name} · {f.name}</div>}
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white/90 p-1.5 text-stone-800 shadow-xl backdrop-blur">
                    <button disabled={level === 0} onClick={() => changeFloor(-1)} className="grid size-10 place-items-center rounded-xl hover:bg-stone-900/5 disabled:opacity-30"><ChevronLeft size={18} /></button>
                    <div className="min-w-32 text-center"><div className="text-sm font-bold">{f.name}</div><div className="text-[10px] text-stone-500">{level + 1} / {plan.floors.length}</div></div>
                    <button disabled={level === plan.floors.length - 1} onClick={() => changeFloor(1)} className="grid size-10 place-items-center rounded-xl hover:bg-stone-900/5 disabled:opacity-30"><ChevronRight size={18} /></button>
                    {mode === 'doll'
                        ? <button onClick={explore} className="ml-1 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Explore inside</button>
                        : <button onClick={backToDoll} className="ml-1 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Exit to dollhouse</button>}
                </div>
                {mode === 'walk' && (
                    <>
                        <div className="pointer-events-auto grid grid-cols-3 gap-1 sm:hidden">
                            <span /><button {...hold('ArrowUp')} className="grid size-11 place-items-center rounded-xl bg-white/85 shadow"><ArrowUp size={18} /></button><span />
                            <button {...hold('ArrowLeft')} className="grid size-11 place-items-center rounded-xl bg-white/85 shadow"><ArrowLeft size={18} /></button>
                            <button {...hold('ArrowDown')} className="grid size-11 place-items-center rounded-xl bg-white/85 shadow"><ArrowDown size={18} /></button>
                            <button {...hold('ArrowRight')} className="grid size-11 place-items-center rounded-xl bg-white/85 shadow"><ArrowRight size={18} /></button>
                        </div>
                        <div className="hidden rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/90 backdrop-blur sm:block">Drag to look around · W A S D / arrow keys to walk · click the floor to step there · Esc to exit</div>
                    </>
                )}
                {mode === 'doll' && <div className="hidden rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/90 backdrop-blur sm:block">Drag to rotate · scroll to zoom · click a room to walk into it</div>}
            </div>
        </div>,
        document.body,
    );
}
