import { useEffect, useState } from 'react';
import { CalendarHeart, Plus, Calculator, Check, X, ScanLine, Settings2, Flag, BellRing } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Confirm, useAction, useToast, useHouses, QrImage, QrScanner } from '../components/ui';
import { get, post, put, del, dt, money, title, today } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive, ringAlarm } from '../lib/alerts';

const TYPES = ['private', 'wedding', 'birthday', 'religious', 'community', 'sports', 'other'];
const hm = (t) => (t || '').slice(0, 5);
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

function Countdown({ to }) {
    const [, force] = useState(0);
    useEffect(() => { const i = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(i); }, []);
    const ms = new Date(to) - Date.now();
    const neg = ms < 0;
    const s = Math.abs(Math.round(ms / 1000));
    const txt = `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
    return <span className={`font-mono text-xs font-semibold ${neg ? 'text-red-600' : ms < 3600000 ? 'text-amber-600' : 'text-emerald-700'}`}>{neg ? `+${txt} over` : `${txt} left`}</span>;
}

function Quote({ values }) {
    const [q, setQ] = useState(null);
    useEffect(() => {
        if (!values.venue || !values.start_time || !values.end_time) { setQ(null); return; }
        const t = setTimeout(() => post('events/quote', { venue: values.venue, type: values.type, start_time: hm(values.start_time), end_time: hm(values.end_time), guests: values.guests || 0, vehicles: values.vehicles || 0 }).then(setQ).catch(() => setQ(null)), 300);
        return () => clearTimeout(t);
    }, [values.venue, values.type, values.start_time, values.end_time, values.guests, values.vehicles]);
    if (!q) return null;
    return (
        <div className="rounded-xl bg-brand-50 p-3 text-sm">
            <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-brand-700"><Calculator size={15} />Event calculator</div>
            {q.lines.map((l) => <div key={l.label} className="flex justify-between text-ink/65"><span>{l.label}</span><span>{money(l.amount)}</span></div>)}
            <div className="mt-1.5 flex justify-between border-t border-brand-200 pt-1.5 font-bold"><span>Estimated charges</span><span>{money(q.total)}</span></div>
        </div>
    );
}

export default function Events() {
    const { can, approve, isResident, user } = useAuth();
    const isAdmin = approve('events');
    const manage = can('events', true);
    const [tab, setTab] = useState(isResident ? 'mine' : new URLSearchParams(location.search).get('tab') || 'upcoming');
    const list = useList('events', { when: isResident || tab !== 'upcoming' ? (tab === 'today' ? 'today' : '') : 'upcoming', status: tab === 'pending' ? 'pending' : '', q: new URLSearchParams(location.search).get('q') || '' });
    const rates = useGet('events/rates');
    const houses = useHouses(!isResident);
    const [modal, setModal] = useState(null);
    const [code, setCode] = useState('');
    const [verified, setVerified] = useState(null);
    const act = useAction();
    const toast = useToast();
    useLive('events', () => { list.reload(); });

    const switchTab = (t) => { setTab(t); list.set({ when: t === 'upcoming' ? 'upcoming' : t === 'today' ? 'today' : '', status: t === 'pending' ? 'pending' : '' }); };
    const venues = Object.keys(rates.data?.venues || {});
    const fields = [
        { name: 'title', label: 'Event title', required: true },
        { name: 'type', label: 'Type', type: 'select', options: TYPES, required: true, half: true, default: 'private' },
        { name: 'venue', label: 'Venue', type: 'select', options: venues, required: true, half: true },
        !isResident && { name: 'house_id', label: 'Household', type: 'select', options: houses },
        { name: 'date', label: 'Date', type: 'date', required: true, half: true, min: today() },
        { name: 'guests', label: 'Expected guests', type: 'number', min: 0, half: true, default: 0 },
        { name: 'start_time', label: 'Start time', type: 'time', required: true, half: true },
        { name: 'end_time', label: 'End time', type: 'time', required: true, half: true },
        { name: 'vehicles', label: 'Vehicles', type: 'number', min: 0, half: true, default: 0 },
        { name: 'details', label: 'Details (catering, sound system, special needs…)', type: 'textarea', rows: 2 },
    ].filter(Boolean);

    const save = async (v) => {
        const body = { ...v, start_time: hm(v.start_time), end_time: hm(v.end_time) };
        if (modal.id) await put(`events/${modal.id}`, body); else await post('events', body);
        toast(modal.id ? 'Event updated' : isResident ? 'Event request submitted' : 'Event created');
        setModal(null);
        list.reload();
    };
    const setStatus = (e, status, record_payment = false) => act(() => post(`events/${e.id}/status`, { status, record_payment }), `Event ${status}`, list.reload);

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={CalendarHeart} title="Event Management" subtitle="Applications, event codes, charges and time alerts at the gate.">
                {isAdmin && <button className="btn-outline" onClick={() => setModal({ mode: 'rates' })}><Settings2 size={16} />Rates</button>}
                {(isResident || manage) && <button className="btn-primary" onClick={() => setModal({ mode: 'event' })}><Plus size={16} />{isResident ? 'Apply for event' : 'New event'}</button>}
            </PageHeader>

            {!isResident && (
                <div className="card mb-4 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ScanLine size={18} className="text-brand-600" />Gate check — scan the guest's event QR or type the code
                        <button className="btn-ghost btn-sm ml-auto" title="Test the alarm sound" onClick={() => ringAlarm(2)}><BellRing size={14} />Test alarm</button></div>
                    <QrScanner placeholder="EVT-XXXXXX" onResult={(c) => { const m = c.toUpperCase().match(/EVT-[A-Z0-9]{6}/); get(`events/verify/${m ? m[0] : c.trim()}`).then(setVerified).catch((e) => toast(e.message, 'error')); }} />
                </div>
            )}

            <Tabs value={tab} onChange={switchTab} tabs={isResident ? [{ key: 'mine', label: 'My events' }] : [
                { key: 'upcoming', label: 'Upcoming' }, { key: 'today', label: 'Today' }, manage && { key: 'pending', label: 'Pending approval' }, { key: 'all', label: 'All' },
            ]} />
            <div className="mb-3"><SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="Title, code, venue…" /></div>

            <Table list={list} empty="No events." onRow={(e) => setModal({ mode: 'view', ...e })} columns={[
                { label: 'Event', render: (e) => <div><div className="font-semibold">{e.title}</div><div className="text-xs text-ink/50">{title(e.type)} · {e.house?.label || e.requester?.name}</div></div> },
                { label: 'When', render: (e) => <div>{dt(e.date, false)}<div className="text-xs text-ink/50">{fmtTime(e.start_time)} – {fmtTime(e.end_time)}</div></div> },
                { label: 'Venue', render: (e) => <div>{e.venue}<div className="text-xs text-ink/50">{e.guests} guests</div></div> },
                { label: 'Code', render: (e) => (e.code ? <span className="font-mono text-xs font-semibold">{e.code}</span> : '—') },
                { label: 'Charges', render: (e) => money(e.charges) },
                { label: 'Status', render: (e) => <div className="flex flex-col items-start gap-1">{e.live ? <Badge value="live">● Live</Badge> : e.overtime ? <Badge value="urgent">Time over</Badge> : <Badge value={e.status} />}{(e.live || e.overtime) && <Countdown to={e.ends_at} />}</div> },
                manage && { label: '', className: 'text-right', render: (e) => (
                    <div className="flex justify-end gap-1" onClick={(x) => x.stopPropagation()}>
                        {e.status === 'pending' && <button className="btn-primary btn-sm" onClick={() => setStatus(e, 'approved', window.confirm(`Record ${money(e.charges)} as event revenue now?`))}><Check size={13} />Approve</button>}
                        {e.status === 'pending' && <button className="btn-ghost btn-sm text-red-600" onClick={() => setStatus(e, 'rejected')}><X size={13} /></button>}
                        {e.status === 'approved' && <button className="btn-outline btn-sm" onClick={() => setStatus(e, 'completed')}><Flag size={13} />Close</button>}
                    </div>
                ) },
            ].filter(Boolean)} />

            <Modal open={modal?.mode === 'event'} onClose={() => setModal(null)} title={modal?.id ? 'Edit event' : isResident ? 'Event application' : 'New event'} wide>
                {modal?.mode === 'event' && (
                    <Form fields={fields} initial={{ ...modal, start_time: hm(modal.start_time), end_time: hm(modal.end_time), date: modal.date?.slice(0, 10) }} onSubmit={save} submitLabel={isResident && !modal.id ? 'Submit application' : 'Save'}>
                        {(v) => <Quote values={v} />}
                    </Form>
                )}
            </Modal>

            <Modal open={modal?.mode === 'view'} onClose={() => setModal(null)} title={modal?.title}>
                {modal?.mode === 'view' && (
                    <div className="space-y-4 text-sm">
                        <div className="flex flex-wrap gap-2"><Badge value={modal.status} />{modal.code && <span className="rounded-lg bg-brand-900 px-2.5 py-1 font-mono text-xs font-bold text-white">{modal.code}</span>}</div>
                        {modal.code && modal.status === 'approved' && (
                            <div className="flex items-center gap-4 rounded-2xl bg-brand-50 p-3">
                                <QrImage text={modal.code} size={120} />
                                <div className="text-xs text-ink/65"><div className="mb-1 text-sm font-bold text-ink">Guest QR pass</div>Share this QR with guests (screenshot / WhatsApp). Security scans it at the gate to confirm the guest belongs to this event.<div className="mt-1 font-mono font-bold">{modal.code}</div>{modal.checked_in > 0 && <div className="mt-1">{modal.checked_in} guests checked in so far</div>}</div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            {[['Type', title(modal.type)], ['Venue', modal.venue], ['Date', dt(modal.date, false)], ['Time', `${fmtTime(modal.start_time)} – ${fmtTime(modal.end_time)}`], ['Guests', modal.guests], ['Vehicles', modal.vehicles], ['Household', modal.house?.label], ['Requested by', modal.requester?.name], ['Approved by', modal.approver?.name]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-ink/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {modal.details && <p className="rounded-xl bg-ink/[.03] p-3">{modal.details}</p>}
                        {modal.charge_breakdown && (
                            <div className="rounded-xl border border-ink/5 p-3">
                                <div className="mb-1 font-semibold">Event allowance report</div>
                                {modal.charge_breakdown.lines.map((l) => <div key={l.label} className="flex justify-between text-ink/60"><span>{l.label}</span><span>{money(l.amount)}</span></div>)}
                                <div className="mt-1 flex justify-between border-t border-ink/5 pt-1 font-bold"><span>Total</span><span>{money(modal.charges)}</span></div>
                            </div>
                        )}
                        <div className="flex gap-2">
                            {(manage || (modal.requested_by === user.id && modal.status === 'pending')) && <button className="btn-outline btn-sm" onClick={() => setModal({ ...modal, mode: 'event' })}>Edit</button>}
                            {(isAdmin || (modal.requested_by === user.id && modal.status === 'pending')) && <Confirm className="btn-ghost btn-sm text-red-600" message="Delete this event?" onConfirm={() => act(() => del(`events/${modal.id}`), 'Deleted', () => { setModal(null); list.reload(); })}>Delete</Confirm>}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal open={modal?.mode === 'rates'} onClose={() => setModal(null)} title="Event charge rates">
                {modal?.mode === 'rates' && rates.data && <RatesForm rates={rates.data} onSaved={() => { rates.reload(); setModal(null); toast('Rates saved'); }} />}
            </Modal>

            <Modal open={!!verified} onClose={() => setVerified(null)} title="Event code check">
                {verified && (
                    <div className="space-y-2 text-sm">
                        <div className={`rounded-xl p-3 font-semibold ${verified.status === 'approved' && verified.date.slice(0, 10) === today() ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                            {verified.status === 'approved' ? (verified.date.slice(0, 10) === today() ? '✓ Valid for today' : `Approved for ${dt(verified.date, false)} — not today`) : `Status: ${title(verified.status)}`}
                        </div>
                        <div><b>{verified.title}</b> · {verified.venue}</div>
                        <div>{fmtTime(verified.start_time)} – {fmtTime(verified.end_time)} · {verified.guests} guests · {verified.vehicles} vehicles</div>
                        <div>Host: {verified.house?.label} {verified.requester?.name}</div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

function RatesForm({ rates, onSaved }) {
    const [r, setR] = useState(rates);
    const [newVenue, setNewVenue] = useState('');
    const num = (v) => Number(v) || 0;
    return (
        <div className="space-y-4 text-sm">
            <div>
                <div className="label">Venues (Rs per hour)</div>
                {Object.entries(r.venues).map(([k, v]) => (
                    <div key={k} className="mb-1.5 flex items-center gap-2">
                        <span className="flex-1">{k}</span>
                        <input type="number" className="input w-28" value={v} onChange={(e) => setR({ ...r, venues: { ...r.venues, [k]: num(e.target.value) } })} />
                        <button className="btn-ghost btn-sm" onClick={() => { const v2 = { ...r.venues }; delete v2[k]; setR({ ...r, venues: v2 }); }}>×</button>
                    </div>
                ))}
                <div className="flex gap-2"><input className="input" placeholder="Add venue" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} /><button className="btn-outline btn-sm" onClick={() => { if (newVenue) { setR({ ...r, venues: { ...r.venues, [newVenue]: 0 } }); setNewVenue(''); } }}>Add</button></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {[['per_guest', 'Per guest'], ['per_vehicle', 'Per vehicle'], ['security_per_hour', 'Security per hour'], ['late_night_surcharge', 'Late night surcharge']].map(([k, l]) => (
                    <div key={k}><div className="label">{l}</div><input type="number" className="input" value={r[k]} onChange={(e) => setR({ ...r, [k]: num(e.target.value) })} /></div>
                ))}
                {Object.entries(r.type_surcharge).map(([k, v]) => (
                    <div key={k}><div className="label">{title(k)} surcharge</div><input type="number" className="input" value={v} onChange={(e) => setR({ ...r, type_surcharge: { ...r.type_surcharge, [k]: num(e.target.value) } })} /></div>
                ))}
            </div>
            <div className="flex justify-end"><button className="btn-primary" onClick={() => put('events/rates', r).then(onSaved)}>Save rates</button></div>
        </div>
    );
}
