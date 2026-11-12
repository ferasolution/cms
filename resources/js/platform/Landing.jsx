import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, Map, MessageSquareWarning, Wallet, CalendarDays, FileCheck2, Siren, Users, Dumbbell, BookOpen, Archive, Workflow, Check, ArrowRight } from 'lucide-react';
import { papi } from '../lib/api';
import { Logo, PlanArt } from './Brand';

const FEATURES = [
    [ShieldCheck, 'Gate & security', 'Walk-in entries with QR slips, household approval on the phone, vehicles, domestic staff, patrol rounds, guard shifts and CCTV.'],
    [Map, '3D map of your society', 'Every house on a live 3D map. A request or an SOS lights up the exact house, with the route from the gate.'],
    [Siren, 'Emergency', 'One-tap SOS, priority entry for ambulance and fire brigade, and the location ready to share.'],
    [MessageSquareWarning, 'Complaints', 'Residents raise complaints, they are auto-assigned to the right worker and escalate when they wait too long.'],
    [Wallet, 'Maintenance & finance', 'Dues, receipts, expenses with approval, and monthly reminders that send themselves.'],
    [CalendarDays, 'Events & bookings', 'Hall and lawn bookings with rates, approvals and time alerts.'],
    [FileCheck2, 'NOC processing', 'Applications with documents, checklists and a clear status for the applicant.'],
    [Users, 'Staff CRM', 'Attendance, leave, tasks and payroll-ready reports for society staff.'],
    [Dumbbell, 'Gym & club', 'Members, cards, payments and check-ins.'],
    [BookOpen, 'Library', 'Books, e-books and issue tracking.'],
    [Archive, 'Record room', 'House files kept digitally, each resident sees their own.'],
    [Workflow, 'Automations', 'Reminders, escalations and daily digests that run on their own.'],
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
        <div className="relative w-full max-w-md">
            <div className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[.06] px-3.5 py-3 backdrop-blur focus-within:border-sand-400/60">
                <Search size={17} className="text-white/45" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your society to sign in" className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/40" />
            </div>
            {res.length > 0 && (
                <div className="card absolute inset-x-0 top-full z-20 mt-2 overflow-hidden p-1 text-ink">
                    {res.map((s) => (
                        <a key={s.slug} href={`/${s.slug}/`} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-brand-50">
                            <span><span className="block font-semibold">{s.name}</span><span className="text-xs text-ink/50">{s.city ? s.city + ' · ' : ''}cms.ferasolution.com/{s.slug}</span></span>
                            <ArrowRight size={16} className="text-brand-600" />
                        </a>
                    ))}
                </div>
            )}
            {q.trim().length >= 2 && !res.length && <p className="mt-2 text-xs text-white/45">No society found with that name.</p>}
        </div>
    );
}

