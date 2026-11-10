import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, Loader2, Inbox, Paperclip } from 'lucide-react';
import { get, fileUrl, title } from '../lib/api';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
    const [items, setItems] = useState([]);
    const push = useCallback((message, level = 'success', body, action) => {
        const id = Math.random();
        setItems((s) => [...s.slice(-4), { id, message, level, body, action }]);
        setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), level === 'danger' ? 14000 : action ? 8000 : 4500);
    }, []);
    const tone = { success: ['bg-emerald-500', '✓'], danger: ['bg-red-500', '!'], warning: ['bg-amber-500', '!'], info: ['bg-brand-500', 'i'], error: ['bg-red-500', '×'] };
    return (
        <ToastCtx.Provider value={push}>
            {children}
            <div className="fixed right-3 top-3 z-[100] flex w-[min(390px,calc(100vw-1.5rem))] flex-col gap-2">
                {items.map((t) => {
                    const [bg, ic] = tone[t.level] || tone.info;
                    return (
                        <div key={t.id} className="toast-in card flex items-start gap-3 overflow-hidden px-3.5 py-3 shadow-xl">
                            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-black text-white ${bg}`}>{ic}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold leading-snug">{t.message}</div>
                                {t.body && <div className="mt-0.5 text-xs text-ink/60">{t.body}</div>}
                                {t.action && <button className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-700" onClick={() => { t.action.onClick(); setItems((s) => s.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
                            </div>
                            <button className="text-ink/30 hover:text-ink" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}><X size={14} /></button>
                        </div>
                    );
                })}
            </div>
        </ToastCtx.Provider>
    );
}

/* ---------- Data loading ---------- */
export function useList(url, initial = {}) {
    const [params, setParams] = useState({ page: 1, ...initial });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const key = JSON.stringify(params);
    const reload = useCallback(() => {
        if (!url) return;
        setLoading(true);
        get(url, params).then((d) => { setData(d); setError(null); }).catch(setError).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, key]);
    useEffect(() => { reload(); }, [reload]);
    const set = (patch) => setParams((p) => ({ ...p, page: 1, ...patch }));
    return { data, rows: data?.data ?? (Array.isArray(data) ? data : []), loading, error, reload, params, set, setPage: (page) => setParams((p) => ({ ...p, page })) };
}

export function useGet(url, deps = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const reload = useCallback(() => {
        if (!url) return;
        setLoading(true);
        get(url).then(setData).catch(() => {}).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, ...deps]);
    useEffect(() => { reload(); }, [reload]);
    return { data, loading, reload, setData };
}

/* ---------- Layout bits ---------- */
export function PageHeader({ icon: Icon, title: t, subtitle, children }) {
    return (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
                {Icon && <div className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm"><Icon size={22} /></div>}
                <div>
                    <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t}</h1>
                    {subtitle && <p className="text-sm text-ink/55">{subtitle}</p>}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
    );
}

export function Tabs({ tabs, value, onChange }) {
    return (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-ink/[.04] p-1">
            {tabs.filter(Boolean).map((t) => (
                <button key={t.key} onClick={() => onChange(t.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${value === t.key ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink/55 hover:text-black'}`}>
                    {t.icon && <t.icon size={15} />}{t.label}
                    {t.count > 0 && <span className="rounded-full bg-sand-400 px-1.5 text-[11px] text-white">{t.count}</span>}
                </button>
            ))}
        </div>
    );
}

