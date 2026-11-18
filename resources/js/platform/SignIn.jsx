import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, Clock, X } from 'lucide-react';
import { papi } from '../lib/api';
import { Logo } from './Brand';

const KEY = 'cms-recent-communities';
const host = typeof window !== 'undefined' ? window.location.host : 'cms.ferasolution.com';

function recent() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]').slice(0, 4); } catch { return []; }
}

/**
 * Sign-in for residents and community staff. Every community has its own address, so this page
 * finds the community first and sends people to its own sign-in screen.
 */
export default function SignIn() {
    const [q, setQ] = useState('');
    const [res, setRes] = useState(null);
    const [slug, setSlug] = useState('');
    const [list, setList] = useState(recent);

    useEffect(() => {
        if (q.trim().length < 2) { setRes(null); return; }
        const t = setTimeout(() => papi.get('lookup', { q }).then(setRes).catch(() => setRes([])), 220);
        return () => clearTimeout(t);
    }, [q]);

    const go = (e) => {
        e.preventDefault();
        const s = slug.trim().toLowerCase().replace(/^https?:\/\//, '').replace(host + '/', '').replace(/^\/+|\/+$/g, '');
        if (s) window.location.href = `/${s}/`;
    };
    const forget = (s) => {
        const next = list.filter((x) => x.slug !== s);
        setList(next);
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
    };

    return (
        <div className="relative min-h-full overflow-hidden bg-[#0a1226] text-white">
            <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-brand-600/25 blur-[120px]" aria-hidden="true" />
            <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
                <Link to="/" className="whitespace-nowrap"><Logo /></Link>
                <Link to="/register" className="whitespace-nowrap text-sm font-semibold text-white/65 hover:text-white"><span className="hidden sm:inline">New here? </span>Register<span className="hidden sm:inline"> your community</span></Link>
            </header>

            <main className="relative mx-auto max-w-md px-5 pb-16 pt-10 sm:pt-16">
                <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[40px]">Sign in to your community</h1>
                <p className="mt-3 text-[15px] leading-relaxed text-white/65">Residents, guards and office staff sign in on their own community's page. Find yours below.</p>

                {list.length > 0 && (
                    <div className="mt-8">
                        <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-white/50"><Clock size={13} />Recently used on this device</div>
                        <div className="space-y-2">
                            {list.map((c) => (
                                <div key={c.slug} className="group flex items-center rounded-2xl border border-white/10 bg-white/[.05] transition-colors hover:border-sand-400/50 hover:bg-white/[.08]">
                                    <a href={`/${c.slug}/`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sand-400 text-[15px] font-bold text-night">{c.name.slice(0, 1)}</span>
                                        <span className="min-w-0"><span className="block truncate font-semibold">{c.name}</span><span className="text-xs text-white/50">{host}/{c.slug}</span></span>
                                        <ArrowRight size={17} className="ml-auto shrink-0 text-white/40 group-hover:text-sand-400" />
                                    </a>
                                    <button type="button" onClick={() => forget(c.slug)} className="mr-2 rounded-lg p-2 text-white/30 hover:bg-white/10 hover:text-white" aria-label={`Forget ${c.name}`}><X size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-8">
                    <label htmlFor="find" className="mb-2 block text-[13px] font-semibold text-white/75">Community name</label>
                    <div className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[.06] px-4 py-3 focus-within:border-sand-400/70">
                        <Search size={17} className="text-white/45" />
                        <input id="find" autoFocus={!list.length} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Maple Grove Estates" autoComplete="off"
                            className="w-full bg-transparent text-[15px] text-white outline-none focus-visible:outline-none! placeholder:text-white/35" />
                    </div>
                    {res && res.length > 0 && (
                        <div className="mt-2 overflow-hidden rounded-2xl bg-white p-1 text-ink shadow-[0_24px_60px_-30px_rgba(0,0,0,.9)]">
                            {res.map((s) => (
                                <a key={s.slug} href={`/${s.slug}/`} className="flex items-center justify-between rounded-xl px-3.5 py-3 hover:bg-brand-50">
                                    <span><span className="block font-semibold">{s.name}</span><span className="text-xs text-ink/50">{s.city ? s.city + ' · ' : ''}{host}/{s.slug}</span></span>
                                    <ArrowRight size={16} className="text-brand-600" />
                                </a>
                            ))}
                        </div>
                    )}
                    {res && !res.length && <p className="mt-2 text-sm text-white/55">No community found with that name. Try the address below, or ask your community office for the link.</p>}
                </div>

                <form onSubmit={go} className="mt-6">
                    <label htmlFor="slug" className="mb-2 block text-[13px] font-semibold text-white/75">Or type your community's address</label>
                    <div className="flex gap-2">
                        <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-white/12 bg-white/[.06] px-4 focus-within:border-sand-400/70">
                            <span className="shrink-0 text-[14px] text-white/40">{host}/</span>
                            <input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="maple-grove" autoCapitalize="none" autoComplete="off" spellCheck={false}
                                className="w-full min-w-0 bg-transparent py-3 text-[15px] text-white outline-none focus-visible:outline-none! placeholder:text-white/30" />
                        </div>
                        <button type="submit" className="btn bg-sand-400 px-5 text-night hover:bg-sand-100">Go</button>
                    </div>
                </form>

                <div className="mt-10 space-y-2 border-t border-white/[.08] pt-6 text-sm text-white/55">
                    <p>Just looking? <a href="/demo/" className="font-semibold text-white hover:text-sand-400">Open the live demo</a> — sign in with admin@demo.local / password.</p>
                    <p>Fera team? <Link to="/platform" className="font-semibold text-white/80 hover:text-sand-400">Platform console</Link></p>
                </div>
            </main>
        </div>
    );
}
