import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer, Plus, Ban, Printer, Car, LogIn, LogOut, Siren, MapPin, Clock, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useList, useGet, Table, Badge, Modal, Form, SearchBox, Select, useAction, useToast } from '../../components/ui';
import { post, dt, duration, title, ago } from '../../lib/api';
import { useLive } from '../../lib/alerts';
import GateSlip from './GateSlip';

/* ---------------- Temporary access: everyone inside on a time-limited permission ---------------- */

function TimeBar({ from, to }) {
    const [, f] = useState(0);
    useEffect(() => { const i = setInterval(() => f((x) => x + 1), 20000); return () => clearInterval(i); }, []);
    const a = new Date(from).getTime(), b = new Date(to).getTime(), now = Date.now();
    const pct = Math.max(0, Math.min(100, ((now - a) / Math.max(1, b - a)) * 100));
    const left = Math.round((b - now) / 60000);
    const tone = left < 0 ? 'bg-red-500' : left < 30 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
        <div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${left < 0 ? 100 : pct}%` }} /></div>
            <div className={`mt-1 flex justify-between text-[11px] font-semibold ${left < 0 ? 'text-red-600' : left < 30 ? 'text-amber-600' : 'text-ink/50'}`}>
                <span>{left < 0 ? `Overstay ${Math.abs(left) >= 60 ? Math.floor(Math.abs(left) / 60) + 'h ' : ''}${Math.abs(left) % 60}m` : `${left >= 60 ? Math.floor(left / 60) + 'h ' : ''}${left % 60}m left`}</span>
                <span>until {new Date(to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        </div>
    );
}

export function TemporaryTab({ manage, isResident }) {
    const list = useList('visitors', { status: 'inside', per_page: 100 });
    const act = useAction();
    const [slip, setSlip] = useState(null);
    useLive('security', list.reload);
    const rows = list.rows.filter((v) => v.expected_exit_at).sort((a, b) => new Date(a.expected_exit_at) - new Date(b.expected_exit_at));
    const extend = (v, m) => act(() => post(`visitors/${v.id}/extend`, { minutes: m }), `Extended by ${m >= 60 ? m / 60 + 'h' : m + 'm'}`, list.reload);
    const revoke = (v) => { const r = window.prompt(`End access for ${v.name} now? Reason (optional)`); if (r !== null) act(() => post(`visitors/${v.id}/revoke`, { reason: r }), 'Access revoked — gate alerted', list.reload); };
    return (
        <>
            <div className="mb-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
                <b>Temporary access</b> — every visitor gets a limited time. {isResident ? 'You can give your visitor more time or end the access.' : 'Extend or revoke here; overstays alert the gate and the household automatically.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((v) => (
                    <div key={v.id} className={`card p-4 ${new Date(v.expected_exit_at) < new Date() ? 'ring-2 ring-red-400' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><div className="truncate font-bold">{v.name}</div><div className="truncate text-xs text-ink/55">{title(v.category)} · {v.purpose}</div></div>
                            {v.access_type === 'emergency' ? <Badge value="urgent">Emergency</Badge> : <span className="font-mono text-[11px] font-bold text-ink/45">{v.token}</span>}
                        </div>
                        <div className="my-2 text-xs text-ink/55">{[v.house && 'Plot ' + v.house.label, v.vehicle_no, v.gate, 'in ' + dt(v.entry_at)].filter(Boolean).join(' · ')}</div>
                        <TimeBar from={v.entry_at} to={v.expected_exit_at} />
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {(isResident || manage) && [30, 60, 120].map((m) => <button key={m} className="btn-outline btn-sm" onClick={() => extend(v, m)}><Plus size={12} />{m >= 60 ? m / 60 + 'h' : m + 'm'}</button>)}
                            {(isResident || manage) && <button className="btn-ghost btn-sm text-red-600" onClick={() => revoke(v)}><Ban size={12} />End now</button>}
                            {v.token && <button className="btn-ghost btn-sm ml-auto" onClick={() => setSlip(v)}><Printer size={12} />Slip</button>}
                        </div>
                    </div>
                ))}
                {!rows.length && !list.loading && <div className="card col-span-full p-8 text-center text-sm text-ink/45"><Timer className="mx-auto mb-2 text-ink/25" size={30} />Nobody is inside on temporary access.</div>}
            </div>
            <Modal open={!!slip} onClose={() => setSlip(null)} title="Gate slip">{slip && <GateSlip initial={slip} />}</Modal>
        </>
    );
}

/* ---------------- Vehicle register: every plate in / out ---------------- */

