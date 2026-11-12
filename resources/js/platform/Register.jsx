import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, X, Loader2 } from 'lucide-react';
import { papi } from '../lib/api';
import { Logo, PlanArt } from './Brand';

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function Register() {
    const [params] = useSearchParams();
    const [f, setF] = useState({ name: '', slug: '', city: 'Karachi', houses: '', admin_name: '', email: '', phone: '', password: '', plan: params.get('plan') || 'pro', website: '' });
    const [touchedSlug, setTouchedSlug] = useState(false);
    const [check, setCheck] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState({});
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

    useEffect(() => { if (!touchedSlug) setF((x) => ({ ...x, slug: slugify(x.name) })); }, [f.name, touchedSlug]);
    useEffect(() => {
        if (f.slug.length < 3) { setCheck(null); return; }
        setCheck('busy');
        const t = setTimeout(() => papi.get('slug-check', { slug: f.slug }).then(setCheck).catch(() => setCheck(null)), 300);
        return () => clearTimeout(t);
    }, [f.slug]);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr({});
        try {
            const r = await papi.post('register', { ...f, houses: f.houses || null });
            window.location.href = r.redirect;
        } catch (ex) { setErr({ ...ex.errors, _: ex.message }); setBusy(false); }
    };
    const field = (k, label, props = {}) => (
        <label className="block">
            <span className="label">{label}</span>
            <input className="input" value={f[k]} onChange={set(k)} {...props} />
            {err[k] && <span className="mt-1 block text-xs text-red-600">{err[k][0]}</span>}
        </label>
    );

    return (
        <div className="grid min-h-full lg:grid-cols-[.9fr_1.1fr]">
            <div className="relative hidden overflow-hidden bg-night p-10 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
                <div className="drift-b absolute -bottom-40 -left-20 size-96 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
                <div className="relative"><Logo /></div>
                <div className="relative">
                    <PlanArt className="w-full max-w-sm" />
                    <h2 className="mt-8 max-w-sm text-[30px] font-bold leading-tight tracking-tight">Your society gets its own address and its own app.</h2>
                    <p className="mt-3 max-w-sm text-white/60">14 days free with every feature of your plan. No card needed — the platform team will contact you before the trial ends.</p>
                </div>
                <div className="relative text-xs text-white/35">Built by Fera Solution</div>
            </div>
            <div className="flex items-center justify-center p-5 sm:p-10">
                <form onSubmit={submit} className="stagger w-full max-w-xl space-y-6">
                    <div className="lg:hidden"><Link to="/" className="text-sm font-semibold text-brand-600">← Fera Community Cloud</Link></div>
                    <div>
                        <h1 className="text-[30px] font-bold tracking-tight">Register your society</h1>
                        <p className="mt-1 text-ink/55">Already registered? <Link to="/" className="font-semibold text-brand-600">Find your society</Link></p>
                    </div>
                    <div className="card space-y-4 p-5">
                        <div className="font-bold">Society</div>
                        {field('name', 'Society name', { required: true, placeholder: 'e.g. Bahria Town Precinct 10' })}
                        <label className="block">
                            <span className="label">Web address</span>
                            <div className="flex items-stretch overflow-hidden rounded-xl border border-ink/12 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/12">
                                <span className="flex items-center bg-ink/[.04] px-3 text-sm text-ink/50">cms.ferasolution.com/</span>
                                <input className="w-full bg-surface px-3 py-2 text-sm outline-none" value={f.slug} required onChange={(e) => { setTouchedSlug(true); setF({ ...f, slug: slugify(e.target.value) }); }} />
                                <span className="flex w-9 items-center justify-center">{check === 'busy' ? <Loader2 size={15} className="animate-spin text-ink/40" /> : check?.ok ? <Check size={16} className="text-emerald-600" /> : check ? <X size={16} className="text-red-600" /> : null}</span>
                            </div>
                            {check && check !== 'busy' && !check.ok && <span className="mt-1 block text-xs text-red-600">{check.message || 'Not available'}</span>}
                            {err.slug && <span className="mt-1 block text-xs text-red-600">{err.slug[0]}</span>}
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">{field('city', 'City', { required: true })}{field('houses', 'Number of houses (about)', { type: 'number', min: 1 })}</div>
                        <div>
                            <span className="label">Plan</span>
                            <div className="grid grid-cols-3 gap-2">{[['basic', 'Basic'], ['pro', 'Pro'], ['enterprise', 'Enterprise']].map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, plan: k })} className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${f.plan === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink/12 hover:border-ink/25'}`}>{l}</button>)}</div>
                        </div>
                    </div>
                    <div className="card space-y-4 p-5">
                        <div className="font-bold">Your account <span className="font-normal text-ink/45">— you become the Super Admin</span></div>
                        <div className="grid gap-4 sm:grid-cols-2">{field('admin_name', 'Full name', { required: true })}{field('phone', 'Mobile number', { required: true, placeholder: '03xx-xxxxxxx' })}</div>
                        {field('email', 'Email', { type: 'email', required: true })}
                        {field('password', 'Password (8+ characters)', { type: 'password', required: true, minLength: 8 })}
                        <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden="true" />
                    </div>
                    {err._ && !Object.keys(err).some((k) => k !== '_') && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{err._}</p>}
                    <button className="btn-primary w-full py-3 text-[15px]" disabled={busy || (check && check !== 'busy' && !check.ok)}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}Create society and start the trial</button>
                </form>
            </div>
        </div>
    );
}
