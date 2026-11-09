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
            <div className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
                <svg className="absolute inset-0 h-full w-full opacity-[.07]" aria-hidden="true">
                    <defs><pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="white" /></pattern></defs>
                    <rect width="100%" height="100%" fill="url(#g)" />
                </svg>
                <div className="relative flex items-center gap-3">
                    <img src="/icon.svg" className="size-11 rounded-2xl" alt="" />
                    <span className="text-lg font-bold">{window.APP?.name}</span>
                </div>
                <div className="relative">
                    <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">Your whole community, managed from one place.</h1>
                    <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
                        {FEATURES.map(([Icon, t]) => (
                            <div key={t} className="flex items-center gap-2.5 text-sm text-white/75"><span className="grid size-8 place-items-center rounded-lg bg-surface/10"><Icon size={16} /></span>{t}</div>
                        ))}
                    </div>
                </div>
                <div className="relative text-xs text-white/40">Developed by Fera Solution</div>
            </div>
            <div className="flex items-center justify-center p-6">
                <form onSubmit={submit} className="w-full max-w-sm">
                    <img src="/icon.svg" className="mb-6 size-12 rounded-2xl lg:hidden" alt="" />
                    <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
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
                        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Sign in</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
