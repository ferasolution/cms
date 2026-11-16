import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import {
    Search, ShieldCheck, Map, MessageSquareWarning, Wallet, CalendarDays, FileCheck2, Siren, Users, Dumbbell, BookOpen, Archive, Workflow,
    Check, ArrowRight, BellRing, Wrench, ScanLine, Car, QrCode, Smartphone, Home,
    LayoutDashboard, Lock, KeyRound, History, CreditCard, Globe2, MonitorSmartphone, Plus, Minus, Video, Printer,
} from 'lucide-react';
import { QrImage } from '../components/ui';
import { papi } from '../lib/api';
import { Logo } from './Brand';

const HeroScene = lazy(() => import('./HeroScene'));

const CHAPTERS = [
    { time: 'Dusk', label: 'Overview' },
    { time: '6:42 PM', label: 'Gate' },
    { time: '7:15 PM', label: 'Work order' },
    { time: '9:30 PM', label: 'Patrol' },
    { time: '11:58 PM', label: 'SOS' },
];

function Finder() {
    const [q, setQ] = useState('');
    const [res, setRes] = useState([]);
    useEffect(() => {
        if (q.trim().length < 2) { setRes([]); return; }
        const t = setTimeout(() => papi.get('lookup', { q }).then(setRes).catch(() => setRes([])), 220);
        return () => clearTimeout(t);
    }, [q]);
    return (
        <div className="relative w-full max-w-sm">
            <label className="flex items-center gap-2 rounded-xl border border-white/12 bg-night/60 px-3 py-2.5 backdrop-blur-md focus-within:border-sand-400/60">
                <Search size={16} className="text-white/45" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Already a customer? Find your community" className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/45" />
            </label>
            {res.length > 0 && (
                <div className="card absolute inset-x-0 top-full z-20 mt-2 overflow-hidden p-1 text-ink">
                    {res.map((s) => (
                        <a key={s.slug} href={`/${s.slug}/`} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-brand-50">
                            <span><span className="block font-semibold">{s.name}</span><span className="text-xs text-ink/50">cms.ferasolution.com/{s.slug}</span></span>
                            <ArrowRight size={16} className="text-brand-600" />
                        </a>
                    ))}
                </div>
            )}
            {q.trim().length >= 2 && !res.length && <p className="mt-2 text-xs text-white/50">No community found with that name.</p>}
        </div>
    );
}

/** Fades a chapter in around its point on the scroll, out on either side. */
function useChapter(f, i) {
    const opacity = useTransform(f, [i - 0.55, i - 0.25, i + 0.25, i + 0.55], [0, 1, 1, 0]);
    const y = useTransform(f, [i - 0.55, i, i + 0.55], [36, 0, -36]);
    const pointerEvents = useTransform(opacity, (o) => (o > 0.5 ? 'auto' : 'none'));
    return { opacity, y, pointerEvents };
}

function Chapter({ f, i, time, title, children, card }) {
    const style = useChapter(f, i);
    return (
        <motion.div style={style} className="absolute inset-x-0 bottom-0 px-5 pb-10 sm:bottom-auto sm:left-[max(1.25rem,calc((100vw-72rem)/2+1.25rem))] sm:right-auto sm:top-1/2 sm:w-[25rem] sm:-translate-y-1/2 sm:px-0 sm:pb-0">
            <div className="text-[44px] font-bold leading-none tracking-tight text-sand-400 sm:text-[56px]">{time}</div>
            <h2 className="mt-3 text-[26px] font-bold leading-[1.1] tracking-tight sm:text-[32px]">{title}</h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/70">{children}</p>
            <div className="mt-5 hidden sm:block">{card}</div>
        </motion.div>
    );
}

/** The resident's phone notification in the gate chapter: pending, then approved. */
function ApproveCard({ f }) {
    const approved = useTransform(f, [0.85, 1.0], [0, 1]);
    const pending = useTransform(approved, (v) => 1 - v);
    return (
        <div className="w-[22rem] rounded-2xl border border-white/10 bg-white/[.07] p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[12px] text-white/55"><Smartphone size={13} />Emily's phone · now</div>
            <div className="mt-2 flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sand-400 text-night"><BellRing size={17} /></span>
                <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">Package — UPS is at Gate 1</div>
                    <div className="text-[12.5px] text-white/60">For 14 Oak Lane · logged by Marcus</div>
                </div>
            </div>
            <div className="relative mt-3 h-9">
                <motion.div style={{ opacity: pending }} className="absolute inset-0 grid grid-cols-2 gap-2 text-[13px] font-semibold">
                    <span className="grid place-items-center rounded-lg bg-white/10">Deny</span>
                    <span className="grid place-items-center rounded-lg bg-emerald-500 text-night">Approve</span>
                </motion.div>
                <motion.div style={{ opacity: approved }} className="absolute inset-0 flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 text-[13px] font-semibold text-emerald-300">
                    <Check size={15} />Approved — QR slip GV-4K7Q2M printed
                </motion.div>
            </div>
        </div>
    );
}

