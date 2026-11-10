/**
 * Site-plan geometry shared by the 3D map, the 2D plan, the dashboard and the emergency screen.
 * Everything is in plan pixels (source map, y down). Scale: site.scale_m_per_px metres per pixel.
 */

export const corners = (h) => {
    const a = (h.ma * Math.PI) / 180, u = [Math.cos(a), Math.sin(a)], v = [-Math.sin(a), Math.cos(a)];
    const w = h.mw / 2, d = h.mh / 2;
    return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([p, q]) => [h.mx + u[0] * p + v[0] * q, h.my + u[1] * p + v[1] * q]);
};

export function inPoly(x, y, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
}
export const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
export const gatesOf = (site) => site.gates || (site.gate ? [{ ...site.gate, label: 'Main Gate' }] : []);
export const metres = (site, px) => Math.round(px * (site.scale_m_per_px || 0.87));

/** Plan pixel → GPS using two reference points (north-up map). */
export function toLatLng(site, x, y) {
    const g = site?.geo;
    if (!g?.p1 || !g?.p2 || g.p1.x === g.p2.x || g.p1.y === g.p2.y) return null;
    const lng = g.p1.lng + ((x - g.p1.x) * (g.p2.lng - g.p1.lng)) / (g.p2.x - g.p1.x);
    const lat = g.p1.lat + ((y - g.p1.y) * (g.p2.lat - g.p1.lat)) / (g.p2.y - g.p1.y);
    return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}
export const mapsLink = (ll) => (ll ? `https://www.google.com/maps/dir/?api=1&destination=${ll.lat},${ll.lng}&travelmode=driving` : null);

/** Nearest named landmark (park, mosque, shopping…) — "near Mosque" in emergency directions. */
export function nearestLandmark(site, x, y) {
    let best = null;
    (site.zones || []).filter((z) => z.type !== 'outside' && z.label).forEach((z) => {
        const [cx, cy] = centroid(z.pts);
        const d = Math.hypot(cx - x, cy - y);
        if (!best || d < best.d) best = { name: z.label, d };
    });
    return best;
}

/* ---------------- walkable grid + A* routing (gate → house) ---------------- */
const CELL = 3;
let cache = null;

function buildGrid(site, houses) {
    const key = site.name + ':' + houses.length;
    if (cache?.key === key) return cache;
    const xs = site.boundary.map((p) => p[0]), ys = site.boundary.map((p) => p[1]);
    const x0 = Math.min(...xs) - 6, y0 = Math.min(...ys) - 6;
    const W = Math.ceil((Math.max(...xs) - x0 + 12) / CELL), H = Math.ceil((Math.max(...ys) - y0 + 12) / CELL);
    const grid = new Uint8Array(W * H); // 1 = walkable
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inPoly(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL, site.boundary)) grid[j * W + i] = 1;
    const block = (test, bx0, by0, bx1, by1) => {
        for (let j = Math.max(0, Math.floor((by0 - y0) / CELL)); j <= Math.min(H - 1, Math.ceil((by1 - y0) / CELL)); j++)
            for (let i = Math.max(0, Math.floor((bx0 - x0) / CELL)); i <= Math.min(W - 1, Math.ceil((bx1 - x0) / CELL)); i++)
                if (test(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL)) grid[j * W + i] = 0;
    };
    houses.filter((h) => h.mx != null).forEach((h) => {
        const a = (h.ma * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), hw = h.mw / 2 + 1, hd = h.mh / 2 + 1, r = Math.hypot(hw, hd);
        block((x, y) => { const dx = x - h.mx, dy = y - h.my; return Math.abs(dx * c + dy * s) <= hw && Math.abs(-dx * s + dy * c) <= hd; }, h.mx - r, h.my - r, h.mx + r, h.my + r);
    });
    (site.zones || []).filter((z) => z.type !== 'outside').forEach((z) => {
        const zx = z.pts.map((p) => p[0]), zy = z.pts.map((p) => p[1]);
        block((x, y) => inPoly(x, y, z.pts), Math.min(...zx), Math.min(...zy), Math.max(...zx), Math.max(...zy));
    });
    cache = { key, grid, W, H, x0, y0 };
    return cache;
}

function nearestFree(g, x, y) {
    const ci = Math.round((x - g.x0) / CELL - 0.5), cj = Math.round((y - g.y0) / CELL - 0.5);
    for (let r = 0; r < 40; r++)
        for (let dj = -r; dj <= r; dj++)
            for (let di = -r; di <= r; di++) {
                if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                const i = ci + di, j = cj + dj;
                if (i >= 0 && j >= 0 && i < g.W && j < g.H && g.grid[j * g.W + i]) return [i, j];
            }
    return null;
}

