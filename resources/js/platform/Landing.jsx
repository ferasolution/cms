import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import {
    Search, ShieldCheck, Map, MessageSquareWarning, Wallet, CalendarDays, FileCheck2, Siren, Users, Dumbbell, BookOpen, Archive, Workflow,
    Check, ArrowRight, BellRing, Wrench, ScanLine, Car, QrCode, Smartphone, Home,
} from 'lucide-react';
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
                        <a href="#demo" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white md:block">Demo</a>
                        <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white md:block">Pricing</a>
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

            <section className="bg-canvas px-5 py-24 text-ink">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-[34px] font-bold tracking-tight sm:text-[44px]">Live in an afternoon.</h2>
                    <ol className="mt-12 grid gap-10 md:grid-cols-3">
                        {[['Register your community', 'Pick an address like cms.ferasolution.com/maple-grove and create the admin account. The 14-day trial starts at once — no card needed.'],
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
                                    <ul className="mt-6 flex-1 space-y-2.5 text-[14px]">
                                        {(p.modules === '*' ? ['Every module', '3D map with inner view of each home', 'Security suite with CCTV and patrols', 'Gym and club', 'Priority onboarding'] : pro
                                            ? ['Gatehouse, work orders, dues, events', 'Approvals, record room, inventory, library', 'Staff attendance and payroll', '3D map of your community'] : ['Gate and visitor approvals', 'Work orders and announcements', 'HOA dues and expenses', 'Events and SOS'])
                                            .map((x) => <li key={x} className="flex gap-2"><Check size={16} className={`mt-0.5 shrink-0 ${pro ? 'text-sand-400' : 'text-brand-600'}`} />{x}</li>)}
                                    </ul>
                                    <Link to={`/register?plan=${p.key}`} className={`mt-7 w-full ${pro ? 'btn bg-sand-400 text-night hover:bg-sand-100' : 'btn-outline'}`}>Start free trial</Link>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            <footer className="bg-[#0a1226] px-5 py-10 text-sm text-white/50">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
                    <Logo />
                    <div className="flex gap-5"><a href="/demo/" className="hover:text-white">Live demo</a><Link to="/platform" className="hover:text-white">Platform sign in</Link><a href="https://www.ferasolution.com" className="hover:text-white">Built by Fera Solution</a></div>
                </div>
            </footer>
        </div>
    );
}
