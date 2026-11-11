import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BOX, CROWN, CYL, rng } from './RealHouses';

const S = 0.1;
function inPoly([x, y], pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }

/**
 * City around the society (neighbouring blocks as low-detail buildings), graveyard with tombstones,
 * trees in parks / along main roads — all instanced.
 */
export default function Surroundings({ site, to, night }) {
    const data = useMemo(() => {
        const b = [], tomb = [], tree = [], tank = [];
        const o = new THREE.Object3D();
        const add = (arr, x, y, z, sx, sy, sz, ry, color) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.set(sx, sy, sz); o.updateMatrix(); arr.push([o.matrix.clone(), color]); };
        const city = ['#d9cbb4', '#cfc2ab', '#e3d8c4', '#bfb39d', '#d6cdbd', '#c8b89c', '#e6ddd0', '#b9ab95'];
        site.zones.forEach((z, zi) => {
            const xs = z.pts.map((p) => p[0]), ys = z.pts.map((p) => p[1]);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            const r = rng(zi * 101 + 5);
            if (z.type === 'outside' && z.tone !== 'graveyard') {
                // a grid of plots, slightly jittered → reads as a dense neighbourhood
                const step = 15;
                for (let gx = x0 + step / 2; gx < x1; gx += step) for (let gy = y0 + step / 2; gy < y1; gy += step) {
                    if (r() < 0.12 || !inPoly([gx, gy], z.pts)) continue;
                    const [x, zz] = to(gx + (r() - 0.5) * 4, gy + (r() - 0.5) * 4);
                    const fl = 1 + Math.floor(r() * 3) + (r() < 0.08 ? 3 : 0);
                    const h = fl * 0.42, bw = step * S * (0.55 + r() * 0.25), bd = step * S * (0.6 + r() * 0.25), ry = (r() - 0.5) * 0.12;
                    add(b, x, h / 2, zz, bw, h, bd, ry, city[Math.floor(r() * city.length)]);
                    add(tank, x + bw * 0.25, h + 0.09, zz - bd * 0.2, 0.15, 0.18, 0.15, 0, r() < 0.75 ? '#1d1f22' : '#2e5a8a');
                    if (r() < 0.5) add(tree, x + step * S * 0.45, 0.4, zz + step * S * 0.4, 0.5, 0.5, 0.5, 0, '#4d7f3f');
                }
            } else if (z.tone === 'graveyard') {
                for (let i = 0; i < 1400; i++) {
                    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
                    if (!inPoly(p, z.pts)) continue;
                    const [x, zz] = to(...p);
                    if (r() < 0.06) add(tree, x, 0.45, zz, 0.6 + r() * 0.4, 0.6 + r() * 0.3, 0.6 + r() * 0.4, 0, r() < 0.5 ? '#5c7a45' : '#6f8a4f');
                    else add(tomb, x, 0.04, zz, 0.08, 0.06 + r() * 0.05, 0.18, 0.2, r() < 0.7 ? '#e8e4dc' : '#9fa3a6');
                }
            }
        });
        // trees along the main roads (in the median & verges)
        (site.roads || []).filter((rd) => rd.main).forEach((rd, ri) => {
            const r = rng(ri + 77);
            rd.pts.slice(1).forEach((pt, i) => {
                const [ax, az] = to(...rd.pts[i]), [bx, bz] = to(...pt);
                const len = Math.hypot(bx - ax, bz - az);
                for (let t = 1.2; t < len; t += 2.4) {
                    const k = t / len;
                    add(tree, ax + (bx - ax) * k, 0.55, az + (bz - az) * k, 0.55 + r() * 0.25, 0.7 + r() * 0.3, 0.55 + r() * 0.25, 0, ['#3f7d3a', '#4a8a3f', '#356e33'][Math.floor(r() * 3)]);
                }
            });
        });
        return { b, tomb, tree, tank };
    }, [site, to]);

    const bRef = useRef(), tRef = useRef(), trRef = useRef(), trunkRef = useRef(), tankRef = useRef();
    useLayoutEffect(() => {
        const c = new THREE.Color();
        const fill = (ref, arr, colorOverride) => {
            const m = ref.current;
            if (!m || !arr.length) return;
            arr.forEach(([mat, col], i) => { m.setMatrixAt(i, mat); m.setColorAt(i, c.set(colorOverride ? colorOverride(col) : col)); });
            m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
        };
        fill(bRef, data.b, (col) => (night ? new THREE.Color(col).multiplyScalar(0.55).getStyle() : col));
        fill(tRef, data.tomb);
        fill(tankRef, data.tank);
        fill(trRef, data.tree);
        // trunks under each tree
        const m = trunkRef.current, o = new THREE.Object3D(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        data.tree.forEach(([mat], i) => { mat.decompose(p, q, s); o.position.set(p.x, p.y * 0.45, p.z); o.scale.set(0.05, p.y * 0.9, 0.05); o.rotation.set(0, 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    }, [data, night]);

    return (
        <group>
            <instancedMesh ref={bRef} args={[BOX, null, Math.max(1, data.b.length)]} castShadow receiveShadow frustumCulled={false}><meshStandardMaterial roughness={0.9} /></instancedMesh>
            <instancedMesh ref={tankRef} args={[CYL, null, Math.max(1, data.tank.length)]} castShadow frustumCulled={false}><meshStandardMaterial roughness={0.5} /></instancedMesh>
            <instancedMesh ref={tRef} args={[BOX, null, Math.max(1, data.tomb.length)]} frustumCulled={false}><meshStandardMaterial roughness={0.8} /></instancedMesh>
            <instancedMesh ref={trRef} args={[CROWN, null, Math.max(1, data.tree.length)]} castShadow frustumCulled={false}><meshStandardMaterial roughness={0.9} flatShading /></instancedMesh>
            <instancedMesh ref={trunkRef} args={[BOX, null, Math.max(1, data.tree.length)]} frustumCulled={false}><meshStandardMaterial color="#6b4f3a" /></instancedMesh>
        </group>
    );
}