export default function Landing() {
    const [plans, setPlans] = useState([]);
    useEffect(() => { papi.get('plans').then(setPlans).catch(() => {}); }, []);
    const missing = window.APP?.missing;
    return (
        <div className="min-h-full bg-canvas">
            <section className="relative overflow-hidden bg-night text-white">
                <div className="jaali jaali-pan absolute inset-0 opacity-[.06] [mask-image:radial-gradient(ellipse_at_70%_30%,black,transparent_75%)]" aria-hidden="true" />
                <div className="drift-b absolute -bottom-48 -left-24 size-[32rem] rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
                <div className="drift-a absolute -right-24 -top-24 size-96 rounded-full bg-sand-400/15 blur-3xl" aria-hidden="true" />
                <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
                    <Logo />
                    <div className="flex items-center gap-1 text-sm">
                        <a href="#features" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white sm:block">Features</a>
                        <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-white/65 hover:text-white sm:block">Pricing</a>
                        <Link to="/register" className="btn ml-2 bg-sand-400 text-night hover:bg-sand-100">Register your society</Link>
                    </div>
                </nav>
                <div className="stagger relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_.9fr] lg:pt-16">
                    <div>
                        {missing && <div className="mb-5 rounded-xl border border-sand-400/30 bg-sand-400/10 px-4 py-2.5 text-sm text-sand-100">There is no society at /{missing}. Search for yours below.</div>}
                        <h1 className="max-w-xl text-[40px] font-bold leading-[1.04] tracking-tight sm:text-[56px]">Run your housing society from one control room.</h1>
                        <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-white/65">Security gate, residents, complaints, maintenance, emergencies and a live 3D map of every house — for the office, the guards and the residents, on any phone.</p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link to="/register" className="btn bg-sand-400 px-5 py-3 text-[15px] text-night shadow-[0_10px_30px_-12px_rgba(245,165,36,.8)] hover:bg-sand-100">Start the 14-day free trial</Link>
                            <a href="#how" className="btn px-4 py-3 text-white/75 hover:bg-white/[.07] hover:text-white">How it works</a>
                        </div>
                        <div className="mt-10"><Finder /></div>
                    </div>
                    <PlanArt className="mx-auto w-full max-w-md drop-shadow-[0_30px_60px_rgba(0,0,0,.45)]" />
                </div>
            </section>

            <section id="features" className="mx-auto max-w-6xl px-5 py-20">
                <h2 className="max-w-2xl text-[32px] font-bold leading-tight tracking-tight">Everything a society office does, in one place.</h2>
                <p className="mt-3 max-w-xl text-ink/60">Turn modules on as you need them. Residents get the same portal on their phone, limited to their own house.</p>
                <div className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map(([I, t, d]) => (
                        <div key={t} className="flex gap-3.5">
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-night text-sand-400"><I size={18} /></span>
                            <div><div className="font-bold">{t}</div><p className="mt-1 text-[14px] leading-relaxed text-ink/60">{d}</p></div>
                        </div>
                    ))}
                </div>
            </section>

            <section id="how" className="border-y border-ink/[.06] bg-surface">
                <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
                    {[['Register your society', 'Pick an address like cms.ferasolution.com/your-society and create the Super Admin account. The trial starts at once.'],
                        ['Add houses and staff', 'Import houses and residents, add guards and office staff, and set who can see what.'],
                        ['Residents join on their phones', 'They install the portal like an app, approve visitors at the gate and raise requests that show on the map.']].map(([t, d], i) => (
                        <div key={t}>
                            <div className="text-[44px] font-bold leading-none text-brand-600/25">{i + 1}</div>
                            <div className="mt-3 text-lg font-bold">{t}</div>
                            <p className="mt-1.5 text-[14px] leading-relaxed text-ink/60">{d}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
                <h2 className="text-[32px] font-bold tracking-tight">Plans</h2>
                <p className="mt-2 text-ink/60">Monthly, per society. Every plan starts with a 14-day free trial.</p>
                <div className="mt-10 grid gap-4 lg:grid-cols-3">
                    {plans.map((p) => (
                        <div key={p.key} className={`card spot lift p-6 ${p.key === 'pro' ? 'ring-2 ring-brand-500' : ''}`}>
                            <div className="flex items-center justify-between"><span className="text-lg font-bold">{p.name}</span>{p.key === 'pro' && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">Most societies pick this</span>}</div>
                            <div className="mt-4 text-[34px] font-bold tracking-tight">Rs {Number(p.price).toLocaleString('en-PK')}<span className="text-sm font-medium text-ink/45"> / month</span></div>
                            <div className="mt-1 text-sm text-ink/55">{p.max_houses ? `Up to ${p.max_houses} houses` : 'Unlimited houses'}</div>
                            <ul className="mt-5 space-y-2 text-sm">
                                {(p.modules === '*' ? ['Every module', '3D map & inner view', 'Security suite with CCTV & patrol', 'Gym & club', 'Priority support'] : p.key === 'pro'
                                    ? ['Security, complaints, finance, events', 'NOC, record room, inventory, library', 'Staff CRM', '3D map of your society'] : ['Security & visitor approvals', 'Complaints & announcements', 'Maintenance & finance', 'Events & SOS'])
                                    .map((f) => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />{f}</li>)}
                            </ul>
                            <Link to={`/register?plan=${p.key}`} className={`mt-6 w-full ${p.key === 'pro' ? 'btn-primary' : 'btn-outline'}`}>Start free trial</Link>
                        </div>
                    ))}
                </div>
            </section>

            <footer className="bg-night py-8 text-center text-sm text-white/45">Built by <a href="https://www.ferasolution.com" className="text-white/70 hover:text-white">Fera Solution</a> · <Link to="/platform" className="hover:text-white">Platform sign in</Link></footer>
        </div>
    );
}