export function VehicleRegister({ manage, isResident, houses, gates }) {
    const list = useList('gate/vehicle-logs', {});
    const act = useAction();
    const toast = useToast();
    const [f, setF] = useState({ plate: '', vehicle_type: 'car', kind: 'visitor', house_id: '', gate: gates?.[0] || 'Main Gate', driver: '' });
    useLive('security', list.reload);
    const move = async (e) => {
        e?.preventDefault();
        if (!f.plate.trim()) return;
        const r = await act(() => post('gate/vehicle-logs', f));
        if (r) { toast(r.action === 'entry' ? `${r.log.plate} entered` : `${r.log.plate} left`, 'success', r.log.watchlist_hit ? '⚠ Watchlist vehicle — supervisor alerted' : undefined); setF({ ...f, plate: '', driver: '' }); list.reload(); }
    };
    const inside = list.rows.filter((l) => l.status === 'inside').length;
    return (
        <div className="mb-6">
            {manage && (
                <form onSubmit={move} className="card mb-3 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_.8fr_.8fr_1fr_.8fr_auto]">
                    <input className="input font-mono text-base font-bold uppercase" placeholder="Plate no." value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} autoFocus />
                    <select className="input" value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value })}>{['car', 'bike', 'rickshaw', 'van', 'suv', 'truck', 'other'].map((x) => <option key={x} value={x}>{title(x)}</option>)}</select>
                    <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['visitor', 'resident', 'staff', 'service', 'emergency'].map((x) => <option key={x} value={x}>{title(x)}</option>)}</select>
                    <select className="input" value={f.house_id} onChange={(e) => setF({ ...f, house_id: e.target.value })}><option value="">House (optional)</option>{houses.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}</select>
                    <select className="input" value={f.gate} onChange={(e) => setF({ ...f, gate: e.target.value })}>{(gates || ['Main Gate']).map((g) => <option key={g}>{g}</option>)}</select>
                    <button className="btn-primary"><Car size={15} />In / Out</button>
                    <p className="text-[11px] text-ink/45 sm:col-span-2 lg:col-span-6">Type the plate and press enter — if the vehicle is inside it is checked out, otherwise it is checked in. Resident stickers are matched automatically; blacklisted plates are blocked.</p>
                </form>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="font-bold">Vehicle entry register</div><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{inside} inside</span>
                <div className="ml-auto flex gap-2"><SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="Plate, driver…" />
                    <Select value={list.params.status} onChange={(status) => list.set({ status })} placeholder="All" options={['inside', 'exited']} />
                    <Select value={list.params.kind} onChange={(kind) => list.set({ kind })} placeholder="All types" options={['resident', 'visitor', 'staff', 'service', 'emergency']} /></div>
            </div>
            <Table list={list} empty="No vehicle movements yet." columns={[
                { label: 'Plate', render: (l) => <div className="flex items-center gap-2"><span className="rounded-md border-2 border-ink/80 bg-surface px-2 py-0.5 font-mono text-xs font-bold">{l.plate}</span>{l.watchlist_hit && <Ban size={13} className="text-red-600" />}</div> },
                { label: 'Type', render: (l) => <div><Badge value={l.kind === 'emergency' ? 'urgent' : l.kind === 'resident' ? 'approved' : 'normal'}>{title(l.kind)}</Badge><div className="mt-0.5 text-[11px] text-ink/45">{title(l.vehicle_type || '')}</div></div> },
                !isResident && { label: 'House', render: (l) => l.house?.label || '—' },
                { label: 'Driver / visitor', render: (l) => l.driver || l.visitor?.name || '—' },
                { label: 'In', render: (l) => <span className="flex items-center gap-1 text-xs"><ArrowDownLeft size={12} className="text-emerald-600" />{dt(l.entry_at)}</span> },
                { label: 'Out', render: (l) => l.exit_at ? <span className="flex items-center gap-1 text-xs"><ArrowUpRight size={12} className="text-ink/45" />{dt(l.exit_at)}</span> : <span className="text-xs font-semibold text-emerald-700">inside · {duration(l.entry_at)}</span> },
                { label: 'Gate', key: 'gate' },
                manage && { label: '', className: 'text-right', render: (l) => l.status === 'inside' && <button className="btn-outline btn-sm" onClick={() => act(() => post('gate/vehicle-logs', { plate: l.plate, direction: 'out' }), `${l.plate} left`, list.reload)}><LogOut size={12} />Out</button> },
            ].filter(Boolean)} />
        </div>
    );
}

/* ---------------- Emergency priority access ---------------- */

const SERVICES = [
    ['ambulance', '🚑', 'Ambulance', 'bg-red-600'], ['fire', '🚒', 'Fire brigade', 'bg-orange-600'], ['police', '🚓', 'Police', 'bg-blue-700'],
    ['rescue', '🛟', 'Rescue 1122', 'bg-rose-700'], ['utility', '⚡', 'Gas / electric', 'bg-amber-600'], ['other', '⚠️', 'Other service', 'bg-slate-700'],
];