function WorkCard() {
    return (
        <div className="w-80 rounded-2xl border border-white/10 bg-white/[.07] p-3.5 text-[13px] backdrop-blur-md">
            <div className="flex items-center justify-between"><span className="font-semibold">CMP-00118 · Water leak</span><span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[11.5px] font-semibold text-orange-300">High</span></div>
            <div className="mt-2.5 space-y-1.5 text-white/65">
                <div className="flex gap-2"><Home size={14} className="mt-0.5 text-white/40" />Lot S-12 · raised from the resident app</div>
                <div className="flex gap-2"><Wrench size={14} className="mt-0.5 text-white/40" />Assigned to Mike Reynolds (Plumber)</div>
                <div className="flex gap-2"><Workflow size={14} className="mt-0.5 text-white/40" />Escalates to the manager after 2 hours</div>
            </div>
        </div>
    );
}

function PatrolCard({ f }) {
    const pts = ['Gatehouse', 'Clubhouse', 'East wall', 'South wall', 'Back gate'];
    return (
        <div className="w-80 rounded-2xl border border-white/10 bg-white/[.07] p-3.5 text-[13px] backdrop-blur-md">
            <div className="mb-2 flex items-center gap-2 font-semibold"><ScanLine size={15} className="text-sky-300" />Night round · Derek Coleman</div>
            {pts.map((p, i) => <PatrolRow key={p} f={f} at={2.4 + [0.02, 0.27, 0.5, 0.73, 0.97][i] * 0.9} label={p} />)}
        </div>
    );
}

function PatrolRow({ f, at, label }) {
    const done = useTransform(f, [at - 0.02, at + 0.02], [0, 1]);
    const color = useTransform(done, [0, 1], ['rgba(255,255,255,.35)', 'rgb(52,211,153)']);
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-white/75">{label}</span>
            <motion.span style={{ color }} className="flex items-center gap-1 text-[12px] font-semibold"><motion.span style={{ opacity: done }}><Check size={13} /></motion.span>scanned</motion.span>
        </div>
    );
}

function SosCard() {
    return (
        <div className="w-80 rounded-2xl border border-red-400/30 bg-red-500/[.12] p-3.5 text-[13px] backdrop-blur-md">
            <div className="flex items-center gap-2 font-semibold text-red-200"><Siren size={15} className="animate-pulse" />SOS · Medical · 27 Oak Lane</div>
            <div className="mt-2 space-y-1 text-white/70">
                <div>Route from Gate 1 shown to the guard on duty</div>
                <div>EMS entry pre-approved at the gate</div>
                <div>Household contacts and the manager notified</div>
            </div>
        </div>
    );
}

function Rail({ f }) {
    return (
        <div className="absolute right-[max(1.25rem,calc((100vw-72rem)/2+1.25rem))] top-1/2 hidden -translate-y-1/2 flex-col gap-4 lg:flex">
            {CHAPTERS.map((c, i) => <RailItem key={c.time} f={f} i={i} c={c} />)}
        </div>
    );
}

function RailItem({ f, i, c }) {
    const on = useTransform(f, [i - 0.5, i - 0.2, i + 0.2, i + 0.5], [0, 1, 1, 0]);
    const opacity = useTransform(on, [0, 1], [0.38, 1]);
    const width = useTransform(on, [0, 1], [10, 30]);
    return (
        <motion.div style={{ opacity }} className="flex items-center justify-end gap-3 text-right text-[12.5px]">
            <span><span className="block font-semibold">{c.time}</span><span className="text-white/55">{c.label}</span></span>
            <motion.span style={{ width }} className="h-[2px] rounded-full bg-sand-400" />
        </motion.div>
    );
}

