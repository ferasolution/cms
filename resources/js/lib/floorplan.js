/**
 * Generates a believable floor plan for a plot from its size, so every house on the map can be opened
 * in 3D. Units are metres. x runs across the plot width (0 = left), z runs from the front (road, z = 0)
 * to the back. It is a representative layout — not the owner's real interior.
 */

const SCALE = 0.87; // metres per site-plan pixel

function rng(seed) {
    let s = (seed * 9301 + 49297) % 233280 || 1;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const r2 = (v) => Math.round(v * 100) / 100;

export const FLOOR_H = 3.2;   // floor to floor
export const WALL_H = 3.0;
export const EXT_T = 0.23;    // exterior wall thickness
export const INT_T = 0.12;

/**
 * @returns {{ width, depth, front, back, plotW, plotD, floors: [{ level, name, rooms, openings, stairs }], porch, kind }}
 */
export function makePlan(house) {
    const bungalow = house.series === 'N' || (house.mw || 0) * SCALE > 25;
    const long = Math.max(house.mw || 23, house.mh || 12) * SCALE;
    const short = Math.min(house.mw || 23, house.mh || 12) * SCALE;
    const plotD = Math.max(15, Math.min(34, long));
    const plotW = Math.max(8, Math.min(16, short));
    const front = bungalow ? 5.2 : 3.2;
    const back = bungalow ? 1.6 : 0.8;
    const side = bungalow ? 0.8 : 0;
    const W = r2(plotW - side * 2);
    const D = r2(plotD - front - back);
    const rnd = rng(house.id || 1);
    const mirror = rnd() > 0.5;
    const nFloors = Math.max(bungalow ? 2 : 1, Math.min(3, house.floors || 2));

    // column split: main rooms | corridor | service strip
    const a = r2(W * (0.52 + rnd() * 0.06));            // left column width
    const cw = 1.5;                                      // corridor width
    const sx = r2(a + cw);                               // service strip start
    const stairZ = r2(D - Math.min(4.2, D * 0.24));      // stairs + back zone start
    const f1 = r2(D * (0.36 + rnd() * 0.05));
    const f2 = r2(D * (0.68 + rnd() * 0.04));
    const s1 = r2(D * (0.26 + rnd() * 0.04));

    const R = (key, name, type, x0, z0, x1, z1, extra = {}) => ({ key, name, type, x0, z0, x1, z1, ...extra });
    const doorOn = (room, edge, at = 0.5, w = 0.95) => ({ room, edge, at, w, kind: 'door' });

    const ground = {
        level: 0, name: 'Ground Floor',
        rooms: [
            R('drawing', 'Drawing Room', 'drawing', 0, 0, a, f1),
            R('dining', 'Dining', 'dining', 0, f1, a, f2),
            R('guest', bungalow ? 'Guest Bedroom' : 'Bedroom', 'bedroom', 0, f2, a, D),
            R('hall', 'Entrance Hall', 'corridor', a, 0, sx, stairZ),
            R('powder', 'Guest Washroom', 'bath', sx, 0, W, s1),
            R('kitchen', 'Kitchen', 'kitchen', sx, s1, W, stairZ),
            R('stairs', 'Staircase', 'stairs', a, stairZ, W, D),
        ],
        openings: [
            { room: 'hall', edge: 'front', at: 0.5, w: 1.1, kind: 'main' },
            doorOn('drawing', 'right', 0.3, 1.2), { room: 'dining', edge: 'right', at: 0.5, w: 1.6, kind: 'arch' }, { room: 'dining', edge: 'front', at: 0.45, w: 1.8, kind: 'arch' },
            doorOn('guest', 'right', 0.25), doorOn('powder', 'left', 0.7, 0.8), { room: 'kitchen', edge: 'left', at: 0.5, w: 1.4, kind: 'arch' },
            { room: 'stairs', edge: 'front', at: 0.25, w: 1.4, kind: 'open' },
        ],
    };
    const upperRooms = (lvl) => {
        const n = lvl === 1 ? '' : ' ' + (lvl + 1);
        return {
            level: lvl, name: lvl === 1 ? 'First Floor' : 'Second Floor',
            rooms: [
                R('master' + lvl, lvl === 1 ? 'Master Bedroom' : 'Bedroom' + n, 'master', 0, 0, a, f1 + 0.4),
                R('bed2' + lvl, lvl === 1 ? 'Bedroom 2' : 'Bedroom' + n + 'b', 'bedroom', 0, f1 + 0.4, a, f2 + 0.3),
                R('kids' + lvl, lvl === 1 ? "Kids' Room" : 'Study', lvl === 1 ? 'kids' : 'study', 0, f2 + 0.3, a, D),
                R('lobby' + lvl, 'Lobby', 'corridor', a, 0, sx, stairZ),
                R('mbath' + lvl, lvl === 1 ? 'Master Bath' : 'Bathroom', 'bath', sx, 0, W, s1 + 0.3),
                R('lounge' + lvl, lvl === 1 ? 'TV Lounge' : 'Family Lounge', 'lounge', sx, s1 + 0.3, W, stairZ),
                R('stairs' + lvl, 'Staircase', 'stairs', a, stairZ, W, D),
            ],
            openings: [
                doorOn('master' + lvl, 'right', 0.75), doorOn('bed2' + lvl, 'right', 0.25), doorOn('kids' + lvl, 'right', 0.2),
                doorOn('mbath' + lvl, 'left', 0.65, 0.8), { room: 'lounge' + lvl, edge: 'left', at: 0.5, w: 1.8, kind: 'arch' },
                { room: 'stairs' + lvl, edge: 'front', at: 0.25, w: 1.4, kind: 'open' },
            ],
        };
    };
    const floors = [ground];
    for (let l = 1; l < nFloors; l++) floors.push(upperRooms(l));

    // mirror half of the houses so neighbours are not identical
    if (mirror) {
        const flip = { left: 'right', right: 'left' };
        for (const f of floors) {
            f.rooms = f.rooms.map((rm) => ({ ...rm, x0: r2(W - rm.x1), x1: r2(W - rm.x0) }));
            f.openings = f.openings.map((o) => ({ ...o, edge: flip[o.edge] || o.edge, at: o.edge === 'front' || o.edge === 'back' ? 1 - o.at : o.at }));
        }
    }
    for (const f of floors) {
        f.rooms.forEach((rm) => { rm.area = r2((rm.x1 - rm.x0) * (rm.z1 - rm.z0)); rm.cx = (rm.x0 + rm.x1) / 2; rm.cz = (rm.z0 + rm.z1) / 2; });
        f.openings = f.openings.map((o) => resolveOpening(f, o));
        f.windows = makeWindows(f, W, D);
        f.stairs = f.rooms.find((x) => x.type === 'stairs');
    }
    return { kind: bungalow ? 'Bungalow' : 'Town house', width: W, depth: D, front, back, side, plotW, plotD, mirror, floors, area: r2(W * D * nFloors) };
}

/** Converts a room-edge opening into a wall-line opening: { line: 'x'|'z', c, from, to, kind, room }. */
function resolveOpening(f, o) {
    const rm = f.rooms.find((x) => x.key === o.room);
    const horiz = o.edge === 'front' || o.edge === 'back';
    const c = { front: rm.z0, back: rm.z1, left: rm.x0, right: rm.x1 }[o.edge];
    const len = horiz ? rm.x1 - rm.x0 : rm.z1 - rm.z0;
    const start = horiz ? rm.x0 : rm.z0;
    const w = Math.min(o.w, len - 0.3);
    const mid = start + Math.max(w / 2 + 0.15, Math.min(len - w / 2 - 0.15, len * o.at));
    // the side the door leaf swings into = inside the room
    const inward = { front: 1, back: -1, left: 1, right: -1 }[o.edge];
    return { ...o, line: horiz ? 'z' : 'x', c, from: r2(mid - w / 2), to: r2(mid + w / 2), mid: r2(mid), w, inward, height: o.kind === 'door' || o.kind === 'main' ? 2.15 : o.kind === 'arch' ? 2.5 : WALL_H };
}

function makeWindows(f, W, D) {
    const out = [];
    for (const rm of f.rooms) {
        if (['corridor', 'stairs'].includes(rm.type) && f.level === 0) continue;
        const small = rm.type === 'bath' || rm.type === 'kitchen';
        const add = (edge, c, s0, s1) => {
            const len = s1 - s0;
            if (len < 1.6) return;
            const w = Math.min(small ? 0.9 : rm.type === 'drawing' || rm.type === 'master' || rm.type === 'lounge' ? 2.2 : 1.6, len - 0.8);
            const mid = (s0 + s1) / 2;
            out.push({ room: rm.key, edge, line: edge === 'front' || edge === 'back' ? 'z' : 'x', c, from: r2(mid - w / 2), to: r2(mid + w / 2), mid, w, kind: 'window', sill: small ? 1.4 : 0.75, top: 2.3 });
        };
        if (rm.z0 === 0) add('front', 0, rm.x0, rm.x1);
        if (rm.z1 === D) add('back', D, rm.x0, rm.x1);
        if (rm.x0 === 0 && !small) add('left', 0, rm.z0, rm.z1);
        if (rm.x1 === W && !small) add('right', W, rm.z0, rm.z1);
    }
    return out;
}

/**
 * Wall pieces for one floor: merges room edges into continuous wall lines and cuts the openings out.
 * Returns boxes { x, z, len, line, h, y, t, ext, normal } (centre position, along-length, height, base y).
 */
export function wallPieces(plan, f) {
    const { width: W, depth: D } = plan;
    const lines = new Map(); // key line:c → intervals
    const push = (line, c, a, b) => {
        const k = `${line}:${c}`;
        if (!lines.has(k)) lines.set(k, []);
        lines.get(k).push([Math.min(a, b), Math.max(a, b)]);
    };
    for (const rm of f.rooms) {
        push('z', rm.z0, rm.x0, rm.x1); push('z', rm.z1, rm.x0, rm.x1);
        push('x', rm.x0, rm.z0, rm.z1); push('x', rm.x1, rm.z0, rm.z1);
    }
    const holes = [...f.openings, ...f.windows];
    const out = [];
    for (const [k, ivs] of lines) {
        const [line, cs] = k.split(':');
        const c = Number(cs);
        ivs.sort((p, q) => p[0] - q[0]);
        const merged = [];
        for (const iv of ivs) {
            const last = merged[merged.length - 1];
            if (last && iv[0] <= last[1] + 0.01) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]);
        }
        const ext = line === 'z' ? c === 0 || c === D : c === 0 || c === W;
        const t = ext ? EXT_T : INT_T;
        const normal = line === 'z' ? [0, c === 0 ? -1 : 1] : [c === 0 ? -1 : 1, 0];
        const myHoles = holes.filter((h) => h.line === line && Math.abs(h.c - c) < 0.01).sort((p, q) => p.from - q.from);
        for (const [a0, b0] of merged) {
            let cur = a0;
            const seg = (s, e, y, h, kind) => {
                if (e - s < 0.02 || h <= 0.01) return;
                const mid = (s + e) / 2;
                out.push({ line, c, x: line === 'z' ? mid : c, z: line === 'z' ? c : mid, len: e - s + (kind === 'full' ? t : 0), y, h, t, ext, normal, kind });
            };
            for (const h of myHoles) {
                if (h.to <= a0 || h.from >= b0) continue;
                seg(cur, h.from, 0, WALL_H, 'full');
                if (h.kind === 'window') { seg(h.from, h.to, 0, h.sill, 'sill'); seg(h.from, h.to, h.top, WALL_H - h.top, 'lintel'); }
                else if (h.height < WALL_H) seg(h.from, h.to, h.height, WALL_H - h.height, 'lintel');
                cur = h.to;
            }
            seg(cur, b0, 0, WALL_H, 'full');
        }
    }
    return out;
}