export function EmergencyTab({ manage, houses, gates }) {
    const nav = useNavigate();
    const list = useList('visitors', { category: 'emergency', per_page: 50 });
    const sos = useList('sos');
    const act = useAction();
    const toast = useToast();
    const [svc, setSvc] = useState(null);
    useLive(['security', 'emergency'], () => { list.reload(); sos.reload(); });
    const activeSos = sos.rows.filter((s) => s.status !== 'resolved');
    const inside = list.rows.filter((v) => v.status === 'inside');
    return (
        <>
            <div className="mb-4 rounded-2xl bg-red-600 p-4 text-white shadow-lg shadow-red-600/20">
                <div className="flex items-center gap-2 text-lg font-black"><Siren size={22} />Emergency priority entry</div>
                <p className="text-sm text-white/80">No approval, no slip queue — open the barrier, log it in one tap. The house, admins and all guards are alerted and the route is shown on the map.</p>
                {activeSos.length > 0 && <div className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">🆘 Active SOS: {activeSos.map((s) => `${title(s.type)} at ${s.house ? 'Plot ' + s.house.block + '-' + s.house.house_no : '?'}`).join(' · ')}</div>}
            </div>
            {manage && (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {SERVICES.map(([k, icon, label, bg]) => (
                        <button key={k} onClick={() => setSvc(k)} className={`${bg} flex flex-col items-center gap-1 rounded-2xl py-5 text-white shadow-md transition hover:scale-[1.02] active:scale-95`}>
                            <span className="text-4xl">{icon}</span><span className="text-sm font-bold">{label}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="mb-2 font-bold">Emergency vehicles inside ({inside.length})</div>
            <div className="grid gap-3 md:grid-cols-2">
                {inside.map((v) => (
                    <div key={v.id} className="card flex items-center gap-3 p-4 ring-2 ring-red-400">
                        <span className="text-3xl">{SERVICES.find((s) => s[0] === v.emergency_service)?.[1] || '🚨'}</span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-bold">{v.name}</div>
                            <div className="text-xs text-ink/55">{[v.house && 'Plot ' + v.house.label, v.vehicle_no, v.persons + ' crew', 'in ' + ago(v.entry_at)].filter(Boolean).join(' · ')}</div>
                        </div>
                        {v.house_id && <button className="btn-outline btn-sm" onClick={() => nav(`/map?house=${v.house_id}&route=1`)}><MapPin size={13} />Route</button>}
                        {manage && <button className="btn-outline btn-sm" onClick={() => act(() => post(`visitors/${v.id}/checkout`), 'Exit recorded', list.reload)}><LogOut size={13} />Exit</button>}
                    </div>
                ))}
                {!inside.length && <div className="card col-span-full p-6 text-center text-sm text-ink/45">No emergency vehicle inside.</div>}
            </div>
            <div className="mb-2 mt-6 font-bold">History</div>
            <Table list={{ ...list, rows: list.rows.filter((v) => v.status !== 'inside') }} empty="No emergency entries yet." columns={[
                { label: 'Service', render: (v) => v.name },
                { label: 'Destination', render: (v) => v.house?.label ? 'Plot ' + v.house.label : v.remarks || '—' },
                { label: 'Vehicle', key: 'vehicle_no' },
                { label: 'In', render: (v) => dt(v.entry_at) },
                { label: 'Time inside', render: (v) => v.exit_at ? duration(v.entry_at, v.exit_at) : '—' },
            ]} />
            <Modal open={!!svc} onClose={() => setSvc(null)} title={`${SERVICES.find((s) => s[0] === svc)?.[1] || ''} ${SERVICES.find((s) => s[0] === svc)?.[2] || ''} — priority entry`}>
                {svc && <Form submitLabel="Open gate & alert everyone" initial={{ house_id: activeSos[0]?.house_id || '', gate: gates?.[0] || 'Main Gate', crew: 2 }} onSubmit={async (v) => {
                    const r = await post('gate/emergency', { ...v, service: svc });
                    toast('Priority entry logged — house & guards alerted', 'success');
                    setSvc(null); list.reload();
                    if (r.house_id) nav(`/map?house=${r.house_id}&route=1`);
                }} fields={[
                    { name: 'house_id', label: 'Going to house', type: 'select', options: houses, hint: activeSos.length ? 'Pre-filled from the active SOS' : undefined },
                    { name: 'location', label: 'Or location (park, mosque, street…)', half: true }, { name: 'gate', label: 'Gate', type: 'select', options: gates || ['Main Gate'], half: true },
                    { name: 'vehicle_no', label: 'Vehicle no.', half: true }, { name: 'crew', label: 'Crew', type: 'number', min: 1, half: true },
                    { name: 'contact', label: 'In-charge name / phone' }, { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
                ]} />}
            </Modal>
        </>
    );
}
