import { Siren, Phone, MapPin, Check, Truck } from 'lucide-react';
import { useList, PageHeader, Table, Badge, useAction } from '../components/ui';
import { post, dt, ago, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const ICON = { medical: '🚑', fire: '🔥', security: '🚨', other: '⚠️' };

export default function Emergency() {
    const { can, isResident, user } = useAuth();
    const respond = can('emergency', true) || can('security', true);
    const list = useList('sos');
    const act = useAction();
    useLive(['emergency', 'security'], list.reload);
    const active = list.rows.filter((s) => s.status !== 'resolved');

    return (
        <div className="mx-auto max-w-6xl">
            <PageHeader icon={Siren} title="Emergency & SOS" subtitle={isResident ? 'Use the red SOS button (top right) in any emergency. Your calls are listed here.' : 'Live SOS calls with household & location. Respond, then resolve.'} />
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-2">
                    {active.length === 0 && <div className="card p-6 text-center text-sm text-ink/50">✅ No active emergencies.</div>}
                    {active.map((s) => (
                        <div key={s.id} className={`card overflow-hidden ${s.status === 'active' ? 'ring-2 ring-red-500' : 'ring-2 ring-amber-400'}`}>
                            <div className={`flex items-center justify-between px-5 py-3 text-white ${s.status === 'active' ? 'animate-pulse bg-red-600' : 'bg-amber-600'}`}>
                                <span className="text-lg font-bold">{ICON[s.type]} {s.type.toUpperCase()} — {s.status === 'active' ? 'NEEDS RESPONSE' : 'RESPONDING'}</span><span className="text-sm">{ago(s.created_at)}</span>
                            </div>
                            <div className="grid gap-3 p-5 text-sm sm:grid-cols-2">
                                <div><div className="text-[11px] font-semibold text-ink/45">Caller</div><div className="font-semibold">{s.user?.name}</div>{s.user?.phone && <a href={`tel:${s.user.phone}`} className="inline-flex items-center gap-1 text-brand-600"><Phone size={13} />{s.user.phone}</a>}</div>
                                <div><div className="text-[11px] font-semibold text-ink/45">Location</div><div className="font-semibold">{s.house ? `House ${s.house.block}-${s.house.house_no}, ${s.house.street || ''}` : 'Not linked to a house'}</div>
                                    {s.lat && <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${s.lat},${s.lng}`} className="inline-flex items-center gap-1 text-brand-600"><MapPin size={13} />Open GPS location</a>}</div>
                                {s.message && <div className="sm:col-span-2 rounded-xl bg-ink/[.03] p-3">“{s.message}”</div>}
                                {s.responder && <div className="sm:col-span-2 text-ink/60">Responder: <b>{s.responder.name}</b> since {dt(s.responded_at)}</div>}
                                <div className="flex gap-2 sm:col-span-2">
                                    {respond && s.status === 'active' && <button className="btn-danger" onClick={() => act(() => post(`sos/${s.id}`, { status: 'responding' }), 'Marked responding — caller notified', list.reload)}><Truck size={15} />I'm responding</button>}
                                    {(respond || s.user_id === user.id) && <button className="btn-outline" onClick={() => { const r = window.prompt(s.user_id === user.id && !respond ? 'Cancel SOS — reason?' : 'Resolution notes'); if (r !== null) act(() => post(`sos/${s.id}`, { status: 'resolved', resolution: r }), 'Resolved', list.reload); }}><Check size={15} />{s.user_id === user.id && !respond ? 'Cancel my SOS' : 'Resolve'}</button>}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div className="pt-2 font-bold">History</div>
                    <Table list={{ ...list, rows: list.rows.filter((s) => s.status === 'resolved') }} empty="No past calls." columns={[
                        { label: 'Type', render: (s) => `${ICON[s.type]} ${title(s.type)}` },
                        { label: 'Caller', render: (s) => <div>{s.user?.name}<div className="text-xs text-ink/45">{s.house ? s.house.block + '-' + s.house.house_no : ''}</div></div> },
                        { label: 'Raised', render: (s) => dt(s.created_at) },
                        { label: 'Response time', render: (s) => s.responded_at ? Math.max(1, Math.round((new Date(s.responded_at) - new Date(s.created_at)) / 60000)) + ' min' : '—' },
                        { label: 'Resolution', key: 'resolution', className: 'max-w-64' },
                        { label: 'Status', render: () => <Badge value="resolved" /> },
                    ]} />
                </div>
                <div className="card h-fit p-5">
                    <div className="mb-3 font-bold">Emergency contacts</div>
                    {(list.data?.contacts || []).map((c) => {
                        const num = c.match(/[\d-]{2,}/)?.[0];
                        return <a key={c} href={num ? `tel:${num}` : undefined} className="flex items-center justify-between border-b border-ink/5 py-2.5 text-sm last:border-0 hover:text-brand-600"><span>{c}</span>{num && <Phone size={14} />}</a>;
                    })}
                </div>
            </div>
        </div>
    );
}
