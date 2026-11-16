import { useState } from 'react';
import { Activity, CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { PageHeader, useToast } from '../../components/ui';
import { dt, papi } from '../../lib/api';
import { Loading, Panel, usePlatform } from './kit';

function Row({ label, value }) {
    return <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-ink/55">{label}</span><span className="text-right font-medium">{value ?? '—'}</span></div>;
}

/** Server, database and setup checks at a glance. */
export default function System({ owner }) {
    const [d, reload] = usePlatform('system');
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    if (!d) return <Loading />;
    const ok = d.checks.filter((c) => c.ok).length;
    const clear = async () => { setBusy(true); try { await papi.post('system/clear-cache'); toast('Caches cleared', 'success'); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false); };

    return (
        <div>
            <PageHeader icon={Activity} title="System health" subtitle={`${ok} of ${d.checks.length} checks pass.`}>
                <button className="btn-outline" onClick={reload}><RefreshCw size={15} />Check again</button>
                {owner && <button className="btn-outline" onClick={clear} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}Clear caches</button>}
            </PageHeader>
            <div className="grid items-start gap-5 lg:grid-cols-3">
                <Panel title="Checks" className="lg:row-span-2">
                    <ul className="space-y-2.5">
                        {d.checks.map((c) => (
                            <li key={c.label} className="flex items-center gap-2.5 text-sm">
                                {c.ok ? <CheckCircle2 size={17} className="shrink-0 text-emerald-600" /> : <XCircle size={17} className="shrink-0 text-red-500" />}
                                <span className={c.ok ? '' : 'font-semibold text-red-700'}>{c.label}</span>
                            </li>
                        ))}
                    </ul>
                    {d.database.pending.length > 0 && <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">Pending: {d.database.pending.join(', ')}</div>}
                </Panel>
                <Panel title="Application">
                    <Row label="PHP" value={d.app.php} /><Row label="Laravel" value={d.app.laravel} /><Row label="Environment" value={d.app.env} />
                    <Row label="Address" value={d.app.url} /><Row label="Server timezone" value={d.app.timezone} />
                </Panel>
                <Panel title="Database">
                    <Row label="Driver" value={d.database.driver} /><Row label="Size" value={d.database.size_mb !== null ? `${d.database.size_mb} MB` : null} /><Row label="Migrations run" value={d.database.migrations} />
                    {Object.entries(d.database.rows).map(([t, n]) => <Row key={t} label={t.replace('_', ' ')} value={Number(n).toLocaleString('en-US')} />)}
                </Panel>
                <Panel title="Storage">
                    <Row label="Uploaded files" value={`${d.storage.uploads_mb} MB`} /><Row label="Free disk" value={d.storage.disk_free_gb !== null ? `${d.storage.disk_free_gb} GB` : null} />
                </Panel>
                <Panel title="Services">
                    <Row label="Payments" value={d.services.payments} /><Row label="Last billing event" value={d.services.last_billing_event ? dt(d.services.last_billing_event) : 'none yet'} />
                    <Row label="Mail" value={d.services.mail} /><Row label="Cache" value={d.services.cache} /><Row label="Sessions" value={d.services.session} /><Row label="Queue" value={d.services.queue} />
                </Panel>
            </div>
        </div>
    );
}
