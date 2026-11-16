import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, Receipt, Layers, Megaphone, UsersRound, ScrollText, Settings2, Activity, LogOut, Menu, X, ExternalLink } from 'lucide-react';
import { papi } from '../lib/api';
import { Spinner } from '../components/ui';
import { Logo } from './Brand';
import { AuthCard, Loading } from './console/kit';

const Overview = lazy(() => import('./console/Overview'));
const Communities = lazy(() => import('./console/Communities'));
const Community = lazy(() => import('./console/Community'));
const Payments = lazy(() => import('./console/Payments'));
const PlansPage = lazy(() => import('./console/Plans'));
const Notices = lazy(() => import('./console/Notices'));
const Team = lazy(() => import('./console/Team'));
const Audit = lazy(() => import('./console/Audit'));
const SettingsPage = lazy(() => import('./console/Settings'));
const SystemPage = lazy(() => import('./console/System'));

const NAV = [
    ['', LayoutDashboard, 'Overview'],
    ['communities', Building2, 'Communities'],
    ['payments', Receipt, 'Payments'],
    ['plans', Layers, 'Plans & pricing'],
    ['notices', Megaphone, 'Notices'],
    ['team', UsersRound, 'Team', true],
    ['audit', ScrollText, 'Audit trail'],
    ['settings', Settings2, 'Settings'],
    ['system', Activity, 'System health'],
];

/** The platform team's console at /platform: sidebar + pages. */
export default function Console() {
    const [status, setStatus] = useState(null);
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const loadStatus = useCallback(() => papi.get('status').then(setStatus).catch(() => setStatus({ needs_setup: false })), []);
    useEffect(() => { loadStatus(); }, [loadStatus]);
    useEffect(() => { setOpen(false); }, [location.pathname]);

    if (!status) return <div className="grid h-full place-items-center"><Spinner /></div>;
    if (!status.user) return <AuthCard status={status} onDone={loadStatus} />;
    const me = status.user;
    const owner = me.role === 'platform_owner';

    const side = (
        <aside className="relative flex h-full w-64 flex-col overflow-hidden bg-night text-white">
            <div className="jaali absolute inset-0 opacity-[.04]" aria-hidden="true" />
            <div className="relative flex items-center justify-between px-5 pb-6 pt-5"><Logo /><button className="text-white/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
            <div className="relative px-5 pb-2 text-[11.5px] font-semibold text-white/40">Platform console</div>
            <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3">
                {NAV.filter(([, , , ownerOnly]) => owner || !ownerOnly).map(([to, Icon, label]) => (
                    <NavLink key={to} to={`/platform/${to}`} end={to === ''}
                        className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${isActive ? 'bg-white/[.09] text-white' : 'text-white/60 hover:bg-white/[.05] hover:text-white'}`}>
                        {({ isActive }) => <><Icon size={17} className={isActive ? 'text-sand-400' : ''} />{label}</>}
                    </NavLink>
                ))}
            </nav>
            <div className="relative border-t border-white/[.07] p-4">
                <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-sand-400 text-sm font-bold text-night">{me.name.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{me.name}</div><div className="text-xs text-white/45">{owner ? 'Owner' : 'Support'}</div></div>
                    <button className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" title="Sign out" onClick={async () => { await papi.post('logout'); loadStatus(); }}><LogOut size={16} /></button>
                </div>
                <a href="/" className="mt-3 flex items-center gap-1.5 text-xs text-white/40 hover:text-white"><ExternalLink size={12} />Public website</a>
            </div>
        </aside>
    );

    return (
        <div className="flex h-full bg-canvas">
            <div className="sticky top-0 hidden h-screen shrink-0 lg:block">{side}</div>
            {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="h-full">{side}</div><button className="flex-1 bg-night/50" aria-label="Close menu" onClick={() => setOpen(false)} /></div>}
            <div className="min-w-0 flex-1 overflow-y-auto">
                <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink/[.06] bg-canvas/85 px-4 py-3 backdrop-blur lg:hidden">
                    <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-ink/5" aria-label="Open menu"><Menu size={20} /></button>
                    <span className="font-semibold">Platform console</span>
                </div>
                <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    <Suspense fallback={<Loading />}>
                        <Routes>
                            <Route index element={<Overview />} />
                            <Route path="communities" element={<Communities owner={owner} />} />
                            <Route path="communities/:id" element={<Community owner={owner} />} />
                            <Route path="payments" element={<Payments owner={owner} />} />
                            <Route path="plans" element={<PlansPage owner={owner} />} />
                            <Route path="notices" element={<Notices owner={owner} />} />
                            {owner && <Route path="team" element={<Team me={me} />} />}
                            <Route path="audit" element={<Audit />} />
                            <Route path="settings" element={<SettingsPage owner={owner} me={me} onMe={loadStatus} />} />
                            <Route path="system" element={<SystemPage owner={owner} />} />
                            <Route path="*" element={<Overview />} />
                        </Routes>
                    </Suspense>
                </main>
            </div>
        </div>
    );
}
