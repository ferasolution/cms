import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, ShieldCheck, Boxes, BookOpen, Wallet, CalendarHeart, MessageSquareWarning, FileCheck2, Archive,
    Users, Map, Bell, LogOut, Menu, X, Activity, BellRing, Search, Siren, Moon, Sun, Megaphone, Dumbbell, BriefcaseBusiness,
    Settings, Briefcase, Loader2, CornerDownLeft, Wifi, WifiOff, MapPin, Workflow, Home as HomeIcon, Menu as MenuIcon,
} from 'lucide-react';
import { useAuth, applyTheme } from '../lib/auth';
import { useAlerts } from '../lib/alerts';
import { ago, get, post, put } from '../lib/api';
import { Modal, useToast } from './ui';

export const MODULE_META = {
    security: { icon: ShieldCheck, to: '/security', group: 'Operations' },
    events: { icon: CalendarHeart, to: '/events', group: 'Operations' },
    complaints: { icon: MessageSquareWarning, to: '/complaints', group: 'Operations' },
    emergency: { icon: Siren, to: '/emergency', group: 'Operations' },
    announcements: { icon: Megaphone, to: '/announcements', group: 'Operations' },
    finance: { icon: Wallet, to: '/finance', group: 'Administration' },
    noc: { icon: FileCheck2, to: '/noc', group: 'Administration' },
    records: { icon: Archive, to: '/records', group: 'Administration' },
    crm: { icon: BriefcaseBusiness, to: '/crm', group: 'Administration' },
    inventory: { icon: Boxes, to: '/inventory', group: 'Administration' },
    library: { icon: BookOpen, to: '/library', group: 'Community' },
    gym: { icon: Dumbbell, to: '/gym', group: 'Community' },
    users: { icon: Users, to: '/users', group: 'System' },
    settings: { icon: Settings, to: '/settings', group: 'System' },
};