function Story() {
    const ref = useRef(null);
    const reduced = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
    const f = useTransform(scrollYProgress, [0, 1], [0, CHAPTERS.length - 1]);
    const active = useInView(ref, { margin: '0px 0px 0px 0px' });   // stop rendering once scrolled past
    const hint = useTransform(f, [0, 0.3], [1, 0]);
    const missing = window.APP?.missing;
    const heroStyle = useChapter(f, 0);

    return (
        <section ref={ref} className="relative" style={{ height: `${CHAPTERS.length * 100}svh` }}>
            <div className="sticky top-0 h-[100svh] overflow-hidden">
                <div className="absolute inset-0">
                    <Suspense fallback={<div className="size-full bg-[#0a1226]" />}>
                        <HeroScene progress={scrollYProgress} active={active} reduced={!!reduced} />
                    </Suspense>
                </div>
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,18,38,.92)_0%,rgba(10,18,38,.55)_34%,transparent_62%)] max-sm:bg-[linear-gradient(0deg,rgba(10,18,38,.97)_0%,rgba(10,18,38,.8)_45%,transparent_75%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0a1226]/80 to-transparent" />

                {/* opening */}
                <motion.div style={heroStyle} className="absolute inset-x-0 bottom-0 px-5 pb-10 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:pb-0">
                    <div className="mx-auto max-w-6xl">
                        {missing && <div className="mb-5 w-fit rounded-xl border border-sand-400/30 bg-sand-400/10 px-4 py-2.5 text-sm text-sand-100">There is no community at /{missing}. Search for yours below.</div>}
                        <h1 className="max-w-[13ch] text-[44px] font-bold leading-[.98] tracking-[-0.035em] sm:text-[76px]">Every gate, home and guard on one live map.</h1>
                        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/70">The control room for gated communities and HOAs: visitors, work orders, dues, patrols and emergencies — for the office, the gatehouse and every resident's phone.</p>
                        <div className="mt-7 flex flex-wrap items-center gap-3">
                            <Link to="/register" className="btn bg-sand-400 px-5 py-3 text-[15px] text-night shadow-[0_12px_36px_-12px_rgba(245,165,36,.9)] hover:bg-sand-100">Start the 14-day free trial</Link>
                            <a href="/demo/" className="btn border border-white/15 px-5 py-3 text-[15px] backdrop-blur hover:bg-white/10">Open the live demo</a>
                        </div>
                        <div className="mt-6 hidden sm:block"><Finder /></div>
                    </div>
                </motion.div>

                <Chapter f={f} i={1} time="6:42 PM" title="A courier at the gate." card={<ApproveCard f={f} />}>
                    The guard enters the lot number. Emily gets it on her phone, taps Approve, and the barrier lifts. The courier leaves with a QR slip that checks him out on the way back.
                </Chapter>
                <Chapter f={f} i={2} time="7:15 PM" title="A leak on Birch Court." card={<WorkCard />}>
                    Raised from the resident app with a photo, sent to the right worker automatically, and escalated if nobody picks it up.
                </Chapter>
                <Chapter f={f} i={3} time="9:30 PM" title="The night round, checkpoint by checkpoint." card={<PatrolCard f={f} />}>
                    Guards scan a QR code at each checkpoint. A missed point shows up on the map and in the manager's morning digest.
                </Chapter>
                <Chapter f={f} i={4} time="11:58 PM" title="SOS from 27 Oak Lane." card={<SosCard />}>
                    The control room sees the exact home and the route from the gate. Emergency services get priority entry with no paperwork at the barrier.
                </Chapter>

                <Rail f={f} />
                <motion.div style={{ opacity: hint }} className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[12px] text-white/55 sm:flex">
                    Scroll through one evening
                    <span className="h-9 w-[2px] overflow-hidden rounded-full bg-white/15"><motion.span className="block h-3 w-full bg-sand-400" animate={reduced ? {} : { y: [-12, 36] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} /></span>
                </motion.div>
            </div>
        </section>
    );
}

const TEAMS = [
    { who: 'Gatehouse', line: 'For guards on a phone or a tablet at the barrier.', items: [
        [QrCode, 'Walk-in entries with printable QR slips'], [Car, 'Vehicles, plates and parking passes'], [Users, 'Domestic staff with ID checks'],
        [ScanLine, 'Patrol checkpoints and guard shifts'], [ShieldCheck, 'CCTV and the watch-list'], [Siren, 'Emergency entry for EMS, fire, police']] },
    { who: 'Community office', line: 'For the manager, accounts and maintenance team.', items: [
        [Map, '3D map of every home, with live requests'], [MessageSquareWarning, 'Work orders that assign and escalate themselves'], [Wallet, 'HOA dues, receipts and expense approvals'],
        [FileCheck2, 'Architectural and resale approvals'], [Users, 'Staff attendance, leave and payroll'], [Workflow, 'Automated reminders and daily digests']] },
    { who: 'Residents', line: 'Installed like an app on any phone, limited to their own home.', items: [
        [BellRing, 'Approve visitors from the notification'], [Wrench, 'Report a problem with a photo'], [CalendarDays, 'Book the clubhouse, pool or courts'],
        [Wallet, 'See and pay dues'], [BookOpen, 'Library, gym and club'], [Archive, 'Their house file, always at hand']] },
];

