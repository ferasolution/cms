import { useEffect, useState } from 'react';
import { ShieldCheck, Plus, LogOut, LogIn, Video, Camera, Clock, Users, QrCode, ScanLine, Car, Ban, AlertOctagon, Check, X, BellRing, Hourglass, Share2, Printer, Timer, Siren, Cctv, Footprints, CalendarClock, HardHat, ShieldAlert } from 'lucide-react';
import GateSlip from './security/GateSlip';
import { TemporaryTab, VehicleRegister, EmergencyTab } from './security/GateTabs';
import StaffTab from './security/StaffTab';
import CctvTab, { FootageLinks } from './security/CctvTab';
import PatrolTab from './security/PatrolTab';
import ShiftsTab from './security/ShiftsTab';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Stat, FileLink, Confirm, useAction, useHouses, useToast, Tabs, useTab, urlParam, QrImage, QrScanner } from '../components/ui';
import { post, put, del, dt, duration, title, UNIT, ID_LABEL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const CATS = ['visitor', 'guest', 'worker', 'relative', 'friend', 'delivery', 'contractor', 'staff', 'emergency', 'other'];
const STATUS_BADGE = { awaiting: 'pending', inside: 'inside', exited: 'exited', rejected: 'rejected' };
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Countdown({ to }) {
    const [, f] = useState(0);
    useEffect(() => { const i = setInterval(() => f((x) => x + 1), 30000); return () => clearInterval(i); }, []);
    if (!to) return null;
    const m = Math.round((new Date(to) - Date.now()) / 60000);
    return <span className={`text-[11px] font-semibold ${m < 0 ? 'text-red-600' : m < 30 ? 'text-amber-600' : 'text-ink/45'}`}>{m < 0 ? `overstay ${duration(to)}` : `${Math.floor(m / 60)}h ${m % 60}m left`}</span>;
}

function PassCard({ p }) {
    const share = () => {
        const text = `Visitor pass for ${p.visitor_name}\nCode: ${p.code}\nValid: ${dt(p.valid_from)} – ${dt(p.valid_until)}\nShow this code at the gate.`;
        if (navigator.share) navigator.share({ title: 'Visitor pass', text }).catch(() => {}); else { navigator.clipboard?.writeText(text); }
    };
    return (
        <div className="flex flex-col items-center gap-3 text-center">
            <QrImage text={p.code} size={200} />
            <div className="font-mono text-xl font-bold tracking-wider">{p.code}</div>
            <div className="text-sm"><b>{p.visitor_name}</b> · {title(p.category)}{p.persons > 1 ? ` · ${p.persons} persons` : ''}</div>
            <div className="text-xs text-ink/55">Valid {dt(p.valid_from)} → {dt(p.valid_until)} · max stay {Math.round(p.max_stay_minutes / 60 * 10) / 10}h{p.multi_use ? ' · multi-use' : ''}</div>
            <button className="btn-outline btn-sm" onClick={share}><Share2 size={13} />Share with visitor</button>
        </div>
    );
}

export default function Security() {
    const { can, approve, isResident, user } = useAuth();
    const manage = can('security', true);
    const [tab, setTab] = useTab(isResident ? 'approvals' : 'gate');
    const list = useList(['gate', 'approvals', 'log'].includes(tab) ? 'visitors' : null, { status: tab === 'approvals' ? 'awaiting' : tab === 'gate' ? 'inside' : '', q: urlParam('q') });
    const passes = useList(tab === 'passes' ? 'gate/passes' : null);
    const vehicles = useList(tab === 'vehicles' ? 'gate/vehicles' : null, { q: urlParam('q') });
    const watch = useList(tab === 'watchlist' ? 'gate/watchlist' : null);
    const incidents = useList(tab === 'incidents' ? 'gate/incidents' : null);
    const stats = useGet('visitors/stats');
    const ov = useGet('security/overview');
    const gates = ov.data?.gates?.length ? ov.data.gates : ['Main Gate', 'Gate 2'];
    const houses = useHouses(!isResident);
    const [modal, setModal] = useState(null);
    const [view, setView] = useState(null);
    const [scan, setScan] = useState(null);
    const act = useAction();
    const toast = useToast();
    const refresh = () => { list.reload(); stats.reload(); ov.reload(); passes.reload(); vehicles.reload(); watch.reload(); incidents.reload(); };
    useLive('security', refresh);

    const entryFields = [
        { name: 'name', label: 'Visitor name', required: true, half: true },
        { name: 'category', label: 'Type', type: 'select', options: CATS, required: true, half: true, default: 'visitor' },
        { name: 'house_id', label: 'Visiting household (HH)', type: 'select', options: houses, half: true },
        { name: 'purpose', label: 'Purpose of visit', required: true, half: true },
        { name: 'cnic', label: ID_LABEL, half: true, placeholder: '' },
        { name: 'phone', label: 'Phone', half: true },
        { name: 'vehicle_type', label: 'Vehicle type', type: 'select', options: ['car', 'bike', 'rickshaw', 'van', 'suv', 'truck', 'other'], half: true, placeholder: 'On foot' },
        { name: 'vehicle_no', label: 'Vehicle no.', half: true, show: (v) => !!v.vehicle_type },
        { name: 'persons', label: 'Persons', type: 'number', min: 1, default: 1, half: true },
        { name: 'gate', label: 'Gate', type: 'select', options: gates, default: gates[0], half: true },
        { name: 'stay_minutes', label: 'Allowed stay (minutes)', type: 'number', min: 5, half: true, placeholder: 'default from settings' },
        { name: 'request_approval', label: 'Ask the household to approve before entry', type: 'checkbox', default: true, show: (v) => v.house_id && !['emergency', 'staff'].includes(v.category) && !modal?.id && !v.pass_code },
        { name: 'pass_code', label: 'QR pass code (if visitor has one)', placeholder: 'VP-XXXXXX', show: () => !modal?.id },
        { name: 'photo', label: 'Photo', type: 'file', accept: 'image/*', capture: 'environment', half: true, placeholder: 'Take / choose photo' },
        { name: 'video', label: 'Video clip', type: 'file', accept: 'video/*', capture: 'environment', half: true, placeholder: 'Record (max 50MB)' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2 },
        { name: 'print_slip', label: 'Print the gate slip with QR right away', type: 'checkbox', default: true, show: () => !modal?.id },
    ];

    const save = async (v) => {
        const r = modal?.id ? await post(`visitors/${modal.id}`, v) : await post('visitors', v);
        toast(modal?.id ? 'Visitor updated' : r.status === 'awaiting' ? 'Household notified — waiting for approval' : 'Entry recorded', r.watchlist_hit ? 'warning' : 'success', r.watchlist_hit ? 'Watchlist match — supervisor alerted' : undefined);
        setModal(modal?.id ? null : { mode: 'slip', visitor: r, print: !!v.print_slip });
        refresh();
    };
    const respond = (v, decision) => act(() => post(`visitors/${v.id}/respond`, { decision, note: decision === 'reject' ? window.prompt('Reason (optional)') || '' : '' }), decision === 'approve' ? 'Approved — gate informed' : 'Rejected — gate informed', refresh);
    const doScan = (code) => post('gate/scan', { code }).then(setScan).catch((e) => setScan({ error: e.message }));

    const s = stats.data;
    const tabs = isResident
        ? [{ key: 'approvals', label: 'At the gate', icon: BellRing, count: s?.awaiting }, { key: 'log', label: 'My visitors', icon: Users }, { key: 'temporary', label: 'Time limits', icon: Timer, count: ov.data?.temporary },
            { key: 'passes', label: 'QR passes', icon: QrCode }, { key: 'staff', label: 'My staff', icon: HardHat, count: ov.data?.staff_inside }, { key: 'vehicles', label: 'My vehicles', icon: Car }]
        : [{ key: 'gate', label: 'Inside now', icon: Users, count: s?.inside }, { key: 'approvals', label: 'Awaiting approval', icon: Hourglass, count: s?.awaiting }, manage && { key: 'scan', label: 'Scanner', icon: ScanLine },
            { key: 'temporary', label: 'Temporary access', icon: Timer, count: ov.data?.temporary }, { key: 'log', label: 'Gate log', icon: Clock }, { key: 'passes', label: 'QR passes', icon: QrCode },
            { key: 'vehicles', label: 'Vehicles', icon: Car, count: ov.data?.vehicles_inside }, { key: 'staff', label: 'Domestic staff', icon: HardHat, count: ov.data?.staff_pending },
            manage && { key: 'emergency', label: 'Emergency access', icon: Siren, count: ov.data?.emergency_inside }, manage && { key: 'cctv', label: 'CCTV', icon: Cctv },
            manage && { key: 'patrol', label: 'Patrol', icon: Footprints }, manage && { key: 'shifts', label: 'Shifts', icon: CalendarClock },
            manage && { key: 'watchlist', label: 'Blacklist', icon: Ban }, manage && { key: 'incidents', label: 'Incidents', icon: AlertOctagon }];

    const visitorCols = [
        { label: 'Visitor', render: (v) => <div><div className="flex items-center gap-1 font-semibold">{v.watchlist_hit && <Ban size={13} className="text-red-600" />}{v.name}</div><div className="text-xs text-ink/50">{v.cnic || v.phone || ''}{v.pass ? ' · pass ' + v.pass.code : ''}</div></div> },
        { label: 'Type', render: (v) => <Badge value={v.category} /> },
        !isResident && { label: 'House', render: (v) => v.house?.label || '—' },
        { label: 'Purpose', key: 'purpose', className: 'max-w-48' },
        { label: 'Arrived', render: (v) => dt(v.entry_at || v.created_at) },
        { label: 'Stay', render: (v) => v.status === 'inside' ? <div><span className="font-semibold text-emerald-700">{duration(v.entry_at)}</span><div><Countdown to={v.expected_exit_at} /></div></div> : v.exit_at ? duration(v.entry_at, v.exit_at) : '—' },
        { label: 'Status', render: (v) => <div><Badge value={STATUS_BADGE[v.status]}>{v.status === 'awaiting' ? 'Waiting' : title(v.status)}</Badge>{v.responder && <div className="mt-0.5 text-[10px] text-ink/45">by {v.responder.name}</div>}</div> },
        { label: '', className: 'text-right', render: (v) => (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {v.video_path && <Video size={15} className="mt-1.5 text-brand-500" />}
                {v.status === 'awaiting' && (isResident || manage) && <>
                    <button className="btn-primary btn-sm" onClick={() => respond(v, 'approve')}><Check size={13} />{isResident ? 'Approve' : 'Admit'}</button>
                    <button className="btn-ghost btn-sm text-red-600" onClick={() => respond(v, 'reject')}><X size={13} /></button>
                </>}
                {v.token && v.status !== 'rejected' && <button className="btn-ghost btn-sm" title="Gate slip" onClick={() => setModal({ mode: 'slip', visitor: v })}><Printer size={13} /></button>}
                {manage && v.status === 'inside' && <button className="btn-outline btn-sm" onClick={() => act(() => post(`visitors/${v.id}/checkout`), `${v.name} checked out`, refresh)}><LogOut size={13} />Exit</button>}
            </div>
        ) },
    ].filter(Boolean);

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={ShieldCheck} title={isResident ? 'My Gate & Visitors' : 'Security Management'} subtitle={isResident ? 'Approve visitors at the gate, give or limit their time, pre-register guests, register your staff and vehicles.' : 'Walk-in entries with QR slips, approvals, time limits, vehicles, domestic staff, emergency access, CCTV, patrol and guard shifts — live.'}>
                {isResident && <button className="btn-primary" onClick={() => setModal({ mode: 'pass' })}><QrCode size={16} />Pre-register visitor</button>}
                {manage && <button className="btn-outline" onClick={() => { setTab('scan'); }}><ScanLine size={16} />Scan</button>}
                {manage && <button className="btn-danger" onClick={() => setTab('emergency')}><Siren size={16} />Emergency</button>}
                {manage && <button className="btn-primary" onClick={() => setModal({ mode: 'entry' })}><Plus size={16} />Walk-in entry</button>}
            </PageHeader>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Inside right now" value={s?.inside ?? '—'} icon={Users} tone="green" onClick={() => setTab(isResident ? 'log' : 'gate')} />
                <Stat label="Waiting at gate" value={s?.awaiting ?? '—'} icon={BellRing} tone={s?.awaiting ? 'red' : 'sand'} onClick={() => setTab('approvals')} />
                <Stat label="Overstaying" value={s?.overstay ?? '—'} icon={Hourglass} tone={s?.overstay ? 'red' : 'brand'} />
                <Stat label="Avg. stay (30 days)" value={s ? (s.avg_stay_minutes < 60 ? `${s.avg_stay_minutes}m` : `${Math.floor(s.avg_stay_minutes / 60)}h ${s.avg_stay_minutes % 60}m`) : '—'} icon={Clock} tone="blue" />
            </div>
            {ov.data && !isResident && (
                <div className="-mt-2 mb-5 flex flex-wrap gap-2 text-xs font-semibold">
                    {[[Car, `${ov.data.vehicles_inside} vehicles inside`, 'vehicles'], [HardHat, `${ov.data.staff_inside} staff inside`, 'staff'], [ShieldAlert, `${ov.data.on_duty ?? 0} guard${ov.data.on_duty === 1 ? "" : "s"} on duty`, 'shifts'],
                        [Footprints, ov.data.patrol_coverage == null ? 'Patrol not set up' : `Patrol coverage ${ov.data.patrol_coverage}%`, 'patrol'], [Cctv, `${ov.data.cameras ?? 0} cameras`, 'cctv']].map(([I, l, t]) => (
                        <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ring-ink/10 hover:bg-ink/[.04] ${t === 'patrol' && ov.data.patrol_coverage != null && ov.data.patrol_coverage < 70 ? 'bg-red-50 text-red-700' : t === 'shifts' && !ov.data.on_duty ? 'bg-red-50 text-red-700' : 'bg-surface'}`}><I size={13} />{l}</button>
                    ))}
                </div>
            )}

            <Tabs value={tab} onChange={(t) => { setTab(t); list.set({ status: t === 'approvals' ? 'awaiting' : t === 'gate' ? 'inside' : '' }); }} tabs={tabs} />

            {['gate', 'approvals', 'log'].includes(tab) && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder={`Name, ${ID_LABEL}, vehicle…`} />
                        {tab === 'log' && <Select value={list.params.status} onChange={(status) => list.set({ status })} placeholder="All" options={[{ value: 'inside', label: 'Inside' }, { value: 'overstay', label: 'Overstaying' }, { value: 'awaiting', label: 'Waiting' }, { value: 'exited', label: 'Exited' }, { value: 'rejected', label: 'Rejected' }]} />}
                        <Select value={list.params.category} onChange={(category) => list.set({ category })} placeholder="All types" options={CATS} />
                        {!isResident && <Select value={list.params.house_id} onChange={(house_id) => list.set({ house_id })} placeholder="All houses" options={houses} className="max-w-56" />}
                        {tab === 'log' && <input type="date" className="input w-auto" value={list.params.from || ''} onChange={(e) => list.set({ from: e.target.value })} title="From date" />}
                    </div>
                    {tab === 'approvals' && isResident && !list.rows.length && !list.loading && <div className="card mb-3 p-4 text-sm text-ink/60">Nobody is waiting at the gate for you. When security records a visitor for your house you will get an alert here and can approve or reject instantly.</div>}
                    {tab === 'approvals' ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {list.rows.map((v) => (
                                <div key={v.id} className="card overflow-hidden">
                                    <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700"><BellRing size={14} className="ringing" />At {v.gate || 'gate'} · waiting {duration(v.created_at)}</div>
                                    <div className="space-y-1 p-4 text-sm" onClick={() => setView(v)}>
                                        <div className="flex items-center gap-2 text-lg font-bold">{v.watchlist_hit && <Ban size={16} className="text-red-600" />}{v.name}</div>
                                        <div className="text-ink/60">{title(v.category)} · {v.purpose}</div>
                                        <div className="text-xs text-ink/45">{[!isResident && v.house?.label && 'House ' + v.house.label, v.phone, v.vehicle_no, v.persons > 1 && v.persons + ' persons'].filter(Boolean).join(' · ')}</div>
                                        {v.photo_path && <img src={`/files/${v.photo_path}`} className="mt-2 h-32 w-full rounded-xl object-cover" alt="" />}
                                    </div>
                                    {(isResident || manage) && (
                                        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                                            <button className="btn-primary py-3" onClick={() => respond(v, 'approve')}><Check size={16} />{isResident ? 'Approve' : 'Admit'}</button>
                                            <button className="btn-outline py-3 text-red-600" onClick={() => respond(v, 'reject')}><X size={16} />Reject</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {!list.rows.length && !list.loading && !isResident && <div className="card col-span-full p-6 text-center text-sm text-ink/45">Nobody waiting for approval.</div>}
                        </div>
                    ) : <Table list={list} empty={tab === 'gate' ? 'Nobody is inside right now.' : 'No visitors.'} onRow={setView} columns={visitorCols} />}
                </>
            )}

            {tab === 'passes' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={passes.params.q} onChange={(q) => passes.set({ q })} placeholder="Visitor, code…" />
                        <Select value={passes.params.status} onChange={(status) => passes.set({ status })} placeholder="All" options={['active', 'used', 'expired', 'cancelled']} />
                        {manage && <button className="btn-primary ml-auto" onClick={() => setModal({ mode: 'pass' })}><QrCode size={15} />New pass</button>}
                    </div>
                    <Table list={passes} empty="No visitor passes yet." onRow={(p) => setModal({ mode: 'showpass', pass: p })} columns={[
                        { label: 'Code', render: (p) => <span className="font-mono text-xs font-bold">{p.code}</span> },
                        { label: 'Visitor', render: (p) => <div><div className="font-semibold">{p.visitor_name}</div><div className="text-xs text-ink/50">{title(p.category)}{p.persons > 1 ? ` · ${p.persons} persons` : ''}</div></div> },
                        !isResident && { label: 'House', render: (p) => p.house?.label },
                        { label: 'Valid', render: (p) => <span className="text-xs">{dt(p.valid_from)} → {dt(p.valid_until)}</span> },
                        { label: 'Status', render: (p) => <Badge value={p.status === 'active' ? 'approved' : p.status === 'used' ? 'completed' : 'closed'}>{title(p.status)}</Badge> },
                        { label: '', className: 'text-right', render: (p) => p.status === 'active' && <span onClick={(e) => e.stopPropagation()}><Confirm className="btn-ghost btn-sm text-red-600" message="Cancel this pass?" onConfirm={() => act(() => post(`gate/passes/${p.id}/cancel`), 'Pass cancelled', refresh)}>Cancel</Confirm></span> },
                    ].filter(Boolean)} />
                </>
            )}

            {tab === 'scan' && (
                <div className="grid gap-5 lg:grid-cols-2">
                    <div className="card p-5">
                        <div className="mb-1 font-bold">Gate scanner</div>
                        <p className="mb-3 text-sm text-ink/55">One box for everything: <b>exit slip</b> (GV-…), visitor pass (VP-…), <b>staff card</b> (DS-…), event pass (EVT-…) or a <b>number plate</b>. USB / Bluetooth scanners work too.</p>
                        <QrScanner onResult={doScan} placeholder="GV-… / VP-… / DS-… / plate" />
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button className="btn-primary py-3" onClick={() => setModal({ mode: 'entry' })}><Plus size={15} />Walk-in entry</button>
                            <button className="btn-danger py-3" onClick={() => setTab('emergency')}><Siren size={15} />Emergency</button>
                        </div>
                    </div>
                    <div className={`card p-5 ${scan ? (scan.error ? 'ring-2 ring-red-400' : scan.valid ? 'ring-2 ring-emerald-500' : 'ring-2 ring-red-500') : ''}`}>
                        {!scan && <div className="grid h-full place-items-center py-10 text-sm text-ink/40"><ScanLine size={36} className="mb-2" />Result appears here</div>}
                        {scan?.error && <div className="text-center"><div className="text-4xl">❓</div><div className="mt-2 font-bold text-red-600">{scan.error}</div></div>}
                        {scan && !scan.error && (
                            <div className="space-y-3 text-sm">
                                <div className={`rounded-2xl p-4 text-center text-lg font-bold ${scan.valid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{scan.kind === 'exit' ? (scan.valid ? '✓ EXIT SLIP VALID' : '✗ SLIP NOT ACTIVE') : scan.kind === 'staff' && scan.inside ? '↩ STAFF LEAVING' : scan.valid ? '✓ ALLOW ENTRY' : '✗ DO NOT ALLOW'}<div className="text-xs font-semibold">{scan.reason}</div></div>
                                {scan.pass && <div><b>{scan.pass.visitor_name}</b> · {title(scan.pass.category)} → House {scan.pass.house?.label}<div className="text-xs text-ink/55">Registered by {scan.pass.creator?.name} · {scan.pass.persons} person(s){scan.pass.vehicle_no ? ' · ' + scan.pass.vehicle_no : ''}</div>
                                    {scan.valid && <button className="btn-primary mt-3 w-full" onClick={() => setModal({ mode: 'entry', name: scan.pass.visitor_name, category: scan.pass.category, house_id: scan.pass.house_id, purpose: scan.pass.purpose || 'Pre-registered visit', phone: scan.pass.phone, cnic: scan.pass.cnic, vehicle_no: scan.pass.vehicle_no, persons: scan.pass.persons, pass_code: scan.pass.code })}>Record entry</button>}</div>}
                                {scan.event && <div><b>{scan.event.title}</b> · {scan.event.venue}<div className="text-xs text-ink/55">Host {scan.event.house?.label} {scan.event.requester?.name} · {scan.event.guests} guests expected · {scan.event.checked_in} checked in</div>
                                    {scan.valid && <button className="btn-outline mt-3 w-full" onClick={() => post('gate/scan', { code: scan.event.code, checkin: true, guests: Number(window.prompt('How many guests entering?', '1') || 1) }).then((r) => { setScan(r); toast('Guests checked in'); })}>Check in guests</button>}</div>}
                                {scan.kind === 'vehicle' && <div>{scan.vehicle ? <><b>{scan.vehicle.plate}</b> · {scan.vehicle.make} {scan.vehicle.color}<div className="text-xs text-ink/55">Resident vehicle · House {scan.vehicle.house?.label} · slot {scan.vehicle.parking_slot || '—'}</div></> : <><b>{scan.plate}</b> — not a registered resident vehicle.</>}
                                    <div className="mt-1 text-xs text-ink/55">{scan.inside_log ? `Inside since ${dt(scan.inside_log.entry_at)}` : 'Not inside right now'}</div>
                                    <button className="btn-primary mt-3 w-full" onClick={() => act(() => post('gate/vehicle-logs', { plate: scan.vehicle?.plate || scan.plate, kind: scan.vehicle ? 'resident' : 'visitor', gate: gates[0] }), scan.inside_log ? 'Vehicle exit recorded' : 'Vehicle entry recorded', () => { setScan(null); refresh(); })}>{scan.inside_log ? <><LogOut size={15} />Record exit</> : <><LogIn size={15} />Record entry</>}</button></div>}
                                {scan.kind === 'exit' && <div>
                                    <div className="text-lg font-bold">{scan.visitor.name}</div>
                                    <div className="text-xs text-ink/55">{[scan.visitor.house && UNIT + ' ' + scan.visitor.house.label, title(scan.visitor.category), scan.visitor.vehicle_no, 'in ' + (scan.visitor.entry_at ? dt(scan.visitor.entry_at) : '—'), scan.visitor.entry_at && 'stayed ' + duration(scan.visitor.entry_at)].filter(Boolean).join(' · ')}</div>
                                    {scan.overstay && <div className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-800">Overstayed — note it in the log if needed.</div>}
                                    {scan.valid && <button className="btn-primary mt-3 w-full py-3 text-base" onClick={() => act(() => post(`visitors/${scan.visitor.id}/checkout`, { scanned: true, gate: gates[0] }), `${scan.visitor.name} left — household informed`, () => { setScan(null); refresh(); })}><LogOut size={16} />Confirm exit</button>}</div>}
                                {scan.kind === 'staff' && <div className="flex gap-3">
                                    {scan.staff.photo_path ? <img src={`/files/${scan.staff.photo_path}`} className="h-20 w-16 rounded-lg object-cover" alt="" /> : <div className="grid h-20 w-16 place-items-center rounded-lg bg-ink/5 text-2xl">👤</div>}
                                    <div className="flex-1"><div className="font-bold">{scan.staff.name}</div><div className="text-xs text-ink/55">{title(scan.staff.type)} · {UNIT} {scan.staff.house?.label} · {title(scan.staff.verification)}</div>
                                        <div className="text-xs text-ink/55">{scan.inside ? 'Inside now' : 'Outside'}</div>
                                        {(scan.valid || scan.inside) && <button className={`mt-2 w-full ${scan.inside ? 'btn-outline' : 'btn-primary'}`} onClick={() => act(() => post(`staff/${scan.staff.id}/move`, { gate: gates[0] }), scan.inside ? 'Staff checked out' : 'Staff checked in — household informed', () => { setScan(null); refresh(); })}>{scan.inside ? <><LogOut size={14} />Check out</> : <><LogIn size={14} />Check in</>}</button>}</div></div>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'temporary' && <TemporaryTab manage={manage} isResident={isResident} />}
            {tab === 'staff' && <StaffTab manage={manage} approve={approve('security')} isResident={isResident} houses={houses} gates={gates} />}
            {tab === 'emergency' && manage && <EmergencyTab manage={manage} houses={houses} gates={gates} />}
            {tab === 'cctv' && manage && <CctvTab approve={approve('security')} gates={gates} />}
            {tab === 'patrol' && manage && <PatrolTab />}
            {tab === 'shifts' && manage && <ShiftsTab />}

            {tab === 'vehicles' && (
                <>
                    <VehicleRegister manage={manage} isResident={isResident} houses={houses} gates={gates} />
                    <div className="mb-2 font-bold">Registered vehicles (stickers)</div>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={vehicles.params.q} onChange={(q) => vehicles.set({ q })} placeholder="Plate, make, sticker…" />
                        <button className="btn-primary ml-auto" onClick={() => setModal({ mode: 'vehicle' })}><Car size={15} />Register vehicle</button>
                    </div>
                    <Table list={vehicles} empty="No vehicles registered." onRow={manage ? (v) => setModal({ mode: 'vehicle', ...v }) : undefined} columns={[
                        { label: 'Plate', render: (v) => <span className="rounded-md border-2 border-ink/80 bg-surface px-2 py-0.5 font-mono text-xs font-bold">{v.plate}</span> },
                        { label: 'Vehicle', render: (v) => `${title(v.type)} · ${v.make || ''} ${v.color || ''}` },
                        !isResident && { label: 'House', render: (v) => v.house?.label || 'Visitor' },
                        { label: 'Sticker / RFID', key: 'sticker_no' },
                        { label: 'Parking', key: 'parking_slot' },
                        { label: 'Status', render: (v) => <Badge value={v.active ? 'approved' : 'rejected'}>{v.active ? 'Active' : 'Inactive'}</Badge> },
                        { label: '', className: 'text-right', render: (v) => (approve('security') || isResident) && <span onClick={(e) => e.stopPropagation()}><Confirm className="btn-ghost btn-sm text-red-600" message={`Remove ${v.plate}?`} onConfirm={() => act(() => del(`gate/vehicles/${v.id}`), 'Removed', refresh)}>×</Confirm></span> },
                    ].filter(Boolean)} />
                </>
            )}

            {tab === 'watchlist' && (
                <>
                    <div className="mb-3 flex gap-2"><SearchBox value={watch.params.q} onChange={(q) => watch.set({ q })} /><button className="btn-danger ml-auto" onClick={() => setModal({ mode: 'watch' })}><Ban size={15} />Add to blacklist</button></div>
                    <Table list={watch} empty="Blacklist is empty." columns={[
                        { label: 'Person / vehicle', render: (w) => <div><div className="font-semibold">{w.name || w.vehicle_no || w.cnic}</div><div className="text-xs text-ink/50">{[w.cnic, w.phone, w.vehicle_no].filter(Boolean).join(' · ')}</div></div> },
                        { label: 'Level', render: (w) => <Badge value={w.level === 'blocked' ? 'urgent' : 'pending'}>{w.level === 'blocked' ? 'BLOCKED' : 'Watch'}</Badge> },
                        { label: 'Reason', key: 'reason', className: 'max-w-72' },
                        { label: 'Until', render: (w) => w.until ? dt(w.until, false) : 'Permanent' },
                        { label: 'Added by', render: (w) => w.adder?.name },
                        { label: '', className: 'text-right', render: (w) => approve('security') && <Confirm className="btn-ghost btn-sm" message="Remove from list?" onConfirm={() => act(() => del(`gate/watchlist/${w.id}`), 'Removed', refresh)}>Remove</Confirm> },
                    ]} />
                </>
            )}

            {tab === 'incidents' && (
                <>
                    <div className="mb-3 flex gap-2"><Select value={incidents.params.status} onChange={(status) => incidents.set({ status })} placeholder="All" options={['open', 'investigating', 'resolved']} /><button className="btn-primary ml-auto" onClick={() => setModal({ mode: 'incident' })}><AlertOctagon size={15} />Report incident</button></div>
                    <Table list={incidents} empty="No incidents reported." onRow={(i) => setModal({ mode: 'incident-view', ...i })} columns={[
                        { label: 'Ref', render: (i) => <span className="font-mono text-xs font-bold">{i.reference}</span> },
                        { label: 'Incident', render: (i) => <div><div className="font-semibold">{title(i.type)}</div><div className="max-w-72 truncate text-xs text-ink/50">{i.description}</div></div> },
                        { label: 'Severity', render: (i) => <Badge value={{ critical: 'urgent', high: 'high', medium: 'normal', low: 'low' }[i.severity]}>{title(i.severity)}</Badge> },
                        { label: 'Location', render: (i) => i.location || i.house?.label || '—' },
                        { label: 'Reported', render: (i) => <div className="text-xs">{dt(i.created_at)}<div className="text-ink/45">{i.reporter?.name}</div></div> },
                        { label: 'Status', render: (i) => <Badge value={i.status === 'resolved' ? 'resolved' : i.status === 'open' ? 'open' : 'in_progress'}>{title(i.status)}</Badge> },
                    ]} />
                </>
            )}

            {/* ---- modals ---- */}
            <Modal open={modal?.mode === 'entry'} onClose={() => setModal(null)} title={modal?.id ? 'Edit visitor' : 'New gate entry'} wide>
                {modal?.mode === 'entry' && <Form fields={entryFields} initial={modal} onSubmit={save} submitLabel={modal.id ? 'Update' : 'Record'} />}
            </Modal>
            <Modal open={modal?.mode === 'slip'} onClose={() => setModal(null)} title="Gate slip">
                {modal?.mode === 'slip' && <GateSlip initial={modal.visitor} autoPrint={modal.print} />}
            </Modal>
            <Modal open={modal?.mode === 'footage'} onClose={() => setModal(null)} title="CCTV footage">
                {modal?.mode === 'footage' && <FootageLinks at={modal.at} gate={modal.gate} />}
            </Modal>
            <Modal open={modal?.mode === 'pass'} onClose={() => setModal(null)} title="Pre-register a visitor">
                {modal?.mode === 'pass' && <Form submitLabel="Create QR pass" onSubmit={async (v) => { const p = await post('gate/passes', v); toast('QR pass created'); setTab('passes'); refresh(); setModal({ mode: 'showpass', pass: p }); }}
                    initial={{ valid_from: local(new Date()), valid_until: local(new Date(Date.now() + 6 * 3600e3)) }} fields={[
                        { name: 'visitor_name', label: 'Visitor name', required: true, half: true },
                        { name: 'category', label: 'Type', type: 'select', options: ['guest', 'relative', 'friend', 'worker', 'delivery', 'contractor', 'visitor', 'other'], required: true, half: true, default: 'guest' },
                        !isResident && { name: 'house_id', label: 'House', type: 'select', options: houses, required: true },
                        { name: 'phone', label: 'Phone', half: true }, { name: 'cnic', label: ID_LABEL, half: true },
                        { name: 'vehicle_no', label: 'Vehicle no.', half: true }, { name: 'persons', label: 'Persons', type: 'number', min: 1, default: 1, half: true },
                        { name: 'valid_from', label: 'Valid from', type: 'datetime-local', required: true, half: true }, { name: 'valid_until', label: 'Valid until', type: 'datetime-local', required: true, half: true },
                        { name: 'max_stay_minutes', label: 'Max stay (minutes)', type: 'number', min: 15, half: true, placeholder: '240' },
                        { name: 'purpose', label: 'Purpose', half: true },
                        { name: 'multi_use', label: 'Multi-use (e.g. party guests / regular maid)', type: 'checkbox' },
                    ].filter(Boolean)} />}
            </Modal>
            <Modal open={modal?.mode === 'showpass'} onClose={() => setModal(null)} title="Visitor QR pass">{modal?.pass && <PassCard p={modal.pass} />}</Modal>
            <Modal open={modal?.mode === 'vehicle'} onClose={() => setModal(null)} title={modal?.id ? 'Edit vehicle' : 'Register vehicle'}>
                {modal?.mode === 'vehicle' && <Form initial={{ active: true, ...modal }} submitLabel="Save" onSubmit={async (v) => { modal.id ? await put(`gate/vehicles/${modal.id}`, v) : await post('gate/vehicles', v); toast('Vehicle saved'); setModal(null); refresh(); }} fields={[
                    { name: 'plate', label: 'Number plate', required: true, half: true }, { name: 'type', label: 'Type', type: 'select', options: ['car', 'bike', 'van', 'truck', 'other'], default: 'car', required: true, half: true },
                    { name: 'make', label: 'Make / model', half: true }, { name: 'color', label: 'Colour', half: true },
                    !isResident && { name: 'house_id', label: 'House', type: 'select', options: houses, half: true }, { name: 'owner_name', label: 'Owner name', half: true },
                    !isResident && { name: 'sticker_no', label: 'Sticker / RFID tag', half: true }, !isResident && { name: 'parking_slot', label: 'Parking slot', half: true },
                    !isResident && { name: 'active', label: 'Sticker active', type: 'checkbox' },
                ].filter(Boolean)} />}
            </Modal>
            <Modal open={modal?.mode === 'watch'} onClose={() => setModal(null)} title="Blacklist / watchlist">
                {modal?.mode === 'watch' && <Form submitLabel="Add" onSubmit={async (v) => { await post('gate/watchlist', v); toast('Added'); setModal(null); refresh(); }} fields={[
                    { name: 'level', label: 'Level', type: 'select', options: [{ value: 'blocked', label: 'BLOCKED — deny entry' }, { value: 'watch', label: 'Watch — allow but alert supervisor' }], default: 'blocked', required: true },
                    { name: 'name', label: 'Name', half: true }, { name: 'cnic', label: ID_LABEL, half: true }, { name: 'phone', label: 'Phone', half: true }, { name: 'vehicle_no', label: 'Vehicle no.', half: true },
                    { name: 'reason', label: 'Reason', required: true }, { name: 'until', label: 'Until (blank = permanent)', type: 'date' },
                ]} />}
            </Modal>
            <Modal open={modal?.mode === 'incident'} onClose={() => setModal(null)} title="Report incident">
                {modal?.mode === 'incident' && <Form submitLabel="Report" onSubmit={async (v) => { await post('gate/incidents', v); toast('Incident reported — admins alerted'); setModal(null); refresh(); }} fields={[
                    { name: 'type', label: 'Type', type: 'select', options: ['theft', 'suspicious', 'accident', 'fire', 'medical', 'vandalism', 'unauthorized_entry', 'dispute', 'other'], required: true, half: true },
                    { name: 'severity', label: 'Severity', type: 'select', options: ['low', 'medium', 'high', 'critical'], default: 'medium', required: true, half: true },
                    { name: 'location', label: 'Location', half: true }, { name: 'house_id', label: 'House (if any)', type: 'select', options: houses, half: true },
                    { name: 'description', label: 'What happened', type: 'textarea', rows: 4, required: true }, { name: 'photo', label: 'Photo', type: 'file', accept: 'image/*', capture: 'environment' },
                ]} />}
            </Modal>
            <Modal open={modal?.mode === 'incident-view'} onClose={() => setModal(null)} title={`${modal?.reference || ''} · ${title(modal?.type)}`}>
                {modal?.mode === 'incident-view' && (
                    <div className="space-y-3 text-sm">
                        <div className="flex gap-2"><Badge value={modal.status === 'resolved' ? 'resolved' : 'open'}>{title(modal.status)}</Badge><Badge>{title(modal.severity)}</Badge></div>
                        <p className="whitespace-pre-line rounded-xl bg-ink/[.03] p-3">{modal.description}</p>
                        {modal.photo_path && <img src={`/files/${modal.photo_path}`} className="max-h-56 rounded-xl" alt="" />}
                        {modal.action_taken && <div className="rounded-xl bg-emerald-50 p-3"><b>Action:</b> {modal.action_taken}</div>}
                        <details className="rounded-xl bg-ink/[.03] p-3"><summary className="cursor-pointer text-sm font-semibold">📹 CCTV around this time</summary><div className="mt-2"><FootageLinks at={modal.created_at} /></div></details>
                        {modal.status !== 'resolved' && <Form initial={{ status: modal.status === 'open' ? 'investigating' : 'resolved' }} submitLabel="Update" onSubmit={async (v) => { await put(`gate/incidents/${modal.id}`, v); toast('Updated'); setModal(null); refresh(); }} fields={[
                            { name: 'status', label: 'Status', type: 'select', options: ['open', 'investigating', 'resolved'], required: true }, { name: 'action_taken', label: 'Action taken', type: 'textarea', rows: 2 },
                        ]} />}
                    </div>
                )}
            </Modal>
            <Modal open={!!view} onClose={() => setView(null)} title={view?.name}>
                {view && (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                            {[['Type', title(view.category)], ['House', view.house?.label], ['Purpose', view.purpose], [ID_LABEL, view.cnic], ['Phone', view.phone], ['Vehicle', view.vehicle_no], ['Persons', view.persons], ['Gate', view.gate],
                                ['Status', title(view.status)], ['Arrived', dt(view.created_at)], ['Entered', view.entry_at ? dt(view.entry_at) : '—'], ['Allowed until', view.expected_exit_at ? dt(view.expected_exit_at) : '—'],
                                ['Exit', view.exit_at ? dt(view.exit_at) + (view.exit_gate ? ' · ' + view.exit_gate : '') : view.status === 'inside' ? 'Still inside' : '—'], ['Slip', view.token], ['Vehicle type', title(view.vehicle_type || '')], ['Duration of stay', view.entry_at ? duration(view.entry_at, view.exit_at) : '—'], ['Decision by', view.responder?.name], ['Logged by', view.logger?.name]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-ink/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {view.response_note && <p className="rounded-xl bg-amber-50 p-3">Note from household: {view.response_note}</p>}
                        {view.remarks && <p className="rounded-xl bg-ink/[.03] p-3">{view.remarks}</p>}
                        {view.photo_path && <img src={`/files/${view.photo_path}`} className="max-h-64 rounded-xl" alt="" />}
                        {view.video_path && <video src={`/files/${view.video_path}`} controls className="w-full rounded-xl bg-black" />}
                        <div className="flex flex-wrap gap-2">
                            {view.token && <button className="btn-outline btn-sm" onClick={() => { setModal({ mode: 'slip', visitor: view }); setView(null); }}><Printer size={13} />Gate slip</button>}
                            {manage && (view.entry_at || view.created_at) && <button className="btn-outline btn-sm" onClick={() => { setModal({ mode: 'footage', at: view.entry_at || view.created_at, gate: view.gate }); setView(null); }}><Cctv size={13} />CCTV at entry</button>}
                            {manage && view.exit_at && <button className="btn-outline btn-sm" onClick={() => { setModal({ mode: 'footage', at: view.exit_at, gate: view.exit_gate || view.gate }); setView(null); }}><Cctv size={13} />CCTV at exit</button>}
                            {manage && <button className="btn-outline btn-sm" onClick={() => { setModal({ mode: 'entry', ...view, house_id: view.house_id || '' }); setView(null); }}><Camera size={13} />Edit / add media</button>}
                            {view.video_path && <FileLink path={view.video_path} label="Open video" />}
                            {approve('security') && <Confirm className="btn-ghost btn-sm text-red-600" message="Delete this visitor record?" onConfirm={() => act(() => del(`visitors/${view.id}`), 'Deleted', () => { setView(null); refresh(); })}>Delete</Confirm>}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