export function Stat({ label, value, sub, icon: Icon, tone = 'brand', onClick }) {
    const tones = { brand: 'bg-brand-50 text-brand-600', sand: 'bg-sand-100 text-sand-500', red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-600', blue: 'bg-sky-50 text-sky-600' };
    return (
        <div onClick={onClick} className={`card p-4 ${onClick ? 'cursor-pointer transition hover:-translate-y-0.5' : ''}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-ink/50">{label}</div>
                {Icon && <div className={`grid size-8 place-items-center rounded-xl ${tones[tone]}`}><Icon size={16} /></div>}
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
            {sub && <div className="mt-0.5 text-xs text-ink/50">{sub}</div>}
        </div>
    );
}

const BADGE = {
    open: 'bg-red-50 text-red-700', pending: 'bg-amber-50 text-amber-700', requested: 'bg-amber-50 text-amber-700', submitted: 'bg-amber-50 text-amber-700',
    assigned: 'bg-sky-50 text-sky-700', in_progress: 'bg-sky-50 text-sky-700', under_review: 'bg-sky-50 text-sky-700', issued: 'bg-sky-50 text-sky-700',
    documents_required: 'bg-orange-50 text-orange-700', approved: 'bg-emerald-50 text-emerald-700', resolved: 'bg-emerald-50 text-emerald-700',
    completed: 'bg-emerald-50 text-emerald-700', returned: 'bg-emerald-50 text-emerald-700', paid: 'bg-emerald-50 text-emerald-700', inside: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-ink/5 text-ink/60', closed: 'bg-ink/5 text-ink/60', cancelled: 'bg-ink/5 text-ink/60', exited: 'bg-ink/5 text-ink/60',
    urgent: 'bg-red-600 text-white', high: 'bg-red-50 text-red-700', normal: 'bg-ink/5 text-ink/60', low: 'bg-ink/5 text-ink/45',
    revenue: 'bg-emerald-50 text-emerald-700', expense: 'bg-red-50 text-red-700', salary: 'bg-violet-50 text-violet-700', overdue: 'bg-red-50 text-red-700', live: 'bg-emerald-600 text-white',
};
export function Badge({ value, children }) {
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${BADGE[value] || 'bg-ink/5 text-ink/60'}`}>{children ?? title(value)}</span>;
}

export function Spinner({ className = '' }) {
    return <Loader2 className={`animate-spin text-brand-500 ${className}`} size={20} />;
}

export function Empty({ text = 'Nothing here yet.' }) {
    return <div className="flex flex-col items-center gap-2 py-12 text-sm text-ink/40"><Inbox size={28} />{text}</div>;
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
    const [v, setV] = useState(value || '');
    const t = useRef();
    useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => v !== (value || '') && onChange(v), 350); return () => clearTimeout(t.current); }, [v]); // eslint-disable-line
    return (
        <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input className="input w-56 pl-9" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
        </label>
    );
}

