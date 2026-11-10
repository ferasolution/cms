import { Settings, Map as MapIcon } from 'lucide-react';
import { useGet, PageHeader, Form, Spinner, useToast } from '../components/ui';
import { put, post } from '../lib/api';
import { useAuth } from '../lib/auth';

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
            {isSuper && (
                <div className="card mt-4 flex flex-wrap items-center gap-4 p-5">
                    <MapIcon className="text-brand-600" />
                    <div className="flex-1 text-sm"><div className="font-bold">3D map site plan — Gulistan-e-Jauhar Block 19</div><div className="text-ink/55">Places a household on every plot of the society plan (North 1–157, East 101–236, West blocks). Existing houses keep their data; missing plots are created empty.</div></div>
                    <button className="btn-outline" onClick={async () => { if (!window.confirm('Load the Block 19 site plan into the 3D map?')) return; try { const r = await post('settings/site-plan'); toast(`Site plan loaded — ${r.plots} plots, ${r.created} new houses`); } catch (e) { toast(e.message, 'error'); } }}>Load site plan</button>
                </div>
            )}
        </div>
    );
}
