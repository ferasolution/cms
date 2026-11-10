import { useState } from 'react';
import { UserPlus, ShieldCheck, ShieldX, LogIn, LogOut, IdCard, Printer, Clock, CalendarDays, Phone } from 'lucide-react';
import { useList, Table, Badge, Modal, Form, SearchBox, Select, useAction, useToast, QrImage, Confirm, FileLink } from '../../components/ui';
import { post, del, dt, duration, title, fileUrl } from '../../lib/api';
import { useLive } from '../../lib/alerts';

const TYPES = ['maid', 'driver', 'gardener', 'cook', 'nanny', 'cleaner', 'guard', 'tutor', 'other'];
const ICON = { maid: '🧹', driver: '🚗', gardener: '🌿', cook: '🍳', nanny: '🍼', cleaner: '🧽', guard: '💂', tutor: '📘', other: '👤' };
const VER = { verified: ['approved', 'Verified'], pending: ['pending', 'Pending verification'], rejected: ['rejected', 'Rejected'] };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function printCard(s) {
    const QR = await import('qrcode');
    const qr = await QR.toDataURL(s.code, { width: 300, margin: 1 });
    const w = window.open('', '_blank', 'width=460,height=360');
    if (!w) return;
    const photo = s.photo_path ? `<img class="ph" src="${location.origin}${fileUrl(s.photo_path)}">` : '<div class="ph"></div>';
    w.document.write(`<!doctype html><html><head><title>${esc(s.code)}</title><style>@page{size:86mm 54mm;margin:0}body{margin:0;font-family:Arial,sans-serif}
        .c{width:86mm;height:54mm;box-sizing:border-box;padding:3mm;display:flex;gap:3mm;border:1px solid #124f4b;border-radius:3mm}
        .ph{width:20mm;height:24mm;object-fit:cover;background:#eee;border-radius:2mm}.q{width:22mm;height:22mm;margin-top:auto}
        h2{margin:0;font-size:12px;color:#124f4b}.n{font-size:13px;font-weight:700;margin-top:1mm}.s{font-size:9px;color:#333;line-height:1.4}.k{font:700 11px monospace;letter-spacing:1px}</style></head>
        <body><div class="c"><div>${photo}<img class="q" src="${qr}"></div><div><h2>STAFF ENTRY CARD</h2><div class="n">${esc(s.name)}</div>
        <div class="s">${esc(title(s.type))}<br>${s.house ? 'Plot ' + esc(s.house.label) : ''}<br>CNIC ${esc(s.cnic)}<br>${esc(s.work_days || 'All days')} ${s.time_from ? esc(s.time_from.slice(0, 5)) + '–' + esc((s.time_to || '').slice(0, 5)) : ''}<br>
        Valid till ${s.valid_until ? esc(new Date(s.valid_until).toLocaleDateString()) : '—'}</div><div class="k">${esc(s.code)}</div></div></div>
        <script>window.onload=()=>{setTimeout(()=>{window.print();window.close()},300)}<\/script></body></html>`);
    w.document.close();
}

