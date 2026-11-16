import { useEffect, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { PageHeader, useToast } from '../../components/ui';
import { papi } from '../../lib/api';
import { Loading, usd, usePlatform } from './kit';

/** Names, prices, home limits and modules of the three plans. */
export default function Plans({ owner }) {
    const [d, , err] = usePlatform('plans/manage');
    const [plans, setPlans] = useState(null);
    const [saving, setSaving] = useState(false);
    const toast = useToast();
    useEffect(() => { if (d) setPlans(d.plans.map((p) => ({ ...p, modules: p.modules === '*' ? Object.keys(d.modules) : p.modules }))); }, [d]);
    if (err) return <p className="text-sm text-red-600">{err}</p>;
    if (!d || !plans) return <Loading />;
    const set = (i, k, v) => setPlans(plans.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    const toggle = (i, m) => set(i, 'modules', plans[i].modules.includes(m) ? plans[i].modules.filter((x) => x !== m) : [...plans[i].modules, m]);
    const save = async () => {
        setSaving(true);
        try { await papi.put('plans/manage', { plans }); toast('Plans saved — new prices apply to new checkouts', 'success'); } catch (e) { toast(e.message, 'error'); }
        setSaving(false);
    };

    return (
        <div>
            <PageHeader icon={Layers} title="Plans & pricing" subtitle="What each plan costs and includes. Changes show on the website and the checkout straight away.">
                {owner && <button className="btn-primary" onClick={save} disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" />}Save plans</button>}
            </PageHeader>
            <div className="grid gap-4 lg:grid-cols-3">
                {plans.map((p, i) => (
                    <div key={p.key} className="card p-5">
                        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink/45">{p.communities} {p.communities === 1 ? 'community' : 'communities'}</span><span className="text-xs text-ink/40">{p.key}</span></div>
                        <label className="mt-3 block"><span className="label">Name</span><input className="input" value={p.name} disabled={!owner} onChange={(e) => set(i, 'name', e.target.value)} /></label>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <label><span className="label">Price (USD / month)</span><input className="input" type="number" min="0" value={p.price} disabled={!owner} onChange={(e) => set(i, 'price', e.target.value)} /></label>
                            <label><span className="label">Home limit</span><input className="input" type="number" min="1" placeholder="Unlimited" value={p.max_houses ?? ''} disabled={!owner} onChange={(e) => set(i, 'max_houses', e.target.value || null)} /></label>
                        </div>
                        <label className="mt-3 block"><span className="label">One-line description</span><input className="input" value={p.tagline || ''} disabled={!owner} onChange={(e) => set(i, 'tagline', e.target.value)} /></label>
                        <div className="mt-4"><span className="label">Modules ({p.modules.length} of {Object.keys(d.modules).length})</span>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(d.modules).map(([k, l]) => {
                                    const on = p.modules.includes(k);
                                    return <button key={k} type="button" disabled={!owner} onClick={() => toggle(i, k)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-night text-white' : 'bg-ink/[.05] text-ink/50 hover:bg-ink/10'}`}>{l}</button>;
                                })}
                            </div>
                        </div>
                        <div className="mt-5 rounded-xl bg-canvas p-3 text-sm"><b>{usd(p.price)}</b> a month · {p.max_houses ? `up to ${p.max_houses} homes` : 'unlimited homes'}</div>
                    </div>
                ))}
            </div>
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink/50">With Lemon Squeezy, the price charged comes from the product variant in your Lemon Squeezy store — change it there too. With Stripe, the price here is used for new checkouts; existing subscriptions keep their price until they change plan.</p>
        </div>
    );
}
