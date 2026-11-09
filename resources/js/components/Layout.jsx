import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, ShieldCheck, Boxes, BookOpen, Wallet, CalendarHeart, MessageSquareWarning, FileCheck2, Archive,
    Users, Map, Bell, LogOut, Menu, X, Activity, UserCircle, BellRing,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useAlerts } from '../lib/alerts';
import { ago } from '../lib/api';

export const MODULE_META = {
    security: { icon: ShieldCheck, to: '/security' },
    inventory: { icon: Boxes, to: '/inventory' },
    library: { icon: BookOpen, to: '/library' },
    finance: { icon: Wallet, to: '/finance' },
    events: { icon: CalendarHeart, to: '/events' },
    complaints: { icon: MessageSquareWarning, to: '/complaints' },
    noc: { icon: FileCheck2, to: '/noc' },
    records: { icon: Archive, to: '/records' },
    users: { icon: Users, to: '/users' },
};

function Bell2() {
    const { alerts, unread, ringing, markRead, markAll } = useAlerts();
    const [open, setOpen] = useState(false);
    const nav = useNavigate();
    const dot = { danger: 'bg-red-500', warning: 'bg-amber-500', success: 'bg-emerald-500', info: 'bg-brand-500' };
    return (
        <div className="relative">
            <button onClick={() => { setOpen(!open); if (!open && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }}
                className={`relative grid size-10 place-items-center rounded-xl hover:bg-black/5 ${ringing ? 'text-red-600' : ''}`}>
                {ringing ? <BellRing size={20} className="ringing" /> : <Bell size={20} />}
                {unread > 0 && <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="card absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden">
                        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                            <span className="font-bold">Live alerts</span>
                            {unread > 0 && <button className="text-xs font-semibold text-brand-600" onClick={markAll}>Mark all read</button>}
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            {!alerts.length && <div className="py-10 text-center text-sm text-black/40">No alerts yet</div>}
                            {alerts.map((a) => (
                                <button key={a.id} onClick={() => { markRead(a.id); setOpen(false); if (a.link) nav(a.link); }}
                                    className={`flex w-full gap-3 border-b border-black/5 px-4 py-3 text-left hover:bg-black/[.02] ${a.is_read ? 'opacity-55' : ''}`}>
                                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[a.level] || dot.info}`} />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold">{a.title}</span>
                                        {a.body && <span className="block text-xs text-black/55">{a.body}</span>}
                                        <span className="mt-0.5 block text-[11px] text-black/40">{ago(a.created_at)} · {a.module}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function Layout() {
    const { user, modules, roleLabel, logout, isAdmin } = useAuth();
    const [open, setOpen] = useState(false);

    const link = (to, Icon, label, end) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white'}`}>
            <Icon size={18} />{label}
        </NavLink>
    );

    return (
        <div className="flex h-full">
            <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 p-3 text-white transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="mb-4 flex items-center justify-between px-2 pt-2">
                    <div className="flex items-center gap-2.5">
                        <img src="/icon.svg" alt="" className="size-9 rounded-xl" />
                        <div className="leading-tight">
                            <div className="text-sm font-bold">{window.APP?.name || 'Community'}</div>
                            <div className="text-[11px] text-white/50">Management Portal</div>
                        </div>
                    </div>
                    <button className="lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button>
                </div>
                <nav className="flex-1 space-y-0.5 overflow-y-auto">
                    {link('/', LayoutDashboard, isAdmin ? 'ADH Dashboard' : 'Dashboard', true)}
                    {link('/map', Map, '3D Community Map')}
                    <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">Modules</div>
                    {modules.map((m) => MODULE_META[m.key] && link(MODULE_META[m.key].to, MODULE_META[m.key].icon, m.label))}
                    {isAdmin && link('/activity', Activity, 'Activity Log')}
                </nav>
                <div className="mt-3 rounded-xl bg-white/6 p-3">
                    <NavLink to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
                        <UserCircle size={30} className="text-white/70" />
                        <div className="min-w-0 leading-tight">
                            <div className="truncate text-sm font-semibold">{user.name}</div>
                            <div className="truncate text-[11px] text-white/50">{roleLabel}{user.house ? ' · ' + (user.house.block ? user.house.block + '-' : '') + user.house.house_no : ''}</div>
                        </div>
                    </NavLink>
                    <button onClick={logout} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold text-white/65 hover:bg-white/10 hover:text-white"><LogOut size={14} />Sign out</button>
                </div>
            </aside>
            {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/5 bg-sand-50/85 px-4 py-2.5 backdrop-blur sm:px-6">
                    <button className="btn-ghost -ml-2 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
                    <div className="hidden text-sm text-black/50 sm:block">{new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    <div className="flex items-center gap-1"><Bell2 /></div>
                </header>
                <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8"><Outlet /></main>
            </div>
        </div>
    );
}