export default function StaffTab({ manage, approve, isResident, houses, gates }) {
    const list = useList('staff', { per_page: 60 });
    const entries = useList('staff/entries', {});
    const act = useAction();
    const toast = useToast();
    const [modal, setModal] = useState(null);
    const [view, setView] = useState(null);
    const [mode, setMode] = useState('cards');
    useLive('security', () => { list.reload(); entries.reload(); });
    const refresh = () => { list.reload(); entries.reload(); };

    const move = async (s, force) => {
        try {
            const r = await post(`staff/${s.id}/move`, { gate: gates?.[0], force });
            toast(r.action === 'entry' ? `${s.name} checked in` : `${s.name} checked out`, 'success');
            refresh();
            if (view?.id === s.id) setView(r.staff);
        } catch (e) {
            if (approve && window.confirm(e.message + '\n\nAllow anyway (supervisor override)?')) move(s, true); else toast(e.message, 'error');
        }
    };
    const verify = (s, verification) => {
        const note = verification === 'rejected' ? window.prompt('Reason for rejection') : '';
        if (note === null) return;
        act(() => post(`staff/${s.id}/verify`, { verification, note }), verification === 'verified' ? 'Verified — household informed' : 'Rejected — household informed', (r) => { refresh(); setView(r); });
    };
    const save = async (v) => {
        const body = { ...v, work_days: (v.days || []).join(','), active: v.active ? 1 : 0 };
        delete body.days;
        modal.id ? await post(`staff/${modal.id}`, body) : await post('staff', body);
        toast(modal.id ? 'Saved' : 'Registered — security will verify the documents', 'success');
        setModal(null); refresh();
    };

    const counts = { inside: list.rows.filter((s) => s.inside).length, pending: list.rows.filter((s) => s.verification === 'pending').length };
    return (
        <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="Name, CNIC, card…" />
                <Select value={list.params.verification} onChange={(verification) => list.set({ verification })} placeholder="All" options={['pending', 'verified', 'rejected']} />
                <Select value={list.params.type} onChange={(type) => list.set({ type })} placeholder="All types" options={TYPES} />
                {!isResident && <Select value={list.params.house_id} onChange={(house_id) => list.set({ house_id })} placeholder="All houses" options={houses} className="max-w-48" />}
                <div className="flex rounded-xl bg-ink/[.04] p-1 text-xs font-semibold">{[['cards', 'Staff'], ['log', 'Entry log']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-3 py-1.5 ${mode === k ? 'bg-surface shadow-sm' : 'text-ink/55'}`}>{l}</button>)}</div>
                <button className="btn-primary ml-auto" onClick={() => setModal({ active: true, days: DAYS.slice(0, 6) })}><UserPlus size={15} />Register staff</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{counts.inside} inside now</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{counts.pending} waiting for verification</span>
                <span className="rounded-full bg-ink/5 px-3 py-1 text-ink/60">{list.data?.total ?? list.rows.length} registered</span>
            </div>

            {mode === 'cards' ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.rows.map((s) => (
                        <div key={s.id} className={`card overflow-hidden ${s.inside ? 'ring-2 ring-emerald-400' : ''}`}>
                            <div className="flex cursor-pointer gap-3 p-4" onClick={() => setView(s)}>
                                {s.photo_path ? <img src={fileUrl(s.photo_path)} className="size-16 shrink-0 rounded-xl object-cover" alt="" /> : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-ink/5 text-3xl">{ICON[s.type]}</div>}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5"><span className="truncate font-bold">{s.name}</span>{s.inside && <span className="size-2 rounded-full bg-emerald-500" />}</div>
                                    <div className="text-xs text-ink/55">{title(s.type)}{s.house ? ' · Plot ' + s.house.label : ''}</div>
                                    <div className="mt-1"><Badge value={VER[s.verification][0]}>{VER[s.verification][1]}</Badge></div>
                                    <div className="mt-1 truncate text-[11px] text-ink/45">{s.work_days || 'All days'}{s.time_from ? ` · ${s.time_from.slice(0, 5)}–${(s.time_to || '').slice(0, 5)}` : ''}</div>
                                </div>
                            </div>
                            <div className="flex gap-1.5 border-t border-ink/5 bg-ink/[.015] px-3 py-2">
                                {manage && <button className={`btn-sm flex-1 ${s.inside ? 'btn-outline' : 'btn-primary'}`} onClick={() => move(s)}>{s.inside ? <><LogOut size={13} />Check out · {duration(s.inside.entry_at)}</> : <><LogIn size={13} />Check in</>}</button>}
                                {approve && s.verification === 'pending' && <><button className="btn-outline btn-sm text-emerald-700" onClick={() => verify(s, 'verified')}><ShieldCheck size={13} /></button><button className="btn-outline btn-sm text-red-600" onClick={() => verify(s, 'rejected')}><ShieldX size={13} /></button></>}
                                {!manage && <button className="btn-ghost btn-sm flex-1" onClick={() => setView(s)}><IdCard size={13} />Card</button>}
                            </div>
                        </div>
                    ))}
                    {!list.rows.length && !list.loading && <div className="card col-span-full p-8 text-center text-sm text-ink/45">No domestic staff registered yet. {isResident ? 'Register your maid, driver, cook… — security verifies the CNIC once and they get a card for quick entry.' : ''}</div>}
                </div>
            ) : (
                <Table list={entries} empty="No staff entries yet." columns={[
                    { label: 'Staff', render: (e) => <div><div className="font-semibold">{ICON[e.staff?.type]} {e.staff?.name}</div><div className="text-xs text-ink/45">{title(e.staff?.type)} · {e.staff?.code}</div></div> },
                    !isResident && { label: 'House', render: (e) => e.house?.label || '—' },
                    { label: 'In', render: (e) => dt(e.entry_at) },
                    { label: 'Out', render: (e) => e.exit_at ? dt(e.exit_at) : <span className="font-semibold text-emerald-700">inside</span> },
                    { label: 'Time', render: (e) => duration(e.entry_at, e.exit_at) },
                    { label: '', render: (e) => e.off_schedule && <Badge value="pending">Off schedule</Badge> },
                    { label: 'Gate', render: (e) => e.gate || '—' },
                ].filter(Boolean)} />
            )}

            <Modal open={!!view} onClose={() => setView(null)} title={view?.name}>
                {view && (
                    <div className="space-y-4 text-sm">
                        <div className="flex gap-4">
                            {view.photo_path ? <img src={fileUrl(view.photo_path)} className="h-28 w-24 rounded-xl object-cover" alt="" /> : <div className="grid h-28 w-24 place-items-center rounded-xl bg-ink/5 text-4xl">{ICON[view.type]}</div>}
                            <div className="flex-1 space-y-1">
                                <div><Badge value={VER[view.verification][0]}>{VER[view.verification][1]}</Badge></div>
                                <div>{title(view.type)}{view.house ? ' · Plot ' + view.house.label : ''}</div>
                                <div className="text-ink/60">CNIC {view.cnic}</div>
                                {view.phone && <a href={`tel:${view.phone}`} className="flex items-center gap-1 text-brand-600"><Phone size={13} />{view.phone}</a>}
                                <div className="flex items-center gap-1 text-ink/60"><CalendarDays size={13} />{view.work_days || 'All days'}</div>
                                {view.time_from && <div className="flex items-center gap-1 text-ink/60"><Clock size={13} />{view.time_from.slice(0, 5)} – {(view.time_to || '').slice(0, 5)}</div>}
                                {view.valid_until && <div className="text-ink/60">Valid till {dt(view.valid_until, false)}</div>}
                            </div>
                            <div className="text-center"><QrImage text={view.code} size={100} /><div className="mt-1 font-mono text-xs font-bold">{view.code}</div></div>
                        </div>
                        {view.verification_note && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">{view.verification_note}</p>}
                        {view.verifier && <p className="text-xs text-ink/45">Checked by {view.verifier.name} · {dt(view.verified_at)}</p>}
                        <div className="flex flex-wrap gap-2">
                            <FileLink path={view.cnic_photo_path} label="CNIC copy" /><FileLink path={view.police_doc_path} label="Police verification" />
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-ink/5 pt-3">
                            <button className="btn-outline btn-sm" onClick={() => printCard(view)}><Printer size={13} />Print staff card</button>
                            {manage && <button className="btn-primary btn-sm" onClick={() => move(view)}>{view.inside ? 'Check out' : 'Check in'}</button>}
                            {approve && view.verification !== 'verified' && <button className="btn-outline btn-sm text-emerald-700" onClick={() => verify(view, 'verified')}><ShieldCheck size={13} />Verify</button>}
                            {approve && view.verification !== 'rejected' && <button className="btn-outline btn-sm text-red-600" onClick={() => verify(view, 'rejected')}><ShieldX size={13} />Reject</button>}
                            <button className="btn-ghost btn-sm" onClick={() => { setModal({ ...view, days: (view.work_days || '').split(',').filter(Boolean), time_from: view.time_from?.slice(0, 5), time_to: view.time_to?.slice(0, 5), valid_until: view.valid_until?.slice(0, 10) }); setView(null); }}>Edit</button>
                            {(approve || isResident) && <Confirm className="btn-ghost btn-sm text-red-600" message={`Remove ${view.name}?`} onConfirm={() => act(() => del(`staff/${view.id}`), 'Removed', () => { setView(null); refresh(); })}>Remove</Confirm>}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit staff' : 'Register domestic staff'} wide>
                {modal && <Form initial={modal} onSubmit={save} submitLabel={modal.id ? 'Save' : 'Register'} fields={[
                    { name: 'name', label: 'Full name', required: true, half: true },
                    { name: 'type', label: 'Work', type: 'select', options: TYPES, required: true, half: true, default: 'maid' },
                    { name: 'cnic', label: 'CNIC', required: true, half: true, placeholder: '42101-1234567-1' },
                    { name: 'phone', label: 'Phone', half: true },
                    !isResident && { name: 'house_id', label: 'Works at house', type: 'select', options: houses, half: true },
                    { name: 'address', label: 'Home address', half: !isResident },
                    { name: 'time_from', label: 'Arrives at', type: 'time', half: true }, { name: 'time_to', label: 'Leaves by', type: 'time', half: true },
                    { name: 'valid_until', label: 'Card valid until', type: 'date', half: true },
                    { name: 'photo', label: 'Photo', type: 'file', accept: 'image/*', capture: 'user', half: true },
                    { name: 'cnic_photo', label: 'CNIC copy', type: 'file', accept: 'image/*', capture: 'environment', half: true },
                    { name: 'police_doc', label: 'Police verification (optional)', type: 'file', accept: 'image/*,application/pdf', half: true },
                    manage && { name: 'active', label: 'Card active', type: 'checkbox' },
                ].filter(Boolean)}>
                    {(v, set) => (
                        <div><div className="label">Working days</div><div className="flex flex-wrap gap-1.5">{DAYS.map((d) => { const on = (v.days || []).includes(d); return <button type="button" key={d} onClick={() => set('days', on ? v.days.filter((x) => x !== d) : [...(v.days || []), d])} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${on ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/55'}`}>{d}</button>; })}</div></div>
                    )}
                </Form>}
            </Modal>
        </>
    );
}
