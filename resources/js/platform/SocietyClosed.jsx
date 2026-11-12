import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { get, post } from '../lib/api';
import PlanPicker from './PlanPicker';

/**
 * Shown instead of the portal when a community's trial or subscription has ended (or the platform
 * paused it). An admin signs in right here and picks a plan; all data stays as it was.
 */
export default function SocietyClosed() {
    const s = window.APP?.society || {};
    const paused = s.status === 'suspended';
    const [billing, setBilling] = useState(null);
    const [checking, setChecking] = useState(!paused);
    const [form, setForm] = useState({ email: '', password: '' });
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    const loadBilling = () => get('billing').then(setBilling);
    useEffect(() => {
        if (!paused) loadBilling().catch(() => {}).finally(() => setChecking(false));
    }, []);

    const signIn = async (e) => {
        e.preventDefault();
        setBusy(true); setErr('');
        try {
            await post('login', form);
            await loadBilling();
        } catch (x) {
            setErr(x.message);
        } finally {
            setBusy(false);
        }
    };

    const message = paused ? "This community's portal is paused. Please contact the platform team."
        : s.status === 'expired' ? "This community's subscription has ended. Choose a plan to switch the portal back on — all your data is kept safe."
            : 'The free trial has ended. Choose a plan to switch the portal back on — all your data is kept safe.';

    return (
        <div className="relative min-h-full overflow-y-auto bg-night px-4 py-12 text-white sm:px-6">
            <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
            <div className={`relative mx-auto ${billing?.can_manage ? 'max-w-4xl' : 'max-w-md'}`}>
                <div className="text-center">
                    <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-white/[.07] ring-1 ring-white/10"><img src="/icon.svg" alt="" className="size-9" /></div>
                    <h1 className="text-[28px] font-bold leading-tight tracking-tight">{s.name || s.display_name}</h1>
                    <p className="mx-auto mt-3 max-w-md text-white/65">{message}</p>
                </div>

                {!paused && (checking ? (
                    <div className="mt-8 grid place-items-center"><Loader2 className="animate-spin text-white/50" /></div>
                ) : billing?.can_manage ? (
                    <div className="mt-9"><PlanPicker data={billing} dark onError={setErr} />{err && <p className="mt-3 text-center text-sm text-red-300">{err}</p>}</div>
                ) : billing ? (
                    <p className="mt-8 text-center text-sm text-white/60">You're signed in as a resident or staff member. Please ask your community admin to renew the plan.</p>
                ) : (
                    <form onSubmit={signIn} className="mx-auto mt-8 max-w-sm space-y-3 rounded-[var(--radius-panel)] border border-white/10 bg-white/[.04] p-5 text-left">
                        <div className="text-sm font-semibold">Community admin? Sign in to renew</div>
                        <input className="input bg-white/95" type="email" autoComplete="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        <input className="input bg-white/95" type="password" autoComplete="current-password" placeholder="Password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                        {err && <p className="text-sm text-red-300">{err}</p>}
                        <button type="submit" disabled={busy} className="btn w-full bg-sand-400 text-night hover:bg-sand-100">{busy && <Loader2 size={15} className="animate-spin" />}Sign in</button>
                    </form>
                ))}
                <div className="mt-8 text-center"><a href="/" className="text-sm text-white/50 hover:text-white">Fera Community Cloud</a></div>
            </div>
        </div>
    );
}
