import { useState } from 'react';
import { Workflow, Play, Zap, Clock, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useGet, PageHeader, Spinner, useToast, Stat } from '../components/ui';
import { post, put, ago, title } from '../lib/api';
import { useLive } from '../lib/alerts';

const LABELS = {
    complaint_workers: ['Default worker per category', 'textarea', 'One per line: category = Worker name | phone'],
    complaint_escalate_hours: ['Escalate after (hours)', 'number'],
    visitor_approval_timeout_minutes: ['Wait for household (minutes)', 'number'],
    visitor_auto_reject: ['Auto-reject when no answer', 'bool'],
    visitor_max_stay_minutes: ['Default allowed stay (minutes)', 'number'],
    event_warning_minutes: ['Warn before end (minutes)', 'number'],
    event_grace_minutes: ['Grace after end (minutes)', 'number'],
    maintenance_due_day: ['Due day of month', 'number'],
    gym_due_reminder_days: ['Remind days before expiry', 'number'],
    gym_auto_block_days: ['Block card after (days unpaid, 0 = never)', 'number'],
    staff_auto_checkout_hours: ['Auto check-out after shift (hours, 0 = off)', 'number'],
    staff_absent_alert: ['Alert HR about absent staff', 'bool'],
    late_grace_minutes: ['Late grace (minutes)', 'number'],
    noc_sla_days: ['Flag after days without progress', 'number'],
};

function Switch({ on, onChange, disabled }) {
    return (
        <button type="button" disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-brand-600' : 'bg-ink/20'}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
    );
}

function RuleCard({ r, canEdit, onSaved }) {
    const [vals, setVals] = useState(r.settings);
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const dirty = JSON.stringify(vals) !== JSON.stringify(r.settings);
    const save = async (patch) => {
        setBusy(true);
        try { await put('settings', patch); toast('Saved'); onSaved(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
    };
    return (
        <div className={`card flex flex-col p-4 transition ${r.enabled ? '' : 'opacity-70'}`}>
            <div className="flex items-start gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${r.enabled ? 'bg-brand-50 text-brand-600' : 'bg-ink/5 text-ink/40'}`}><Zap size={18} /></span>
                <div className="min-w-0 flex-1">
                    <div className="font-bold">{r.title}</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink/60">{r.description}</p>
                </div>
                {r.toggle ? <Switch on={r.enabled} disabled={!canEdit || busy} onChange={(v) => save({ [r.toggle]: v })} /> : <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-ink/5 text-ink/45'}`}>{r.enabled ? 'ON' : 'OFF'}</span>}
            </div>
            {Object.keys(vals).length > 0 && (
                <div className="mt-3 grid gap-2">
                    {Object.entries(vals).map(([k, v]) => {
                        const [label, type, hint] = LABELS[k] || [title(k), typeof v === 'boolean' ? 'bool' : 'number'];
                        return (
                            <label key={k} className="block">
                                <span className="label">{label}</span>
                                {type === 'textarea' ? <textarea className="input font-mono text-xs" rows={5} disabled={!canEdit} value={v ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
                                    : type === 'bool' ? <div className="flex items-center gap-2"><Switch on={!!v} disabled={!canEdit} onChange={(nv) => setVals({ ...vals, [k]: nv })} /><span className="text-xs text-ink/55">{v ? 'Yes' : 'No'}</span></div>
                                        : <input type="number" min={0} className="input w-32" disabled={!canEdit} value={v ?? 0} onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })} />}
                                {hint && <span className="mt-0.5 block text-[11px] text-ink/40">{hint}</span>}
                            </label>
                        );
                    })}
                    {dirty && canEdit && <button className="btn-primary btn-sm justify-self-start" disabled={busy} onClick={() => save(vals)}><Save size={13} />Save</button>}
                </div>
            )}
            <div className="mt-auto flex items-center justify-between border-t border-ink/5 pt-3 text-xs text-ink/50" style={{ marginTop: 'max(auto, 12px)' }}>
                <span className="flex items-center gap-1"><CheckCircle2 size={13} className="text-emerald-600" />{r.actions_7d} action{r.actions_7d === 1 ? '' : 's'} in 7 days</span>
                <span className="flex items-center gap-1"><Clock size={12} />{r.last_action ? ago(r.last_action) : 'no action yet'}</span>
            </div>
        </div>
    );
}

export default function AutomationsPage() {
    const { data, reload, setData } = useGet('automations');
    const [running, setRunning] = useState(false);
    const toast = useToast();
    useLive(['settings', 'complaints', 'security', 'crm', 'gym', 'finance', 'noc', 'library', 'inventory', 'events'], reload);
    if (!data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
    const total = data.rules.reduce((a, r) => a + r.actions_7d, 0);
    const run = async () => { setRunning(true); try { setData(await post('automations/run')); toast('All automations checked'); } finally { setRunning(false); } };

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={Workflow} title="Automations" subtitle="Rules that run by themselves — reminders, escalations, auto-assignment, card blocking, daily digest. They check every few seconds, no cron needed.">
                <button className="btn-primary" onClick={run} disabled={running}>{running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}Run all now</button>
            </PageHeader>
            {!data.can_edit && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Only the Super Admin can change automation settings. You can see what they do and run them.</div>}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Rules switched on" value={`${data.rules.filter((r) => r.enabled).length} / ${data.rules.length}`} icon={Zap} />
                <Stat label="Automatic actions (7 days)" value={total} icon={CheckCircle2} tone="green" />
                <Stat label="Workers for auto-assign" value={Object.keys(data.workers).length} tone="sand" />
                <Stat label="Last action" value={data.recent[0] ? ago(data.recent[0].created_at) : '—'} icon={Clock} tone="blue" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
                <div className="grid gap-3 md:grid-cols-2">
                    {data.rules.map((r) => <RuleCard key={r.key + JSON.stringify(r.settings) + r.enabled} r={r} canEdit={data.can_edit} onSaved={reload} />)}
                </div>
                <div className="card h-fit p-4">
                    <div className="mb-2 font-bold">Recent automatic actions</div>
                    {!data.recent.length && <div className="py-6 text-center text-sm text-ink/45">Nothing yet — actions appear here as rules fire.</div>}
                    {data.recent.map((r) => (
                        <div key={r.id} className="border-b border-ink/5 py-2 text-sm last:border-0">
                            <div className="font-medium">{r.summary}</div>
                            <div className="text-[11px] text-ink/45">{data.rules.find((x) => x.key === r.rule)?.title || r.rule} · {ago(r.created_at)}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
