import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts every number inside a value up from its previous value ("Rs 146,000", "0 / 14", "2h 36m" all work).
 * Text without digits is shown as is.
 */
export function CountUp({ value, duration = 900 }) {
    const text = String(value ?? '');
    const [shown, setShown] = useState(text);
    const prev = useRef(null);
    useEffect(() => {
        const nums = text.match(/\d[\d,]*(\.\d+)?/g);
        if (!nums || reduced()) { setShown(text); prev.current = text; return; }
        const from = (prev.current?.match(/\d[\d,]*(\.\d+)?/g) || []).map((n) => parseFloat(n.replace(/,/g, '')));
        const to = nums.map((n) => parseFloat(n.replace(/,/g, '')));
        if (prev.current === text) return;
        prev.current = text;
        let raf;
        const t0 = performance.now();
        const tick = (t) => {
            const k = Math.min(1, (t - t0) / duration);
            const e = 1 - Math.pow(1 - k, 3);
            let i = 0;
            setShown(text.replace(/\d[\d,]*(\.\d+)?/g, (m) => {
                const a = from[i] ?? 0, b = to[i++];
                const v = a + (b - a) * e;
                const dec = (m.split('.')[1] || '').length;
                const out = dec ? v.toFixed(dec) : Math.round(v).toString();
                return m.includes(',') ? Number(out).toLocaleString('en-PK', { maximumFractionDigits: dec }) : out;
            }));
            if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text, duration]);
    return <span>{shown}</span>;
}

/** Mouse-following light on a card — answers the pointer, nothing moves on its own. */
export const spotlight = {
    onMouseMove: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
};
