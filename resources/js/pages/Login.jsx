import { useState } from 'react';
import { Loader2, ShieldCheck, Boxes, BookOpen, Wallet, CalendarHeart, MessageSquareWarning, FileCheck2, Archive } from 'lucide-react';
import { useAuth } from '../lib/auth';

const FEATURES = [[ShieldCheck, 'Gate security & visitor tracking'], [Wallet, 'Maintenance, dues & salaries'], [CalendarHeart, 'Event booking with time alerts'],
    [MessageSquareWarning, 'Online complaints'], [FileCheck2, 'NOC processing'], [Archive, 'Digital record room'], [BookOpen, 'Library & e-books'], [Boxes, 'Inventory issuance']];

export default function Login() {
    const { login } = useAuth();
    const [form, setForm] = useState({ email: '', password: '', remember: true });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try { await login(form.email, form.password, form.remember); } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    return (
        <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
            <div className="relative hidden overflow-hidden bg-night p-12 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="jaali absolute inset-0 opacity-[.06] [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_75%)]" aria-hidden="true" />
                <div className="absolute right-[18%] top-[22%] size-3 rounded-full bg-sand-400 shadow-[0_0_40px_18px_rgba(245,165,36,.45)]" aria-hidden="true" />
                <div className="absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
                <div className="relative flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-white/[.07] ring-1 ring-white/10"><img src="/icon.svg" className="size-8 rounded-lg" alt="" /></span>
                    <span className="text-lg font-bold tracking-tight">{window.APP?.name}</span>
                </div>
                <div className="relative">
                    <h1 className="max-w-lg text-[44px] font-bold leading-[1.05] tracking-tight">Every gate, every house, every request. One control room.</h1>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">Security, residents, staff and the office work from the same live picture of the community.</p>
                    <div className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3.5">
                        {FEATURES.map(([Icon, t]) => (
                            <div key={t} className="flex items-center gap-3 text-sm text-white/70"><Icon size={16} className="shrink-0 text-sand-400" />{t}</div>
                        ))}
                    </div>
                </div>
                <div className="relative text-xs text-white/35">Built by Fera Solution</div>
            </div>
            <div className="flex items-center justify-center p-6">
                <form onSubmit={submit} className="w-full max-w-sm">
                    <img src="/icon.svg" className="mb-6 size-12 rounded-2xl lg:hidden" alt="" />
                    <h2 className="text-[30px] font-bold leading-tight tracking-tight">Sign in</h2>
                    {window.APP?.society && <div className="mt-1 text-[15px] font-semibold text-brand-700">{window.APP.society.display_name || window.APP.society.name}</div>}
                    <p className="mt-1 text-sm text-ink/55">Officials and residents use the same login.</p>
                    <div className="mt-7 space-y-4">
                        <div>
                            <label className="label">Email</label>
                            <input className="input py-2.5" type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div>
                            <label className="label">Password</label>
                            <input className="input py-2.5" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-ink/65"><input type="checkbox" className="size-4 accent-brand-600" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />Keep me signed in</label>
                        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                        <button className="btn-primary w-full py-3 text-[15px]" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Sign in</button>
                    </div>
                    <p className="mt-6 text-center text-sm text-ink/50">Not your society? <a href="/" className="font-semibold text-brand-600 hover:underline">Find yours</a></p>
                </form>
            </div>
        </div>
    );
}