function astar(g, s, t) {
    const { W, H, grid } = g, N = W * H;
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // binary heap of [f, idx]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const si = s[1] * W + s[0], ti = t[1] * W + t[0];
    const hfn = (i) => { const dx = Math.abs((i % W) - t[0]), dy = Math.abs(((i / W) | 0) - t[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    gs[si] = 0; push(hfn(si), si);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
        const [, cur] = pop();
        if (cur === ti) break;
        if (closed[cur]) continue;
        closed[cur] = 1;
        const ci = cur % W, cj = (cur / W) | 0;
        for (const [dx, dy, c] of dirs) {
            const ni = ci + dx, nj = cj + dy;
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            const n = nj * W + ni;
            if (!grid[n] || closed[n]) continue;
            if (dx && dy && (!grid[cj * W + ni] || !grid[nj * W + ci])) continue; // no corner cutting
            const ng = gs[cur] + c;
            if (ng < gs[n]) { gs[n] = ng; from[n] = cur; push(ng + hfn(n), n); }
        }
    }
    if (from[ti] === -1 && si !== ti) return null;
    const path = [];
    for (let k = ti; k !== -1; k = from[k]) path.push(k);
    return { cost: gs[ti], cells: path.reverse() };
}

/** Straighten a cell path with line-of-sight checks. */
function smooth(g, cells) {
    const pt = (k) => [k % g.W, (k / g.W) | 0];
    const clear = (a, b) => {
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
        for (let s = 0; s <= n; s++) { const i = Math.round(a[0] + ((b[0] - a[0]) * s) / n), j = Math.round(a[1] + ((b[1] - a[1]) * s) / n); if (!g.grid[j * g.W + i]) return false; }
        return true;
    };
    const out = [pt(cells[0])];
    let anchor = 0;
    for (let k = 2; k < cells.length; k++) if (!clear(pt(cells[anchor]), pt(cells[k]))) { out.push(pt(cells[k - 1])); anchor = k - 1; }
    out.push(pt(cells[cells.length - 1]));
    return out.map(([i, j]) => [g.x0 + (i + 0.5) * CELL, g.y0 + (j + 0.5) * CELL]);
}

/**
 * Shortest route from the nearest gate to a house (or any plan point).
 * Returns { gate, path: [[x,y]...] (plan px), metres, walkMin, driveMin }.
 */
export function routeTo(site, houses, target) {
    if (!site || !target) return null;
    const g = buildGrid(site, houses);
    const tx = target.mx ?? target.x, ty = target.my ?? target.y;
    const t = nearestFree(g, tx, ty);
    if (!t) return null;
    let best = null;
    for (const gate of gatesOf(site)) {
        const s = nearestFree(g, gate.x, gate.y);
        if (!s) continue;
        const r = astar(g, s, t);
        if (r && (!best || r.cost < best.r.cost)) best = { gate, r };
    }
    if (!best) return null;
    const path = [[best.gate.x, best.gate.y], ...smooth(g, best.r.cells), [tx, ty]];
    const px = path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
    const m = metres(site, px);
    return { gate: best.gate, path, metres: m, walkMin: Math.max(1, Math.round(m / 80)), driveMin: Math.max(1, Math.round(m / 300)) };
}

/** Everything a responder needs to find a house. */
export function locateInfo(site, houses, h) {
    if (!site || h?.mx == null) return null;
    const lm = nearestLandmark(site, h.mx, h.my);
    return {
        plot: h.label, street: h.street, series: site.series?.[h.block] || h.block,
        landmark: lm ? `${lm.name} (${metres(site, lm.d)} m)` : null,
        gps: toLatLng(site, h.mx, h.my),
        route: routeTo(site, houses, h),
    };
}

export const SIGNAL_META = {
    sos: { label: 'SOS', color: '#ef4444', icon: '🆘', rank: 0 },
    gate: { label: 'At gate', color: '#f59e0b', icon: '🔔', rank: 1 },
    incident: { label: 'Incident', color: '#dc2626', icon: '🚨', rank: 2 },
    complaint: { label: 'Complaint', color: '#f43f5e', icon: '🛠️', rank: 3 },
    overstay: { label: 'Overstay', color: '#fb923c', icon: '⏳', rank: 4 },
    event_request: { label: 'Event request', color: '#e0a94f', icon: '🎉', rank: 5 },
    event: { label: 'Event today', color: '#c98a2b', icon: '🎪', rank: 6 },
    noc: { label: 'NOC', color: '#8b5cf6', icon: '📄', rank: 7 },
    payment: { label: 'Payment', color: '#0ea5e9', icon: '💳', rank: 8 },
    book: { label: 'Book request', color: '#14b8a6', icon: '📚', rank: 9 },
    emergency_entry: { label: 'Emergency vehicle', color: '#b91c1c', icon: '🚑', rank: 0.5 },
    staff: { label: 'Staff to verify', color: '#64748b', icon: '🧹', rank: 10 },
};

/** Group signals by house: [{house_id, list, top}] — top = most urgent. */
export function signalsByHouse(signals = []) {
    const m = new Map();
    signals.forEach((s) => { if (!m.has(s.house_id)) m.set(s.house_id, []); m.get(s.house_id).push(s); });
    return [...m.entries()].map(([house_id, list]) => {
        list.sort((a, b) => (SIGNAL_META[a.type]?.rank ?? 99) - (SIGNAL_META[b.type]?.rank ?? 99));
        return { house_id, list, top: list[0] };
    });
}
