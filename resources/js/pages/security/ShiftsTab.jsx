import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarRange, LogIn, LogOut, Handshake, Check, Trash2, UserCheck } from 'lucide-react';
import { useGet, Modal, Form, useAction, useToast, Spinner, Badge } from '../../components/ui';
import { post, del, dt, title, ago } from '../../lib/api';
import { useLive } from '../../lib/alerts';

const ITEMS = ['Gate keys', 'Wireless set', 'Visitor register', 'Torch', 'Barrier remote', 'Duty phone', 'Weapon & rounds'];
const ST = { scheduled: 'bg-sky-50 text-sky-800 ring-sky-200', on_duty: 'bg-emerald-50 text-emerald-800 ring-emerald-300', completed: 'bg-ink/[.04] text-ink/60 ring-ink/10', missed: 'bg-red-50 text-red-700 ring-red-200' };
const SLOT_ICON = { morning: '🌅', evening: '🌇', night: '🌙', custom: '🕘' };
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const hm = (s) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Handover({ shift, onDone }) {
    const toast = useToast();
    const [items, setItems] = useState(ITEMS.slice(0, 3));
    return (
        <Form submitLabel="Check out & hand over" onSubmit={async (v) => { await post(`shifts/${shift.id}/checkout`, { handover_notes: v.handover_notes, handover_items: items }); toast('Handed over — next guard informed', 'success'); onDone(); }}
            fields={[{ name: 'handover_notes', label: 'Handover notes', type: 'textarea', rows: 4, required: true, placeholder: 'Anything the next guard must know: expected visitors, problems, vehicles inside overnight, pending complaints…' }]}>
            <div><div className="label">Items handed over</div><div className="flex flex-wrap gap-1.5">{ITEMS.map((i) => { const on = items.includes(i); return <button type="button" key={i} onClick={() => setItems(on ? items.filter((x) => x !== i) : [...items, i])} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${on ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/55'}`}>{on ? '✓ ' : ''}{i}</button>; })}</div></div>
        </Form>
    );
}

export default function ShiftsTab() {
    const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); });
    const s = useGet(`shifts?from=${from}`, [from]);
    const act = useAction();
    const toast = useToast();
    const [modal, setModal] = useState(null);
    const [view, setView] = useState(null);
    useLive('security', s.reload);
    if (!s.data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
    const d = s.data;
    const days = [...Array(7)].map((_, i) => { const x = new Date(from + 'T00:00'); x.setDate(x.getDate() + i); return iso(x); });
    const slots = Object.keys(d.slots);
    const shift = (n) => { const x = new Date(from + 'T00:00'); x.setDate(x.getDate() + n * 7); setFrom(iso(x)); };
    const mine = d.my_shift;
    const guards = d.guards.map((g) => ({ value: g.id, label: `${g.name}${g.designation ? ' · ' + g.designation : ''}` }));
    const todayIso = iso(new Date());

    return (
        <>
            {/* on duty now + my shift */}
            <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_380px]">
                <div className="card p-4">
                    <div className="mb-2 flex items-center gap-2 font-bold"><UserCheck size={17} />On duty now</div>
                    <div className="flex flex-wrap gap-2">
                        {d.on_duty.map((x) => <div key={x.id} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><span className="size-2 animate-pulse rounded-full bg-emerald-500" /><b>{x.guard_name}</b><span className="text-xs opacity-70">{x.post} · till {hm(x.ends_at)}</span></div>)}
                        {!d.on_duty.length && <span className="text-sm text-red-600">Nobody has checked in for duty.</span>}
                    </div>
                </div>
                <div className={`card p-4 ${mine?.status === 'on_duty' ? 'ring-2 ring-emerald-400' : ''}`}>
                    <div className="mb-1 font-bold">My duty</div>
                    {mine ? (
                        <>
                            <div className="text-sm">{SLOT_ICON[mine.slot]} <b>{mine.post}</b> · {dt(mine.starts_at)} – {hm(mine.ends_at)}</div>
                            <div className="mt-2 flex gap-2">
                                {['scheduled', 'missed'].includes(mine.status) && <button className="btn-primary flex-1" onClick={() => act(() => post(`shifts/${mine.id}/checkin`), 'You are on duty', s.reload)}><LogIn size={15} />Check in</button>}
                                {mine.status === 'on_duty' && <button className="btn-outline flex-1" onClick={() => setModal({ mode: 'handover', shift: mine })}><LogOut size={15} />Check out & handover</button>}
                            </div>
                        </>
                    ) : <p className="text-sm text-ink/50">No duty scheduled for you.</p>}
                </div>
            </div>

            {d.pending_handover.map((h) => (
                <div key={h.id} className="card mb-3 border-l-4 border-amber-400 p-4">
                    <div className="flex items-center gap-2 font-bold"><Handshake size={17} />Handover from {h.guard_name} · {h.post}</div>
                    <p className="mt-1 whitespace-pre-line text-sm">{h.handover_notes}</p>
                    {h.handover_items?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{h.handover_items.map((i) => <span key={i} className="rounded-md bg-ink/5 px-2 py-0.5 text-xs">{i}</span>)}</div>}
                    <button className="btn-primary btn-sm mt-3" onClick={() => act(() => post(`shifts/${h.id}/ack`, { note: window.prompt('Anything missing? (optional)') || '' }), 'Handover received', s.reload)}><Check size={13} />I received everything</button>
                </div>
            ))}

            {/* week roster */}
            <div className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-ink/5 px-4 py-3">
                    <button className="btn-ghost btn-sm" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
                    <b>{new Date(d.from + 'T00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })} – {new Date(d.to + 'T00:00').toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                    <button className="btn-ghost btn-sm" onClick={() => shift(1)}><ChevronRight size={15} /></button>
                    {d.can_edit && <span className="ml-auto flex gap-2"><button className="btn-outline btn-sm" onClick={() => setModal({ mode: 'generate', rows: [{ employee_id: '', slot: slots[0], post: d.posts[0] }] })}><CalendarRange size={13} />Plan the week</button><button className="btn-primary btn-sm" onClick={() => setModal({ mode: 'add' })}><Plus size={13} />Add duty</button></span>}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead><tr className="text-left text-xs text-ink/50"><th className="w-28 px-3 py-2">Shift</th>{days.map((x) => <th key={x} className={`px-2 py-2 ${x === todayIso ? 'text-brand-700' : ''}`}>{new Date(x + 'T00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</th>)}</tr></thead>
                        <tbody>
                            {[...slots, 'custom'].filter((sl) => sl !== 'custom' || d.shifts.some((x) => x.slot === 'custom')).map((sl) => (
                                <tr key={sl} className="border-t border-ink/5 align-top">
                                    <td className="px-3 py-2"><div className="font-semibold">{SLOT_ICON[sl]} {title(sl)}</div>{d.slots[sl] && <div className="text-[11px] text-ink/45">{d.slots[sl][0]}–{d.slots[sl][1]}</div>}</td>
                                    {days.map((day) => (
                                        <td key={day} className={`px-1.5 py-1.5 ${day === todayIso ? 'bg-brand-50/40' : ''}`}>
                                            <div className="space-y-1">
                                                {d.shifts.filter((x) => x.slot === sl && x.date.slice(0, 10) === day).map((x) => (
                                                    <button key={x.id} onClick={() => setView(x)} className={`block w-full rounded-lg px-2 py-1 text-left text-[11px] ring-1 ${ST[x.status]}`}>
                                                        <div className="truncate font-bold">{x.guard_name}</div><div className="truncate opacity-75">{x.post}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap gap-3 border-t border-ink/5 px-4 py-2 text-[11px]">{Object.entries(ST).map(([k, c]) => <span key={k} className={`rounded px-2 py-0.5 ring-1 ${c}`}>{title(k)}</span>)}</div>
            </div>

            <div className="card mt-4 p-4">
                <div className="mb-2 font-bold">Handover log</div>
                {d.handovers.map((h) => (
                    <div key={h.id} className="border-b border-ink/5 py-2 text-sm last:border-0">
                        <div className="flex flex-wrap items-center gap-2"><b>{h.guard_name}</b><span className="text-xs text-ink/45">{h.post} · {ago(h.checked_out_at)}</span>{h.handover_ack_at ? <Badge value="approved">Received</Badge> : <Badge value="pending">Not acknowledged</Badge>}</div>
                        <p className="text-ink/70">{h.handover_notes}</p>
                        {h.handover_ack_note && <p className="text-xs text-amber-700">Next guard: {h.handover_ack_note}</p>}
                    </div>
                ))}
                {!d.handovers.length && <p className="text-sm text-ink/45">No handovers yet.</p>}
            </div>

            <Modal open={!!view} onClose={() => setView(null)} title={view?.guard_name}>
                {view && (
                    <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap gap-2"><span className={`rounded-lg px-2 py-0.5 text-xs font-bold ring-1 ${ST[view.status]}`}>{title(view.status)}</span><span>{view.post}</span></div>
                        <div>{dt(view.starts_at)} – {dt(view.ends_at)}</div>
                        {view.checked_in_at && <div className="text-ink/60">Checked in {dt(view.checked_in_at)}{view.checked_out_at ? ` · out ${dt(view.checked_out_at)}` : ''}</div>}
                        {view.handover_notes && <p className="whitespace-pre-line rounded-xl bg-ink/[.03] p-3">{view.handover_notes}</p>}
                        <div className="flex flex-wrap gap-2 border-t border-ink/5 pt-3">
                            {d.can_edit && ['scheduled', 'missed'].includes(view.status) && <button className="btn-primary btn-sm" onClick={() => act(() => post(`shifts/${view.id}/checkin`), 'Checked in', () => { setView(null); s.reload(); })}><LogIn size={13} />Check in for guard</button>}
                            {d.can_edit && view.status === 'on_duty' && <button className="btn-outline btn-sm" onClick={() => { setModal({ mode: 'handover', shift: view }); setView(null); }}><LogOut size={13} />Check out</button>}
                            {d.can_edit && view.status !== 'on_duty' && <button className="btn-ghost btn-sm text-red-600" onClick={() => act(() => del(`shifts/${view.id}`), 'Removed', () => { setView(null); s.reload(); })}><Trash2 size={13} />Remove</button>}
                        </div>
                    </div>
                )}
            </Modal>
            <Modal open={modal?.mode === 'handover'} onClose={() => setModal(null)} title={`Handover — ${modal?.shift?.post || ''}`}>
                {modal?.mode === 'handover' && <Handover shift={modal.shift} onDone={() => { setModal(null); s.reload(); }} />}
            </Modal>
            <Modal open={modal?.mode === 'add'} onClose={() => setModal(null)} title="Add duty">
                {modal?.mode === 'add' && <Form initial={{ date: todayIso, slot: slots[0], post: d.posts[0] }} submitLabel="Add" onSubmit={async (v) => { await post('shifts', v); toast('Duty added — guard informed', 'success'); setModal(null); s.reload(); }} fields={[
                    { name: 'employee_id', label: 'Guard', type: 'select', options: guards, required: true }, { name: 'post', label: 'Post', type: 'select', options: d.posts, required: true, half: true },
                    { name: 'date', label: 'Date', type: 'date', required: true, half: true }, { name: 'slot', label: 'Shift', type: 'select', options: [...slots, 'custom'], required: true, half: true },
                    { name: 'from', label: 'From', type: 'time', half: true, show: (v) => v.slot === 'custom' }, { name: 'to', label: 'To', type: 'time', half: true, show: (v) => v.slot === 'custom' },
                ]} />}
            </Modal>
            <Modal open={modal?.mode === 'generate'} onClose={() => setModal(null)} title="Plan duties for several days" wide>
                {modal?.mode === 'generate' && (
                    <Form initial={{ from: from, days: 7 }} submitLabel="Create duties" onSubmit={async (v) => {
                        const rows = modal.rows.filter((r) => r.employee_id);
                        if (!rows.length) throw new Error('Add at least one guard.');
                        const r = await post('shifts/generate', { from: v.from, days: Number(v.days), rows });
                        toast(`${r.created} duties created`, 'success'); setModal(null); s.reload();
                    }} fields={[{ name: 'from', label: 'Starting', type: 'date', required: true, half: true }, { name: 'days', label: 'Days', type: 'number', min: 1, max: 31, required: true, half: true }]}>
                        <div className="space-y-2">
                            <div className="label">Duty pattern (repeats every day)</div>
                            {modal.rows.map((r, i) => (
                                <div key={i} className="grid grid-cols-[1fr_.7fr_.8fr_auto] gap-2">
                                    <select className="input" value={r.employee_id} onChange={(e) => setModal({ ...modal, rows: modal.rows.map((x, j) => (j === i ? { ...x, employee_id: e.target.value } : x)) })}><option value="">Guard…</option>{guards.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select>
                                    <select className="input" value={r.slot} onChange={(e) => setModal({ ...modal, rows: modal.rows.map((x, j) => (j === i ? { ...x, slot: e.target.value } : x)) })}>{slots.map((x) => <option key={x} value={x}>{title(x)}</option>)}</select>
                                    <select className="input" value={r.post} onChange={(e) => setModal({ ...modal, rows: modal.rows.map((x, j) => (j === i ? { ...x, post: e.target.value } : x)) })}>{d.posts.map((x) => <option key={x}>{x}</option>)}</select>
                                    <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ ...modal, rows: modal.rows.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
                                </div>
                            ))}
                            <button type="button" className="btn-outline btn-sm" onClick={() => setModal({ ...modal, rows: [...modal.rows, { employee_id: '', slot: slots[0], post: d.posts[0] }] })}><Plus size={13} />Add row</button>
                        </div>
                    </Form>
                )}
            </Modal>
        </>
    );
}
