import { Link } from 'react-router-dom';

export function Logo({ dark = true }) {
    return (
        <Link to="/" className="flex items-center gap-2.5">
            <span className="relative grid size-9 place-items-center rounded-xl bg-white/[.07] ring-1 ring-white/10"><img src="/icon.svg" alt="" className="size-6 rounded-md" /><span className="lamp-breathe absolute -right-0.5 -top-0.5 size-2 rounded-full bg-sand-400" /></span>
            <span className={`text-[15px] font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>Fera Community Cloud</span>
        </Link>
    );
}

/** Small plan of a society: plots, a road, one lit house — the platform's signature picture. */
export function PlanArt({ className = '' }) {
    const plots = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) {
        if ((r === 2 || r === 3) && c > 2 && c < 6) continue;          // park
        plots.push({ x: 18 + c * 38 + (r % 2) * 4, y: 22 + r * 44 + (r > 2 ? 22 : 0), k: r * 9 + c });
    }
    return (
        <svg viewBox="0 0 380 330" className={className} aria-hidden="true">
            <defs>
                <radialGradient id="glow"><stop offset="0" stopColor="#f5a524" stopOpacity=".55" /><stop offset="1" stopColor="#f5a524" stopOpacity="0" /></radialGradient>
            </defs>
            <rect x="6" y="6" width="368" height="318" rx="22" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.12)" />
            <rect x="6" y="155" width="368" height="18" fill="rgba(255,255,255,.07)" />
            <rect x="130" y="104" width="112" height="100" rx="10" fill="rgba(52,168,108,.28)" />
            {plots.map((p) => (
                <rect key={p.k} x={p.x} y={p.y} width="30" height="34" rx="4" fill={p.k === 41 ? '#f5a524' : p.k % 7 === 0 ? 'rgba(58,85,224,.55)' : 'rgba(255,255,255,.13)'}
                    style={{ animation: `stagger-in .5s ${0.2 + (p.k % 13) * 0.04}s both` }} />
            ))}
            <circle cx="333" cy="234" r="46" fill="url(#glow)" className="lamp-breathe" />
            <g transform="translate(333 214)"><circle r="11" fill="#f5a524" /><text y="4" textAnchor="middle" fontSize="11">🚨</text></g>
            <path d="M28 164 H 300 V 234 H 318" fill="none" stroke="#f5a524" strokeWidth="3" strokeDasharray="7 6" className="route-dash" />
        </svg>
    );
}