const DEMO_LOGINS = [['Community admin', 'admin@demo.local'], ['Gate security', 'security@demo.local'], ['Resident', 'resident@demo.local']];


const MODULE_LABELS = {
    security: 'Gatehouse, visitors & vehicles', complaints: 'Work orders', announcements: 'Announcements', emergency: 'SOS & emergency entry', finance: 'HOA dues & finance',
    events: 'Events & amenity booking', users: 'Residents & households', settings: 'Roles & permissions', noc: 'Architectural & resale approvals', records: 'Records room',
    inventory: 'Inventory & assets', library: 'Library', crm: 'Staff, attendance & payroll', gym: 'Gym & club',
};

/* ---------- product tour: three live-looking screens, switched by the visitor ---------- */
const LOTS = Array.from({ length: 270 }, (_, i) => ({ i, s: [7, 49, 83, 121, 158, 203, 247].includes(i) ? 'work' : [22, 104, 190].includes(i) ? 'visitor' : i === 141 ? 'sos' : (i * 37) % 13 === 0 ? 'due' : 'ok' }));
const LOT_COLOR = { ok: 'bg-white/[.09]', due: 'bg-sand-400/45', work: 'bg-orange-400', visitor: 'bg-emerald-400', sos: 'bg-red-500 animate-pulse' };