/** Local frame for placing furniture against the wall opposite a room's door. */
export function roomFrame(f, rm) {
    const door = f.openings.find((o) => o.room === rm.key) || f.openings.find((o) => (o.line === 'x' ? o.c === rm.x0 || o.c === rm.x1 : o.c === rm.z0 || o.c === rm.z1) && o.mid > (o.line === 'x' ? rm.z0 : rm.x0) && o.mid < (o.line === 'x' ? rm.z1 : rm.x1));
    const edge = door?.edge || 'front';
    const back = { front: 'back', back: 'front', left: 'right', right: 'left' }[edge];
    const n = { back: [0, -1], front: [0, 1], left: [1, 0], right: [-1, 0] }[back];      // into the room
    const base = { back: [rm.cx, rm.z1], front: [rm.cx, rm.z0], left: [rm.x0, rm.cz], right: [rm.x1, rm.cz] }[back];
    const len = back === 'front' || back === 'back' ? rm.x1 - rm.x0 : rm.z1 - rm.z0;     // along the back wall
    const depth = back === 'front' || back === 'back' ? rm.z1 - rm.z0 : rm.x1 - rm.x0;   // away from it
    const t = [-n[1], n[0]];
    const rot = Math.atan2(n[0], n[1]);
    // (u along back wall from its centre, v into the room from the wall) → world x,z
    const at = (u, v) => [base[0] + t[0] * u + n[0] * v, base[1] + t[1] * u + n[1] * v];
    // which side of the back wall the door is on (to keep furniture clear of it)
    const doorU = door ? ((door.line === 'x' ? [door.c, door.mid] : [door.mid, door.c])[0] - base[0]) * t[0] + ((door.line === 'x' ? [door.c, door.mid] : [door.mid, door.c])[1] - base[1]) * t[1] : 0;
    return { at, rot, len, depth, n, t, door, doorU };
}

/** Is a point walkable (inside a room, away from walls, or passing through an opening)? */
export function walkable(f, x, z, pad = 0.28) {
    for (const rm of f.rooms) if (x > rm.x0 + pad && x < rm.x1 - pad && z > rm.z0 + pad && z < rm.z1 - pad) return true;
    for (const o of f.openings) {
        const along = o.line === 'z' ? x : z;
        const across = o.line === 'z' ? z : x;
        if (along > o.from + 0.12 && along < o.to - 0.12 && Math.abs(across - o.c) < pad + 0.2) return true;
    }
    return false;
}

export const roomAt = (f, x, z) => f.rooms.find((rm) => x >= rm.x0 && x <= rm.x1 && z >= rm.z0 && z <= rm.z1);
