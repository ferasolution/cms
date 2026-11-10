import { useState } from 'react';
import { Settings, Map as MapIcon, Navigation, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGet, PageHeader, Form, Spinner, useToast } from '../components/ui';
import { put, post } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Two plots + their real GPS → every plot gets a "Navigate (Google Maps)" link. */
function GeoCard({ edit, toast }) {
    const [open, setOpen] = useState(false);
    const map = useGet(open ? 'map' : null);
    const geo = map.data?.site?.geo;
    const [v, setV] = useState(null);
    const houses = (map.data?.houses || []).filter((h) => h.mx != null).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const near = (pt) => pt && houses.reduce((best, h) => (!best || Math.hypot(h.mx - pt.x, h.my - pt.y) < Math.hypot(best.mx - pt.x, best.my - pt.y) ? h : best), null);
    const init = () => geo && { a: near(geo.p1)?.id, alat: geo.p1.lat, alng: geo.p1.lng, b: near(geo.p2)?.id, blat: geo.p2.lat, blng: geo.p2.lng };
    const f = v || init() || {};
    const set = (k, val) => setV({ ...f, [k]: val });
    const save = async () => {
        const A = houses.find((h) => h.id === Number(f.a)), B = houses.find((h) => h.id === Number(f.b));
        if (!A || !B) return toast('Pick two plots', 'error');
        try {
            await put('settings/geo', { p1: { x: A.mx, y: A.my, lat: Number(f.alat), lng: Number(f.alng) }, p2: { x: B.mx, y: B.my, lat: Number(f.blat), lng: Number(f.blng) } });
            toast('GPS reference saved — Navigate links now use it'); map.reload();
        } catch (e) { toast(e.message, 'error'); }
    };
    const row = (k, label) => (
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px]">
            <select className="input" disabled={!edit} value={f[k] || ''} onChange={(e) => set(k, e.target.value)}><option value="">{label}</option>{houses.map((h) => <option key={h.id} value={h.id}>Plot {h.label}</option>)}</select>
            <input className="input" disabled={!edit} placeholder="Latitude" value={f[k + 'lat'] ?? ''} onChange={(e) => set(k + 'lat', e.target.value)} />
            <input className="input" disabled={!edit} placeholder="Longitude" value={f[k + 'lng'] ?? ''} onChange={(e) => set(k + 'lng', e.target.value)} />
        </div>
    );
    return (
        <div className="card mt-4 p-5">
            <div className="flex flex-wrap items-center gap-4">
                <Navigation className="text-brand-600" />
                <div className="flex-1 text-sm"><div className="font-bold">Map location (GPS) for emergency navigation</div><div className="text-ink/55">Pick two plots far apart, stand at each (or long-press it in Google Maps) and enter its latitude / longitude. Every plot then gets an exact “Navigate” link.</div></div>
                {!open && <button className="btn-outline" onClick={() => setOpen(true)}>Set up</button>}
            </div>
            {open && (!map.data ? <div className="mt-4"><Spinner /></div> : (
                <div className="mt-4 space-y-2">
                    {geo?.note && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{geo.note}</div>}
                    {row('a', 'First plot…')}
                    {row('b', 'Second plot…')}
                    {edit && <button className="btn-primary" onClick={save}>Save GPS reference</button>}
                </div>
            ))}
        </div>
    );
}

export default function SettingsPage() {
    const { can, refresh, isSuper } = useAuth();
    const s = useGet('settings');
    const toast = useToast();
    const edit = can('settings', true);
    if (!s.data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
    const n = (name, label) => ({ name, label, type: 'number', min: 0, half: true, required: true, disabled: !edit });
    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader icon={Settings} title="System Settings" subtitle={edit ? 'Community-wide configuration.' : 'Read only — only a Super Admin can change settings.'} />
            <div className="card p-5">
                <Form initial={s.data} submitLabel="Save settings" onSubmit={async (v) => { if (!edit) return; s.setData(await put('settings', v)); toast('Settings saved'); refresh(); }} fields={[
                    { name: 'community_name', label: 'Community name', required: true, disabled: !edit }, { name: 'address', label: 'Address', disabled: !edit, half: true }, { name: 'helpline', label: 'Office helpline', disabled: !edit, half: true },
                    n('visitor_max_stay_minutes', 'Default visitor stay (minutes)'), n('visitor_approval_timeout_minutes', 'Gate approval wait alert (minutes)'),
                    { name: 'visitor_approval_required', label: 'Visitors need household approval by default', type: 'checkbox', disabled: !edit },
                    n('event_warning_minutes', 'Event warning before end (minutes)'), n('event_grace_minutes', 'Event grace period (minutes)'),
                    n('library_loan_days', 'Library loan days'), n('library_fine_per_day', 'Library fine per day (Rs)'),
                    n('late_fee_percent', 'Late payment fee (%)'), n('gym_due_reminder_days', 'Gym due reminder (days before)'),
                    n('work_day_minutes', 'Staff work day (minutes)'), n('late_grace_minutes', 'Late arrival grace (minutes)'),
                    { name: 'payment_title', label: 'Payments: account title', disabled: !edit, half: true }, { name: 'payment_bank', label: 'Bank', disabled: !edit, half: true },
                    { name: 'payment_account', label: 'Account no.', disabled: !edit, half: true }, { name: 'payment_iban', label: 'IBAN', disabled: !edit, half: true },
                    { name: 'payment_wallet', label: 'JazzCash / Easypaisa', disabled: !edit },
                    { name: 'emergency_contacts', label: 'Emergency contacts (one per line)', type: 'textarea', rows: 5, disabled: !edit },
                ]} />
            </div>
            <GeoCard edit={edit} toast={toast} />
            <Link to="/automations" className="card mt-4 flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
                <Workflow className="text-brand-600" />
                <div className="flex-1 text-sm"><div className="font-bold">Automations</div><div className="text-ink/55">Reminders, escalations, auto-assignment, card blocking and the daily digest — switch each rule on or off.</div></div>
                <span className="text-sm font-semibold text-brand-600">Open →</span>
            </Link>
            {isSuper && (
                <div className="card mt-4 flex flex-wrap items-center gap-4 p-5">
                    <MapIcon className="text-brand-600" />
                    <div className="flex-1 text-sm"><div className="font-bold">3D map site plan — Gulistan-e-Jauhar Block 19</div><div className="text-ink/55">Places a household on every plot of the society plan (North 1–157, East 101–236, West blocks). Existing houses keep their data; missing plots are created empty.</div></div>
                    <button className="btn-outline" onClick={async () => { if (!window.confirm('Load the Block 19 site plan into the 3D map?')) return; try { const r = await post('settings/site-plan'); toast(`Site plan loaded — ${r.plots} plots, ${r.created} new, ${r.renumbered} renumbered`); } catch (e) { toast(e.message, 'error'); } }}>Load site plan</button>
                </div>
            )}
        </div>
    );
}