function ControlRoom() {
    return (
        <div className="grid h-full gap-3 p-4 sm:grid-cols-[1fr_15rem] sm:p-5">
            <div className="flex min-w-0 flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[['Homes', '392'], ['Visitors today', '41'], ['Open work orders', '7'], ['Dues collected', '86%']].map(([l, v]) => (
                        <div key={l} className="rounded-xl bg-white/[.05] px-3 py-2.5"><div className="text-[11px] text-white/50">{l}</div><div className="text-[22px] font-bold leading-tight">{v}</div></div>
                    ))}
                </div>
                <div className="flex-1 rounded-xl bg-white/[.04] p-3">
                    <div className="mb-2 flex items-center justify-between text-[12px] text-white/55"><span>Site map · live</span><span className="flex gap-3"><span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-orange-400" />Work order</span><span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-emerald-400" />Visitor</span><span className="hidden items-center gap-1 sm:flex"><i className="size-2 rounded-sm bg-sand-400/60" />Dues pending</span></span></div>
                    <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]">
                        {LOTS.map((l) => <span key={l.i} className={`aspect-square rounded-[2px] ${LOT_COLOR[l.s]} ${Math.floor(l.i / 30) % 3 === 2 ? 'mb-1.5' : ''}`} />)}
                    </div>
                </div>
            </div>
            <div className="hidden flex-col gap-2 sm:flex">
                <div className="text-[12px] font-semibold text-white/55">Live feed</div>
                {[['bg-red-400', 'SOS · 27 Oak Lane', 'Guard on the way · 1 min'], ['bg-emerald-400', 'Visitor approved', 'UPS for 14 Oak Lane'], ['bg-orange-400', 'New work order', 'Water leak · Lot S-12'], ['bg-sky-400', 'Patrol checkpoint', 'East wall · scanned'], ['bg-sand-400', 'Dues paid', 'Lot N-04 · $185']].map(([c, t, d]) => (
                    <div key={t} className="flex gap-2.5 rounded-xl bg-white/[.04] px-3 py-2">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${c}`} />
                        <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{t}</div><div className="truncate text-[11.5px] text-white/50">{d}</div></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Gatehouse() {
    return (
        <div className="grid h-full gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-3">
                <div className="text-[12px] font-semibold text-white/55">New walk-in · Gate 1</div>
                {[['Visiting', '14 Oak Lane · Emily Johnson'], ['Name', 'Package — UPS'], ['Vehicle', 'TX · KXR-4471 · van'], ['Purpose', 'Delivery']].map(([l, v]) => (
                    <div key={l}><div className="text-[11px] text-white/45">{l}</div><div className="rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-[14px]">{v}</div></div>
                ))}
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2.5 text-[13px] font-semibold text-emerald-300"><Check size={15} />Approved by Emily on her phone · 0:21</div>
            </div>
            <div className="flex flex-col items-center justify-center">
                <div className="w-64 rotate-[-2deg] rounded-md bg-white p-4 text-night shadow-[0_24px_50px_-20px_rgba(0,0,0,.8)]">
                    <div className="text-center text-[11px] font-bold">Maple Grove Estates<br />Gate pass</div>
                    <div className="mx-auto my-3 w-28"><QrImage text="GV-4K7Q2M" size={112} /></div>
                    <div className="text-center font-mono text-[13px] font-bold">GV-4K7Q2M</div>
                    <div className="mt-2 space-y-0.5 text-[11px] text-night/70"><div>Package — UPS → 14 Oak Lane</div><div>In 6:42 PM · scan at exit</div></div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[12px] text-white/50"><Printer size={13} />Prints on any 80 mm receipt printer</div>
            </div>
        </div>
    );
}

function ResidentPhone() {
    return (
        <div className="flex h-full items-center justify-center gap-8 p-4 sm:p-5">
            <div className="w-[15.5rem] rounded-[2.2rem] border-[6px] border-[#1d2742] bg-[#f2f4f8] p-3 text-ink shadow-[0_30px_60px_-25px_rgba(0,0,0,.9)]">
                <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/15" />
                <div className="rounded-2xl bg-night p-3 text-white">
                    <div className="flex items-center gap-2 text-[11px] text-white/55"><BellRing size={12} />Gate 1 · now</div>
                    <div className="mt-1 text-[13px] font-semibold">Package — UPS is here for you</div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[12px] font-semibold"><span className="rounded-lg bg-white/10 py-1.5 text-center">Deny</span><span className="rounded-lg bg-emerald-500 py-1.5 text-center text-night">Approve</span></div>
                </div>
                <div className="mt-2.5 rounded-2xl bg-white p-3"><div className="text-[11px] text-ink/50">HOA dues · November</div><div className="flex items-baseline justify-between"><span className="text-[20px] font-bold">$185.00</span><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Paid</span></div></div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-[12px] font-semibold">
                    <span className="flex flex-col gap-1 rounded-2xl bg-white p-3"><Wrench size={16} className="text-brand-600" />Report a problem</span>
                    <span className="flex flex-col gap-1 rounded-2xl bg-white p-3"><CalendarDays size={16} className="text-brand-600" />Book the pool</span>
                </div>
                <div className="mt-2.5 rounded-2xl bg-white p-3 text-[12px]"><div className="font-semibold">Clubhouse · Sat 4 PM</div><div className="text-ink/50">Birthday party · confirmed</div></div>
            </div>
            <ul className="hidden max-w-[15rem] space-y-3 text-[14px] text-white/75 md:block">
                <li className="flex gap-2.5"><MonitorSmartphone size={17} className="mt-0.5 shrink-0 text-sand-400" />Installs from the browser like an app — no app store.</li>
                <li className="flex gap-2.5"><BellRing size={17} className="mt-0.5 shrink-0 text-sand-400" />Visitor requests arrive as notifications.</li>
                <li className="flex gap-2.5"><Lock size={17} className="mt-0.5 shrink-0 text-sand-400" />Each household sees only its own home.</li>
            </ul>
        </div>
    );
}

const SCREENS = [['control', 'Control room', LayoutDashboard, ControlRoom], ['gate', 'Gatehouse', ShieldCheck, Gatehouse], ['phone', 'Resident app', Smartphone, ResidentPhone]];

function ProductTour() {
    const [tab, setTab] = useState('control');
    const Screen = SCREENS.find((x) => x[0] === tab)[3];
    return (
        <section id="product" className="bg-[#0a1226] px-5 pb-24">
            <div className="mx-auto max-w-6xl">
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <h2 className="max-w-xl text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[44px]">What each team sees.</h2>
                    <div role="tablist" className="flex gap-1 rounded-2xl bg-white/[.06] p-1">
                        {SCREENS.map(([k, label, Icon]) => (
                            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${tab === k ? 'text-night' : 'text-white/65 hover:text-white'}`}>
                                {tab === k && <motion.span layoutId="tour-pill" className="absolute inset-0 rounded-xl bg-sand-400" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
                                <span className="relative flex items-center gap-2"><Icon size={15} />{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-8 overflow-hidden rounded-[22px] border border-white/10 bg-[#0d1630] shadow-[0_40px_90px_-40px_rgba(0,0,0,.9)]">
                    <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-3">
                        <span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" />
                        <span className="ml-3 truncate rounded-md bg-white/[.06] px-3 py-1 text-[12px] text-white/50">cms.ferasolution.com/maple-grove{tab === 'gate' ? '/security' : tab === 'phone' ? '/home' : '/dashboard'}</span>
                    </div>
                    <div className="relative min-h-[26rem]">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="h-full">
                                <Screen />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ---------- trust ---------- */
const TRUST = [
    [Lock, 'Every community walled off', 'Each community has its own address, users and data. Nobody from another community can see in — not even by guessing a link.'],
    [KeyRound, 'Roles for every job', 'Guards, accounts, maintenance and residents each get only the screens their work needs. Residents see only their own home.'],
    [History, 'A record of every change', 'Who approved what, who edited a payment, who opened the gate — every action is logged with a time and a name.'],
    [CreditCard, 'Cards never touch our servers', 'Subscriptions are paid through Lemon Squeezy or Stripe. We never see or store a card number.'],
    [Video, 'Works with what you have', 'Bring your own CCTV streams, any receipt printer for gate passes, and any phone or tablet at the gate.'],
    [Globe2, 'Your country, your currency', 'Dollars or pounds, dirhams or rupees; lots or plots; local time zone and ID wording — set per community.'],
];

function Trust() {
    return (
        <section className="bg-canvas px-5 py-24 text-ink">
            <div className="mx-auto max-w-6xl">
                <h2 className="max-w-2xl text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[44px]">Built to be trusted with a community.</h2>
                <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                    {TRUST.map(([Icon, t, d]) => (
                        <div key={t}>
                            <Icon size={22} className="text-brand-600" />
                            <div className="mt-3 text-[17px] font-bold">{t}</div>
                            <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink/60">{d}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ---------- plan comparison ---------- */
function Compare({ plans }) {
    if (!plans.length) return null;
    const has = (p, k) => p.modules === '*' || (Array.isArray(p.modules) && p.modules.includes(k));
    return (
        <div className="mt-10 overflow-x-auto rounded-[24px] border border-ink/10 bg-surface">
            <table className="w-full min-w-[620px] text-[14px]">
                <thead><tr className="border-b border-ink/10"><th className="px-5 py-4 text-left font-semibold text-ink/55">Compare plans</th>{plans.map((p) => <th key={p.key} className="px-5 py-4 text-center font-bold">{p.name}</th>)}</tr></thead>
                <tbody className="divide-y divide-ink/[.06]">
                    <tr><td className="px-5 py-3">Homes</td>{plans.map((p) => <td key={p.key} className="px-5 py-3 text-center font-semibold">{p.max_houses ? `up to ${p.max_houses}` : 'Unlimited'}</td>)}</tr>
                    <tr><td className="px-5 py-3">3D site map with inner view</td>{plans.map((p) => <td key={p.key} className="px-5 py-3 text-center"><Check size={16} className="mx-auto text-brand-600" /></td>)}</tr>
                    {Object.entries(MODULE_LABELS).map(([k, l]) => (
                        <tr key={k}><td className="px-5 py-3">{l}</td>{plans.map((p) => <td key={p.key} className="px-5 py-3 text-center">{has(p, k) ? <Check size={16} className="mx-auto text-brand-600" /> : <span className="text-ink/25">—</span>}</td>)}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ---------- FAQ ---------- */
const FAQ = [
    ['Do we need a card to start?', 'No. Register your community and use every feature of your plan free for the trial period. Choose a plan before it ends to keep going — your data stays exactly as you left it.'],
    ['Is the price per user?', 'No. You pay one monthly price per community, based on the plan. Add as many residents, guards and office staff as you like.'],
    ['Can we use our own site plan?', 'Yes. Send us your plot plan and we digitise it, so every lot and street sits on your community\'s 3D map. Until then, the portal works without a map.'],
    ['Do residents need to download an app?', 'No app store needed. Residents open your community\'s address on their phone and add it to the home screen; it works like an app, with notifications.'],
    ['Which countries do you support?', 'Communities anywhere. Currency, time zone, "lot" or "plot", and the ID wording on visitor forms are set per community. Subscriptions are billed in US dollars.'],
    ['Can we cancel or change plan?', 'Any time, from the Subscription page. A change of plan takes effect straight away; a cancellation keeps the portal on until the end of the paid month.'],
];

function Faq() {
    const [open, setOpen] = useState(0);
    return (
        <section id="faq" className="bg-canvas px-5 pb-24 text-ink">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.6fr]">
                <h2 className="self-start text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[44px] lg:sticky lg:top-24">Questions boards ask us.</h2>
                <div className="divide-y divide-ink/10 border-y border-ink/10">
                    {FAQ.map(([q, a], i) => (
                        <div key={q}>
                            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold">
                                {q}{open === i ? <Minus size={18} className="shrink-0 text-ink/45" /> : <Plus size={18} className="shrink-0 text-ink/45" />}
                            </button>
                            <AnimatePresence initial={false}>
                                {open === i && (
                                    <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                                        <span className="block max-w-2xl pb-5 text-[15px] leading-relaxed text-ink/65">{a}</span>
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default function Landing() {
    const [plans, setPlans] = useState([]);
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => { papi.get('plans').then(setPlans).catch(() => {}); }, []);
    useEffect(() => {
        const on = () => setScrolled(window.scrollY > 40);
        on();
        window.addEventListener('scroll', on, { passive: true });
        return () => window.removeEventListener('scroll', on);
    }, []);

    return (
        <div className="min-h-full bg-[#0a1226] text-white">
            <nav className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${scrolled ? 'border-b border-white/[.06] bg-[#0a1226]/80 backdrop-blur-md' : ''}`}>
                <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
                    <span className="whitespace-nowrap"><Logo /></span>
                    <div className="flex items-center gap-1 text-sm">
                        <a href="#teams" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white md:block">Features</a>
                        <a href="#product" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white lg:block">Product</a>
                        <a href="#demo" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white md:block">Demo</a>
                        <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white md:block">Pricing</a>
                        <a href="#faq" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white lg:block">FAQ</a>
                        <Link to="/platform" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white xl:block">Sign in</Link>
                        <Link to="/register" className="btn ml-2 whitespace-nowrap bg-sand-400 text-night hover:bg-sand-100"><span className="sm:hidden">Free trial</span><span className="hidden sm:inline">Register your community</span></Link>
                    </div>
                </div>
            </nav>

            <Story />

            <section id="teams" className="relative bg-[#0a1226] px-5 py-24">
                <div className="mx-auto max-w-6xl">
                    <h2 className="max-w-2xl text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[44px]">Three teams. One portal, one map.</h2>
                    <p className="mt-4 max-w-xl text-white/60">Everyone sees the same live picture, cut down to what their job needs. Turn modules on as you grow.</p>
                    <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] bg-white/[.08] lg:grid-cols-3">
                        {TEAMS.map((t) => (
                            <div key={t.who} className="bg-[#0d1630] p-7">
                                <div className="text-[22px] font-bold">{t.who}</div>
                                <p className="mt-1 text-[14px] text-white/55">{t.line}</p>
                                <ul className="mt-6 space-y-3.5">
                                    {t.items.map(([I, s]) => <li key={s} className="flex gap-3 text-[14.5px] text-white/85"><I size={17} className="mt-0.5 shrink-0 text-sand-400" />{s}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <ProductTour />

            <section id="demo" className="px-5 pb-24">
                <div className="relative mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-[28px] bg-sand-400 p-8 text-night sm:p-12 lg:grid-cols-[1.2fr_1fr]">
                    <div>
                        <h2 className="text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[44px]">Walk around Maple Grove Estates.</h2>
                        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-night/75">A full demo community in Austin, Texas, with nearly 400 homes, residents, guards and live activity. Sign in as any of the three teams and click around — nothing you do there touches a real community.</p>
                        <a href="/demo/" className="btn mt-7 bg-night px-5 py-3 text-[15px] text-white hover:bg-night/85">Open the demo<ArrowRight size={16} /></a>
                    </div>
                    <div className="self-center rounded-2xl bg-night/[.07] p-2">
                        {DEMO_LOGINS.map(([who, email]) => (
                            <div key={email} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 odd:bg-white/40">
                                <span className="font-semibold">{who}</span>
                                <span className="text-right text-[13.5px] text-night/70">{email}</span>
                            </div>
                        ))}
                        <div className="px-4 pb-2 pt-3 text-[13px] text-night/65">Password for every demo account: <b className="text-night">password</b></div>
                    </div>
                </div>
            </section>

            <Trust />

            <section className="bg-canvas px-5 pb-24 text-ink">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-[34px] font-bold tracking-tight sm:text-[44px]">Live in an afternoon.</h2>
                    <ol className="mt-12 grid gap-10 md:grid-cols-3">
                        {[['Register your community', 'Pick an address like cms.ferasolution.com/maple-grove and create the admin account. The free trial starts at once — no card needed.'],
                            ['Add homes and staff', 'Upload your site plan so every lot lands on the map, then add residents, guards and office staff and set who sees what.'],
                            ['Residents join on their phones', 'They install the portal like an app, approve visitors from a notification and report problems that light up on the map.']].map(([t, d], i) => (
                            <li key={t} className="border-t-2 border-ink pt-5">
                                <div className="text-[13px] font-semibold text-ink/45">Step {i + 1}</div>
                                <div className="mt-2 text-[20px] font-bold">{t}</div>
                                <p className="mt-2 text-[14.5px] leading-relaxed text-ink/60">{d}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section id="pricing" className="bg-canvas px-5 pb-24 text-ink">
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <h2 className="text-[34px] font-bold tracking-tight sm:text-[44px]">Plans</h2>
                        <p className="text-ink/60">Monthly per community, in US dollars. Cancel any time.</p>
                    </div>
                    <div className="mt-10 grid gap-4 lg:grid-cols-3">
                        {plans.map((p) => {
                            const pro = p.key === 'pro';
                            return (
                                <div key={p.key} className={`flex flex-col rounded-[24px] p-7 ${pro ? 'bg-night text-white shadow-[0_30px_60px_-30px_rgba(16,24,51,.6)]' : 'border border-ink/10 bg-surface'}`}>
                                    <div className="flex items-center justify-between"><span className="text-lg font-bold">{p.name}</span>{pro && <span className="rounded-full bg-sand-400 px-2.5 py-0.5 text-xs font-bold text-night">Most picked</span>}</div>
                                    <div className="mt-5 text-[46px] font-bold leading-none tracking-tight">${Number(p.price).toLocaleString('en-US')}<span className={`text-sm font-medium ${pro ? 'text-white/50' : 'text-ink/45'}`}> / month</span></div>
                                    <div className={`mt-2 text-sm ${pro ? 'text-white/60' : 'text-ink/55'}`}>{p.max_houses ? `Up to ${p.max_houses} homes` : 'Unlimited homes'}</div>
                                    {p.tagline && <p className={`mt-4 text-[14px] leading-snug ${pro ? 'text-white/75' : 'text-ink/70'}`}>{p.tagline}</p>}
                                    <ul className="mt-6 flex-1 space-y-2.5 text-[14px]">
                                        {(p.modules === '*' ? ['Every module, gym and club included', '3D site map with inner view', 'Security suite with CCTV and patrols', 'Unlimited residents and staff']
                                            : [...p.modules.filter((m) => MODULE_LABELS[m] && !['settings', 'users'].includes(m)).slice(0, 5).map((m) => MODULE_LABELS[m]), ...(p.modules.length > 7 ? [`and ${p.modules.length - 7} more modules`] : []), 'Unlimited residents and staff'])
                                            .map((x) => <li key={x} className="flex gap-2"><Check size={16} className={`mt-0.5 shrink-0 ${pro ? 'text-sand-400' : 'text-brand-600'}`} />{x}</li>)}
                                    </ul>
                                    <Link to={`/register?plan=${p.key}`} className={`mt-7 w-full ${pro ? 'btn bg-sand-400 text-night hover:bg-sand-100' : 'btn-outline'}`}>Start free trial</Link>
                                </div>
                            );
                        })}
                    </div>
                    <Compare plans={plans} />
                </div>
            </section>

            <Faq />

            <section className="relative overflow-hidden bg-night px-5 py-24 text-center text-white">
                <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
                <div className="relative mx-auto max-w-2xl">
                    <h2 className="text-[36px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">Give your gate, office and residents one place to work.</h2>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link to="/register" className="btn bg-sand-400 px-5 py-3 text-[15px] text-night hover:bg-sand-100">Start the free trial</Link>
                        <a href="/demo/" className="btn border border-white/15 px-5 py-3 text-[15px] hover:bg-white/10">Open the live demo</a>
                    </div>
                </div>
            </section>

            <footer className="border-t border-white/[.06] bg-[#0a1226] px-5 pb-10 pt-14 text-sm text-white/55">
                <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                    <div><Logo /><p className="mt-4 max-w-xs leading-relaxed">The control room for gated communities and HOAs — gate, office and residents on one live map.</p></div>
                    <div><div className="mb-3 font-semibold text-white">Product</div><ul className="space-y-2"><li><a href="#teams" className="hover:text-white">Features</a></li><li><a href="#product" className="hover:text-white">Screens</a></li><li><a href="#pricing" className="hover:text-white">Pricing</a></li><li><a href="#faq" className="hover:text-white">FAQ</a></li></ul></div>
                    <div><div className="mb-3 font-semibold text-white">Try it</div><ul className="space-y-2"><li><a href="/demo/" className="hover:text-white">Live demo</a></li><li><Link to="/register" className="hover:text-white">Start free trial</Link></li><li><Link to="/platform" className="hover:text-white">Team sign in</Link></li></ul></div>
                    <div><div className="mb-3 font-semibold text-white">Company</div><ul className="space-y-2"><li><a href="https://www.ferasolution.com" className="hover:text-white">Fera Solution</a></li></ul></div>
                </div>
                <div className="mx-auto mt-12 max-w-6xl border-t border-white/[.06] pt-6 text-xs text-white/35">© {new Date().getFullYear()} Fera Solution. All rights reserved.</div>
            </footer>
        </div>
    );
}
