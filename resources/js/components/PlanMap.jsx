import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Maximize } from 'lucide-react';
import { corners, centroid, gatesOf, signalsByHouse, SIGNAL_META } from '../lib/siteplan';

const ZONE = { park: '#6fae63', mosque: '#c56bd1', commercial: '#d0574a', amenity: '#e6d27a', office: '#e8cf55', outside: '#c9c3a6' };

/**
 * 2D live site plan (SVG). Shows every plot, request pins per house, emergency pulses and a route.
 * Pan by dragging, zoom with the wheel / buttons. Light-weight — works on any phone.
 */
export default function PlanMap({ site, houses, signals = [], selectedId, onSelect, route, flash = [], focus, className = '', height = 420, showNumbers = 'auto', compact, markers = [], onPick }) {
    const ref = useRef();
    const xs = site.boundary.map((p) => p[0]), ys = site.boundary.map((p) => p[1]);
    const full = useMemo(() => { const pad = 18; return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2]; }, [site]); // eslint-disable-line
    const [vb, setVb] = useState(full);
    const [hover, setHover] = useState(null);
    const drag = useRef(null);
    const zoom = full[2] / vb[2];

    const placed = useMemo(() => houses.filter((h) => h.mx != null), [houses]);
    const polys = useMemo(() => Object.fromEntries(placed.map((h) => [h.id, corners(h)])), [placed]);
    const groups = useMemo(() => signalsByHouse(signals), [signals]);
    const byId = useMemo(() => Object.fromEntries(placed.map((h) => [h.id, h])), [placed]);
    const flashSet = useMemo(() => new Set(flash), [flash]);

    // fly to a house
    useEffect(() => {
        const h = focus && byId[focus];
        if (!h) return;
        const w = Math.min(full[2], 260), hgt = (w * full[3]) / full[2];
        animate([h.mx - w / 2, h.my - hgt / 2, w, hgt]);
    }, [focus]); // eslint-disable-line

    const anim = useRef();
    function animate(to) {
        cancelAnimationFrame(anim.current);
        const from = vb, t0 = performance.now();
        const step = (t) => {
            const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3);
            setVb(from.map((v, i) => v + (to[i] - v) * e));
            if (k < 1) anim.current = requestAnimationFrame(step);
        };
        anim.current = requestAnimationFrame(step);
    }
    const zoomAt = (f, cx, cy) => setVb(([x, y, w, h]) => {
        const nw = Math.min(full[2] * 1.2, Math.max(full[2] / 14, w / f)), nh = (nw * h) / w;
        const px = cx ?? x + w / 2, py = cy ?? y + h / 2;
        return [px - ((px - x) * nw) / w, py - ((py - y) * nh) / h, nw, nh];
    });
    const toPlan = (e) => {
        const r = ref.current.getBoundingClientRect();
        return [vb[0] + ((e.clientX - r.left) / r.width) * vb[2], vb[1] + ((e.clientY - r.top) / r.height) * vb[3]];
    };
    useEffect(() => {
        const el = ref.current;
        const wheel = (e) => { e.preventDefault(); const [px, py] = toPlan(e); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, px, py); };
        el.addEventListener('wheel', wheel, { passive: false });
        return () => el.removeEventListener('wheel', wheel);
    });

    const numbers = showNumbers === true || (showNumbers === 'auto' && zoom > 2.2);
    const sw = 1 / Math.sqrt(zoom); // keep strokes / labels readable when zoomed
    const fill = (h) => {
        const g = groups.find((x) => x.house_id === h.id);
        if (g) return SIGNAL_META[g.top.type]?.color || '#f59e0b';
        if (h.mine) return '#f5a524';
        return h.block === 'N' ? 'var(--plan-plot-n)' : 'var(--plan-plot)';
    };

    return (
        <div className={`relative select-none overflow-hidden rounded-2xl bg-[var(--plan-bg)] ${className}`} style={{ height }}>
            <svg ref={ref} viewBox={vb.join(' ')} className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => {
                    if (!drag.current) return;
                    const r = ref.current.getBoundingClientRect(), d = drag.current;
                    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
                    setVb([d.vb[0] - ((e.clientX - d.x) / r.width) * d.vb[2], d.vb[1] - ((e.clientY - d.y) / r.height) * d.vb[3], d.vb[2], d.vb[3]]);
                }}
                onPointerUp={(e) => { if (onPick && drag.current && !drag.current.moved) { const [px, py] = toPlan(e); onPick(Math.round(px), Math.round(py)); } setTimeout(() => { drag.current = null; }, 0); }}>
                <defs>
                    <filter id="pm-glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                {(site.zones || []).filter((z) => z.type === 'outside').map((z, i) => <polygon key={'o' + i} points={z.pts.join(' ')} fill={z.tone === 'graveyard' ? 'var(--plan-grave)' : 'var(--plan-out)'} />)}
                {(site.roads || []).filter((r) => r.outside).map((r) => <polyline key={r.name} points={r.pts.join(' ')} fill="none" stroke="var(--plan-road)" strokeWidth={r.width} strokeLinecap="round" />)}
                <polygon points={site.boundary.join(' ')} fill="var(--plan-ground)" stroke="#1f8fe0" strokeWidth={2.4 * sw} strokeLinejoin="round" />
                {(site.roads || []).filter((r) => !r.outside).map((r) => <polyline key={r.name} points={r.pts.join(' ')} fill="none" stroke="var(--plan-road)" strokeWidth={r.width * 0.7} strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />)}
                {(site.zones || []).filter((z) => z.type !== 'outside').map((z, i) => <polygon key={'z' + i} points={z.pts.join(' ')} fill={ZONE[z.type] || '#bbb'} stroke="rgba(0,0,0,.25)" strokeWidth={0.6 * sw} />)}
                {placed.map((h) => (
                    <polygon key={h.id} points={polys[h.id].join(' ')} fill={fill(h)} stroke={h.id === selectedId ? '#f5a524' : 'rgba(40,30,50,.45)'} strokeWidth={(h.id === selectedId ? 2.4 : 0.6) * sw}
                        onPointerEnter={() => setHover(h)} onPointerLeave={() => setHover(null)}
                        onClick={() => { if (!drag.current?.moved) onSelect?.(h); }} style={{ cursor: 'pointer' }} />
                ))}
                {numbers && placed.map((h) => (
                    <text key={'n' + h.id} x={h.mx} y={h.my} fontSize={Math.min(h.mh * 0.62, 7.5)} textAnchor="middle" dominantBaseline="central" fill="rgba(30,20,40,.8)" fontWeight="700"
                        transform={`rotate(${Math.abs(h.ma) > 45 && Math.abs(h.ma) < 135 ? h.ma - 90 : 0} ${h.mx} ${h.my})`} pointerEvents="none">{h.house_no}</text>
                ))}
                {zoom > 1.4 && (site.streets || []).map((s) => (
                    <text key={s.text} x={s.x} y={s.y} fontSize={6.5 * sw} textAnchor="middle" dominantBaseline="central" fill="var(--plan-label)" fontWeight="700" letterSpacing="0.6"
                        transform={`rotate(${s.ang > 45 ? s.ang - 90 : s.ang} ${s.x} ${s.y})`} pointerEvents="none">{s.text.toUpperCase()}</text>
                ))}
                {!compact && (site.zones || []).filter((z) => z.type !== 'outside' && z.label).map((z, i) => { const [cx, cy] = centroid(z.pts); return <text key={'zl' + i} x={cx} y={cy} fontSize={8 * sw} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight="800" pointerEvents="none" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.35)" strokeWidth={2 * sw}>{z.label.toUpperCase()}</text>; })}

                {route && (
                    <g pointerEvents="none">
                        <polyline points={route.path.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth={7 * sw} strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
                        <polyline points={route.path.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth={3 * sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${8 * sw} ${6 * sw}`} className="route-dash" />
                    </g>
                )}
                {gatesOf(site).map((g) => (
                    <g key={g.label} transform={`translate(${g.x} ${g.y})`} pointerEvents="none">
                        <circle r={7 * sw} fill="#2737a3" stroke="#fff" strokeWidth={1.5 * sw} />
                        <text y={0.5} fontSize={7 * sw} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight="800">G</text>
                        {!compact && <text y={14 * sw} fontSize={7 * sw} textAnchor="middle" fill="var(--plan-label)" fontWeight="700">{g.label.toUpperCase()}</text>}
                    </g>
                ))}

                {markers.map((m) => (
                    <g key={m.key} transform={`translate(${m.x} ${m.y})`} style={{ cursor: m.onClick ? 'pointer' : 'default' }} onClick={() => { if (!drag.current?.moved) m.onClick?.(); }}>
                        {m.pulse && <circle r={11 * sw} fill="none" stroke={m.color} strokeWidth={2.4 * sw} className="pin-pulse" />}
                        <rect x={-10 * sw} y={-10 * sw} width={20 * sw} height={20 * sw} rx={5 * sw} fill={m.color || '#334155'} stroke="#fff" strokeWidth={1.6 * sw} />
                        <text fontSize={12 * sw} textAnchor="middle" dominantBaseline="central">{m.icon}</text>
                        {m.label && (zoom > 1.6 || m.always) && <text y={18 * sw} fontSize={8 * sw} textAnchor="middle" fill="var(--plan-label)" fontWeight="700" style={{ paintOrder: 'stroke' }} stroke="var(--plan-bg)" strokeWidth={2 * sw}>{m.label}</text>}
                        <title>{m.title || m.label}</title>
                    </g>
                ))}
                {groups.map(({ house_id, list, top }) => {
                    const h = byId[house_id];
                    if (!h) return null;
                    const m = SIGNAL_META[top.type] || {}, r = (top.type === 'sos' ? 9 : 7) * sw, hot = top.type === 'sos' || flashSet.has(house_id);
                    return (
                        <g key={house_id} transform={`translate(${h.mx} ${h.my})`} style={{ cursor: 'pointer' }} onClick={() => { if (!drag.current?.moved) onSelect?.(h); }}>
                            {hot && <circle r={r} fill="none" stroke={m.color} strokeWidth={2 * sw} className="pin-pulse" />}
                            {hot && <circle r={r} fill="none" stroke={m.color} strokeWidth={2 * sw} className="pin-pulse" style={{ animationDelay: '.6s' }} />}
                            <circle r={r} fill={m.color} stroke="#fff" strokeWidth={1.6 * sw} filter={top.type === 'sos' ? 'url(#pm-glow)' : undefined} />
                            <text fontSize={r * 1.05} textAnchor="middle" dominantBaseline="central">{m.icon}</text>
                            {list.length > 1 && (<><circle cx={r * 0.9} cy={-r * 0.9} r={r * 0.55} fill="#111" stroke="#fff" strokeWidth={sw} /><text x={r * 0.9} y={-r * 0.9} fontSize={r * 0.7} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight="800">{list.length}</text></>)}
                        </g>
                    );
                })}
            </svg>

            {hover && (
                <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-xl bg-night/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
                    <div className="font-bold">Plot {hover.label}{hover.owner ? ' · ' + hover.owner : ''}</div>
                    <div className="text-white/60">{hover.street}</div>
                    {groups.find((g) => g.house_id === hover.id)?.list.map((s) => <div key={s.key} className="mt-0.5">{SIGNAL_META[s.type]?.icon} {s.title}</div>)}
                </div>
            )}
            <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl bg-surface/90 shadow-sm backdrop-blur">
                <button className="grid size-8 place-items-center hover:bg-ink/5" onClick={() => zoomAt(1.4)} title="Zoom in"><Plus size={15} /></button>
                <button className="grid size-8 place-items-center hover:bg-ink/5" onClick={() => zoomAt(1 / 1.4)} title="Zoom out"><Minus size={15} /></button>
                <button className="grid size-8 place-items-center hover:bg-ink/5" onClick={() => animate(full)} title="Whole community"><Maximize size={14} /></button>
            </div>
        </div>
    );
}