export function Select({ value, onChange, options, placeholder, className = '' }) {
    return (
        <select className={`input w-auto ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{title(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
    );
}

/* ---------- Table ---------- */
export function Table({ list, columns, empty, onRow, footer = true }) {
    const { rows, loading, data } = list;
    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="border-b border-ink/5 bg-ink/[.015]">
                        <tr>{columns.map((c, i) => <th key={i} className={`th ${c.className || ''}`}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                        {rows.map((r) => (
                            <tr key={r.id} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? 'cursor-pointer hover:bg-brand-50/40' : ''}>
                                {columns.map((c, i) => <td key={i} className={`td ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {loading && !rows.length && <div className="grid place-items-center py-12"><Spinner /></div>}
            {!loading && !rows.length && <Empty text={empty} />}
            {footer && data?.last_page > 1 && (
                <div className="flex items-center justify-between border-t border-ink/5 px-4 py-2.5 text-xs text-ink/55">
                    <span>{data.from}–{data.to} of {data.total}</span>
                    <div className="flex gap-1">
                        <button className="btn-ghost btn-sm" disabled={data.current_page <= 1} onClick={() => list.setPage(data.current_page - 1)}><ChevronLeft size={14} /></button>
                        <span className="px-2 py-1.5">Page {data.current_page} / {data.last_page}</span>
                        <button className="btn-ghost btn-sm" disabled={data.current_page >= data.last_page} onClick={() => list.setPage(data.current_page + 1)}><ChevronRight size={14} /></button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------- Modal + form ---------- */
export function Modal({ open, onClose, title: t, children, wide }) {
    useEffect(() => {
        if (!open) return;
        const k = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [open, onClose]);
    if (!open) return null;
    // Portal to <body> so modals are never clipped by a parent with transform / backdrop-filter.
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/5 bg-surface px-5 py-3.5">
                    <h3 className="font-bold">{t}</h3>
                    <button className="btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

/**
 * Declarative form. fields: [{ name, label, type, options, required, half, accept, multiple, hint, show(values) }]
 */
export function Form({ fields, initial = {}, onSubmit, submitLabel = 'Save', onChange, children }) {
    const [values, setValues] = useState(() => {
        const v = { ...initial };
        fields.forEach((f) => { if (v[f.name] === undefined || v[f.name] === null) v[f.name] = f.default ?? (f.type === 'checkbox' ? false : ''); });
        return v;
    });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const set = (name, val) => {
        setValues((s) => ({ ...s, [name]: val }));
        onChange?.({ ...values, [name]: val });
    };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            await onSubmit(values);
        } catch (err) {
            setErrors(err.errors || {});
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
            {fields.filter((f) => !f.show || f.show(values)).map((f) => (
                <div key={f.name} className={f.half ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
                    {f.type !== 'checkbox' && <label className="label">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>}
                    <Field f={f} value={values[f.name]} set={(v) => set(f.name, v)} />
                    {f.hint && <p className="mt-1 text-[11px] text-ink/45">{f.hint}</p>}
                    {(errors[f.name] || errors[f.name + '.0']) && <p className="mt-1 text-xs text-red-600">{(errors[f.name] || errors[f.name + '.0'])[0]}</p>}
                </div>
            ))}
            {children && <div className="col-span-2">{typeof children === 'function' ? children(values, set) : children}</div>}
            <div className="col-span-2 mt-1 flex justify-end">
                <button className="btn-primary" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}{submitLabel}</button>
            </div>
        </form>
    );
}

function Field({ f, value, set }) {
    const common = { className: 'input', required: f.required, placeholder: f.placeholder, disabled: f.disabled };
    switch (f.type) {
        case 'textarea':
            return <textarea {...common} rows={f.rows || 3} value={value} onChange={(e) => set(e.target.value)} />;
        case 'select':
            return (
                <select {...common} value={value ?? ''} onChange={(e) => set(e.target.value)}>
                    <option value="">{f.placeholder || 'Select…'}</option>
                    {(f.options || []).map((o) => (typeof o === 'string' ? <option key={o} value={o}>{title(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
            );
        case 'checkbox':
            return <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={!!value} onChange={(e) => set(e.target.checked)} />{f.label}</label>;
        case 'file':
            return (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink/15 bg-ink/[.015] px-3 py-2.5 text-sm text-ink/60 hover:border-brand-500">
                    <Paperclip size={15} />
                    <span className="truncate">{value ? (Array.isArray(value) ? `${value.length} file(s) selected` : value.name) : f.placeholder || 'Choose file…'}</span>
                    <input type="file" className="hidden" accept={f.accept} multiple={f.multiple} capture={f.capture}
                        onChange={(e) => set(f.multiple ? [...e.target.files] : e.target.files[0] || '')} />
                </label>
            );
        default:
            return <input {...common} type={f.type || 'text'} min={f.min} max={f.max} step={f.step} value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    }
}

export function FileLink({ path, label = 'View file' }) {
    if (!path) return null;
    return <a href={fileUrl(path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"><Paperclip size={12} />{label}</a>;
}

export function Confirm({ children, onConfirm, message = 'Are you sure?', className = 'btn-ghost btn-sm' }) {
    return <button className={className} onClick={(e) => { e.stopPropagation(); if (window.confirm(message)) onConfirm(); }}>{children}</button>;
}

/** Run an action, toast the result, then reload. */
export function useAction() {
    const toast = useToast();
    return async (fn, ok, after) => {
        try {
            const r = await fn();
            if (ok) toast(ok, 'success');
            after?.(r);
            return r;
        } catch (e) {
            toast(e.message, 'error');
        }
    };
}

/** Shared house dropdown options (officials only). */
let houseCache = null;
export function useHouses(enabled = true) {
    const [houses, setHouses] = useState(houseCache || []);
    useEffect(() => {
        if (!enabled || houseCache) return;
        get('houses', { all: 1 }).then((h) => { houseCache = h; setHouses(h); }).catch(() => {});
    }, [enabled]);
    return houses.map((h) => ({ value: h.id, label: `${h.block ? h.block + '-' : ''}${h.house_no}${h.owner_name ? ' · ' + h.owner_name : ''}` }));
}
export const clearHouseCache = () => { houseCache = null; };

/* ---------- URL-synced tab (so alerts can deep-link: /security?tab=approvals) ---------- */
export function useTab(initial) {
    const read = () => new URLSearchParams(window.location.search).get('tab') || initial;
    const [tab, setTab] = useState(read);
    const set = (t) => {
        setTab(t);
        const u = new URL(window.location.href);
        u.searchParams.set('tab', t);
        window.history.replaceState(null, '', u);
    };
    return [tab, set];
}
export const urlParam = (k) => new URLSearchParams(window.location.search).get(k) || '';

/* ---------- QR code image ---------- */
export function QrImage({ text, size = 200, className = '' }) {
    const [src, setSrc] = useState(null);
    useEffect(() => {
        let alive = true;
        import('qrcode').then((QR) => QR.toDataURL(text, { width: size * 2, margin: 1, color: { dark: '#0b2e2c', light: '#ffffff' } })).then((d) => alive && setSrc(d)).catch(() => {});
        return () => { alive = false; };
    }, [text, size]);
    return src ? <img src={src} width={size} height={size} alt="QR code" className={`rounded-xl bg-white p-1 ${className}`} /> : <div style={{ width: size, height: size }} className="grid place-items-center rounded-xl bg-ink/5"><Spinner /></div>;
}

/* ---------- Camera QR scanner (falls back to typing / USB scanner) ---------- */
export function QrScanner({ onResult, placeholder = 'Type or scan code…' }) {
    const [cam, setCam] = useState(false);
    const [err, setErr] = useState('');
    const [code, setCode] = useState('');
    const id = useRef('qr-' + Math.random().toString(36).slice(2));
    const scanner = useRef(null);
    useEffect(() => {
        if (!cam) return;
        let stopped = false;
        import('html5-qrcode').then(({ Html5Qrcode }) => {
            if (stopped) return;
            const s = new Html5Qrcode(id.current);
            scanner.current = s;
            s.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (txt) => { onResult(txt); setCam(false); }, () => {})
                .catch((e) => { setErr('Camera not available: ' + (e?.message || e)); setCam(false); });
        });
        return () => { stopped = true; scanner.current?.stop().catch(() => {}).finally(() => scanner.current?.clear?.()); };
    }, [cam]); // eslint-disable-line
    return (
        <div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { onResult(code.trim()); setCode(''); } }}>
                <input autoFocus className="input font-mono uppercase" placeholder={placeholder} value={code} onChange={(e) => setCode(e.target.value)} />
                <button className="btn-primary">Check</button>
                <button type="button" className="btn-outline" onClick={() => { setErr(''); setCam(!cam); }}>{cam ? 'Stop' : '📷 Camera'}</button>
            </form>
            {cam && <div id={id.current} className="mt-3 overflow-hidden rounded-xl bg-black" />}
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        </div>
    );
}

/* ---------- Simple CSV export ---------- */
export function exportCsv(filename, rows, columns) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = filename;
    a.click();
}