function Bell2() {
    const { alerts, unread, ringing, markRead, markAll } = useAlerts();
    const [open, setOpen] = useState(false);
    const nav = useNavigate();
    const dot = { danger: 'bg-red-500', warning: 'bg-amber-500', success: 'bg-emerald-500', info: 'bg-brand-500' };
    return (
        <div className="relative">
            <button onClick={() => { setOpen(!open); if (!open && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }}
                className={`relative grid size-10 place-items-center rounded-xl hover:bg-ink/5 ${ringing ? 'text-red-600' : ''}`} title="Alerts">
                {ringing ? <BellRing size={20} className="ringing" /> : <Bell size={20} />}
                {unread > 0 && <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="card absolute right-0 z-40 mt-2 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden">
                        <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3">
                            <span className="font-bold">Notification center</span>
                            {unread > 0 && <button className="text-xs font-semibold text-brand-600" onClick={markAll}>Mark all read</button>}
                        </div>
                        <div className="max-h-[65vh] overflow-y-auto">
                            {!alerts.length && <div className="py-10 text-center text-sm text-ink/40">No alerts yet</div>}
                            {alerts.map((a) => (
                                <button key={a.id} onClick={() => { markRead(a.id); setOpen(false); if (a.link) nav(a.link); }}
                                    className={`flex w-full gap-3 border-b border-ink/5 px-4 py-3 text-left hover:bg-ink/[.02] ${a.is_read ? 'opacity-55' : ''}`}>
                                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[a.level] || dot.info}`} />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold">{a.title}</span>
                                        {a.body && <span className="block text-xs text-ink/55">{a.body}</span>}
                                        <span className="mt-0.5 block text-[11px] text-ink/40">{ago(a.created_at)} · {a.module}</span>
                                    </span>
                                    {a.house_id && <span role="button" title="Locate on map" onClick={(e) => { e.stopPropagation(); markRead(a.id); setOpen(false); nav('/map?house=' + a.house_id); }} className="ml-auto grid size-8 shrink-0 place-items-center self-center rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100"><MapPin size={15} /></span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/** Ctrl/⌘+K global search across every module the user can open. */
function SearchPalette({ open, onClose }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [sel, setSel] = useState(0);
    const nav = useNavigate();
    const input = useRef();
    useEffect(() => { if (open) { setQ(''); setRows([]); setTimeout(() => input.current?.focus(), 30); } }, [open]);
    useEffect(() => {
        if (q.trim().length < 2) { setRows([]); return; }
        setBusy(true);
        const t = setTimeout(() => get('search', { q }).then((r) => { setRows(r); setSel(0); }).catch(() => {}).finally(() => setBusy(false)), 220);
        return () => clearTimeout(t);
    }, [q]);
    if (!open) return null;
    const go = (r) => { onClose(); nav(r.link); };
    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 p-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="card w-full max-w-xl overflow-hidden">
                <div className="flex items-center gap-3 border-b border-ink/5 px-4">
                    {busy ? <Loader2 size={18} className="animate-spin text-brand-500" /> : <Search size={18} className="text-ink/40" />}
                    <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search houses, residents, visitors, plates, tickets, events…"
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') onClose();
                            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                            if (e.key === 'Enter' && rows[sel]) go(rows[sel]);
                        }}
                        className="w-full bg-transparent py-4 text-[15px] outline-none placeholder:text-ink/35" />
                    <kbd className="rounded-md border border-ink/10 px-1.5 text-[10px] text-ink/45">ESC</kbd>
                </div>
                <div className="max-h-[55vh] overflow-y-auto p-2">
                    {q.length >= 2 && !busy && !rows.length && <div className="py-8 text-center text-sm text-ink/45">Nothing found for “{q}”</div>}
                    {q.length < 2 && <div className="px-3 py-6 text-center text-xs text-ink/40">Type at least 2 letters. Try “A-101”, a CNIC, a number plate or a ticket number.</div>}
                    {rows.map((r, i) => (
                        <button key={r.type + r.id} onMouseEnter={() => setSel(i)} onClick={() => go(r)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === sel ? 'bg-brand-50' : ''}`}>
                            <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-600">{r.type}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.title}</span>{r.sub && <span className="block truncate text-xs text-ink/50">{r.sub}</span>}</span>
                            {i === sel && <CornerDownLeft size={14} className="text-ink/35" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Big red SOS button — sends location + household to security instantly. */
function SosButton() {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const toast = useToast();
    const { refresh } = useAlerts();
    const send = async (type) => {
        setBusy(true);
        let pos = {};
        try {
            pos = await new Promise((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 3000 }) : res({}));
        } catch { /* no location */ }
        try {
            await post('sos', { type, message: msg, ...pos });
            toast('SOS sent — security has been alerted', 'danger', 'Stay where you are. Help is on the way.');
            setOpen(false); setMsg(''); refresh();
        } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
    };
    return (
        <>
            <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-bold text-white shadow-sm shadow-red-600/30 hover:bg-red-700" title="Emergency SOS">
                <Siren size={17} /><span className="hidden sm:inline">SOS</span>
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title="Emergency SOS">
                <p className="mb-3 text-sm text-ink/60">Choose the emergency. Security and the emergency team get your name, phone, house and location immediately.</p>
                <div className="grid grid-cols-2 gap-2">
                    {[['medical', '🚑 Medical'], ['fire', '🔥 Fire'], ['security', '🚨 Security / Intruder'], ['other', '⚠️ Other']].map(([t, l]) => (
                        <button key={t} disabled={busy} onClick={() => send(t)} className="rounded-2xl border-2 border-red-200 bg-red-50 px-3 py-5 text-base font-bold text-red-700 transition hover:border-red-500 hover:bg-red-100 disabled:opacity-50 dark:border-red-900">{l}</button>
                    ))}
                </div>
                <input className="input mt-3" placeholder="Short message (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
            </Modal>
        </>
    );
}

function ThemeToggle() {
    const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
    return (
        <button className="grid size-10 place-items-center rounded-xl hover:bg-ink/5" title="Light / dark"
            onClick={() => { const m = dark ? 'light' : 'dark'; applyTheme(m); setDark(!dark); put('profile', { theme: m }).catch(() => {}); }}>
            {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
    );
}

function LiveDot() {
    const { online, lastSync } = useAlerts();
    return (
        <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold md:flex ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`} title={lastSync ? 'Last sync ' + lastSync.toLocaleTimeString() : ''}>
            {online ? <><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>LIVE</> : <><WifiOff size={12} />Offline</>}
        </span>
    );
}

function SosBanner() {
    const { sos } = useAlerts();
    const { isResident } = useAuth();
    const nav = useNavigate();
    const active = sos.filter((s) => s.status === 'active');
    if (!sos.length) return null;
    return (
        <button onClick={() => nav('/emergency')} className={`flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white ${active.length ? 'animate-pulse bg-red-600' : 'bg-amber-600'}`}>
            <Siren size={16} />
            {isResident ? (active.length ? 'Your SOS is active — security has been alerted' : 'Help is on the way') : `${active.length} active SOS · ${sos.length - active.length} being handled — ${sos.map((s) => (s.house ? s.house.block + '-' + s.house.house_no : s.user?.name) + ' (' + s.type + ')').join(', ')}`}
        </button>
    );
}

/** App-style bottom bar on phones. */
function BottomNav({ onMenu }) {
    const { can, isResident } = useAuth();
    const { unread, sos } = useAlerts();
    const items = [
        ['/', HomeIcon, 'Home', true],
        ['/map', Map, 'Map'],
        can('security') && ['/security' + (isResident ? '?tab=approvals' : ''), ShieldCheck, isResident ? 'Gate' : 'Security'],
        can('complaints') && ['/complaints', MessageSquareWarning, 'Requests'],
    ].filter(Boolean);
    return (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-ink/8 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length + 1}, 1fr)` }}>
            {items.map(([to, Icon, label, end]) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${isActive ? 'text-brand-600' : 'text-ink/50'}`}>
                    <Icon size={21} />{label}
                    {to === '/map' && sos.length > 0 && <span className="absolute right-[30%] top-1.5 size-2.5 animate-ping rounded-full bg-red-500" />}
                </NavLink>
            ))}
            <button onClick={onMenu} className="relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-ink/50"><MenuIcon size={21} />More
                {unread > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}</button>
        </nav>
    );
}

export default function Layout() {
    const location = useLocation();
    const { user, modules, roleLabel, logout, isAdmin, employee, community } = useAuth();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState(false);
    window.__me = user;

    useEffect(() => {
        const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, []);

    const link = (to, Icon, label, end) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition ${isActive ? 'bg-white/12 text-white shadow-[inset_2px_0_0_#e0a94f]' : 'text-white/60 hover:bg-white/6 hover:text-white'}`}>
            <Icon size={17} className="shrink-0" />{label}
        </NavLink>
    );
    const groups = {};
    modules.forEach((m) => { const meta = MODULE_META[m.key]; if (meta) (groups[meta.group] ||= []).push({ ...m, ...meta }); });

    return (
        <div className="flex h-full">
            <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 p-3 text-white transition-transform dark:bg-[#071110] lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="mb-3 flex items-center justify-between px-2 pt-2">
                    <div className="flex items-center gap-2.5">
                        <img src="/icon.svg" alt="" className="size-9 rounded-xl" />
                        <div className="leading-tight">
                            <div className="text-sm font-bold">{community || 'Community'}</div>
                            <div className="text-[11px] text-white/45">Smart Community Platform</div>
                        </div>
                    </div>
                    <button className="lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button>
                </div>
                <button onClick={() => { setSearch(true); setOpen(false); }} className="mb-3 flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-left text-xs text-white/50 hover:bg-white/12">
                    <Search size={14} />Search…<kbd className="ml-auto rounded border border-white/15 px-1 text-[10px]">Ctrl K</kbd>
                </button>
                <nav className="-mr-1 flex-1 space-y-0.5 overflow-y-auto pr-1">
                    {link('/', LayoutDashboard, isAdmin ? 'Command Center' : 'Dashboard', true)}
                    {link('/map', Map, '3D Community Map')}
                    {employee && link('/workspace', Briefcase, 'My Workspace')}
                    {Object.entries(groups).map(([g, items]) => (
                        <div key={g}>
                            <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-white/30">{g}</div>
                            {items.map((m) => link(m.to, m.icon, m.label))}
                        </div>
                    ))}
                    {isAdmin && link('/automations', Workflow, 'Automations')}
                    {isAdmin && link('/activity', Activity, 'Audit & Activity Log')}
                </nav>
                <div className="mt-3 rounded-xl bg-white/6 p-3">
                    <NavLink to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sand-400 text-sm font-bold text-brand-900">{user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                        <div className="min-w-0 leading-tight">
                            <div className="truncate text-sm font-semibold">{user.name}</div>
                            <div className="truncate text-[11px] text-white/50">{roleLabel}{user.house ? ' · ' + (user.house.block ? user.house.block + '-' : '') + user.house.house_no : ''}</div>
                        </div>
                    </NavLink>
                    <button onClick={logout} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white"><LogOut size={14} />Sign out</button>
                </div>
            </aside>
            {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

            <div className="flex min-w-0 flex-1 flex-col">
                <SosBanner />
                <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-ink/5 bg-canvas/85 px-3 py-2 backdrop-blur sm:px-6">
                    <div className="flex items-center gap-2">
                        <button className="btn-ghost -ml-1 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
                        <button onClick={() => setSearch(true)} className="hidden w-72 items-center gap-2 rounded-xl border border-ink/10 bg-surface px-3 py-2 text-sm text-ink/40 hover:border-brand-500 sm:flex">
                            <Search size={15} />Search everything…<kbd className="ml-auto rounded border border-ink/10 px-1 text-[10px]">Ctrl K</kbd>
                        </button>
                        <button onClick={() => setSearch(true)} className="grid size-10 place-items-center rounded-xl hover:bg-ink/5 sm:hidden"><Search size={19} /></button>
                    </div>
                    <div className="flex items-center gap-1">
                        <LiveDot />
                        <ThemeToggle />
                        <Bell2 />
                        <SosButton />
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto px-3 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-6"><div key={location.pathname} className="rise h-full"><Outlet /></div></main>
                <BottomNav onMenu={() => setOpen(true)} />
            </div>
            <SearchPalette open={search} onClose={() => setSearch(false)} />
        </div>
    );
}
