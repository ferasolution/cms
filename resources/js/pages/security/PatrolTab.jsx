import { useState } from 'react';
import { Footprints, Play, Square, Plus, Printer, CheckCircle2, AlertTriangle, Clock, Trash2, MapPin } from 'lucide-react';
import { useGet, Modal, Form, useAction, useToast, QrScanner, Spinner, Confirm, Badge } from '../../components/ui';
import { post, put, del, ago, dt } from '../../lib/api';
import { useLive } from '../../lib/alerts';
import PlanMap from '../../components/PlanMap';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function printCheckpoints(cps) {
    const QR = await import('qrcode');
    const qrs = await Promise.all(cps.map((c) => QR.toDataURL(c.code, { width: 300, margin: 1 })));
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Patrol checkpoints</title><style>body{font-family:Arial;margin:10mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
        .c{border:2px solid #2737a3;border-radius:4mm;padding:4mm;text-align:center;break-inside:avoid}img{width:42mm;height:42mm}h3{margin:2mm 0 0;font-size:14px}.k{font:700 12px monospace;letter-spacing:1px}.s{font-size:10px;color:#555}</style></head>
        <body><div class="g">${cps.map((c, i) => `<div class="c"><div class="s">PATROL CHECKPOINT</div><img src="${qrs[i]}"><h3>${esc(c.name)}</h3><div class="k">${esc(c.code)}</div><div class="s">Guards: scan on every round</div></div>`).join('')}</div>
        <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
}

const gps = () => new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 4000, maximumAge: 60000 });
});

export default function PatrolTab() {
    const p = useGet('patrol');
    const map = useGet('map');
    const act = useAction();
    const toast = useToast();
    const [issue, setIssue] = useState(false);
    const [note, setNote] = useState('');
    const [edit, setEdit] = useState(null);
    const [pick, setPick] = useState(null);
    const [last, setLast] = useState(null);
    useLive('security', p.reload);
    if (!p.data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
    const d = p.data;
    const round = d.my_round;
    const done = new Set((round?.scans || []).map((s) => s.patrol_checkpoint_id));
    const active = d.checkpoints.filter((c) => c.active);
    const overdue = active.filter((c) => c.overdue).length;

    const scan = async (code) => {
        const loc = await gps();
        try {
            const r = await post('patrol/scan', { code, status: issue ? 'issue' : 'ok', note: issue ? note : '', ...loc });
            setLast({ ok: true, name: r.scan.checkpoint.name, dup: r.duplicate, issue });
            toast(`${r.scan.checkpoint.name} checked${issue ? ' — issue reported' : ''}`, issue ? 'warning' : 'success');
            setIssue(false); setNote(''); p.reload();
        } catch (e) { setLast({ ok: false, msg: e.message }); }
    };
    const markers = d.checkpoints.filter((c) => c.map_x).map((c) => ({
        key: 'cp' + c.id, x: c.map_x, y: c.map_y, icon: done.has(c.id) ? '✅' : c.overdue ? '⚠️' : '📍', color: !c.active ? '#94a3b8' : done.has(c.id) ? '#059669' : c.overdue ? '#dc2626' : '#0f766e',
        label: c.name, always: true, pulse: c.active && c.overdue, title: `${c.name} — last ${c.last_scan ? ago(c.last_scan.scanned_at) : 'never'}`,
    }));
    const saveCp = async (v) => {
        const body = { ...v, active: !!v.active, ...(pick ? { map_x: pick[0], map_y: pick[1] } : {}) };
        edit.id ? await put(`patrol/checkpoints/${edit.id}`, body) : await post('patrol/checkpoints', body);
        toast('Checkpoint saved', 'success'); setEdit(null); setPick(null); p.reload(); map.reload();
    };

    return (
        <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[['Checkpoints', active.length, 'text-ink'], ['Overdue now', overdue, overdue ? 'text-red-600' : 'text-emerald-600'], ['Scans today', d.today.scans, 'text-ink'], ['Issues today', d.today.issues, d.today.issues ? 'text-amber-600' : 'text-ink']].map(([l, v, c]) => (
                    <div key={l} className="card p-4"><div className="text-xs font-semibold text-ink/50">{l}</div><div className={`text-2xl font-black ${c}`}>{v}</div></div>
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
                <div className="space-y-4">
                    {map.data?.site?.boundary && <div className="card p-3"><div className="mb-2 flex items-center justify-between px-1"><span className="font-bold">Checkpoints on the map</span><span className="text-xs text-ink/45">checked every {d.interval} min · red = overdue</span></div>
                        <PlanMap site={map.data.site} houses={map.data.houses} markers={markers} height={360} compact /></div>}
                    <div className="card overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3"><span className="font-bold">Checkpoint status</span>
                            {d.can_edit && <span className="flex gap-2"><button className="btn-outline btn-sm" onClick={() => printCheckpoints(active)}><Printer size={13} />Print QR codes</button><button className="btn-primary btn-sm" onClick={() => { setEdit({ active: true }); setPick(null); }}><Plus size={13} />Checkpoint</button></span>}</div>
                        {d.checkpoints.map((c) => (
                            <div key={c.id} className={`flex items-center gap-3 border-t border-ink/5 px-4 py-2.5 text-sm ${!c.active ? 'opacity-50' : ''}`}>
                                <span className={`grid size-8 place-items-center rounded-lg ${done.has(c.id) ? 'bg-emerald-50 text-emerald-600' : c.overdue ? 'bg-red-50 text-red-600' : 'bg-ink/5 text-ink/50'}`}>{done.has(c.id) || !c.overdue ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
                                <div className="min-w-0 flex-1"><div className="font-semibold">{c.name}</div><div className="text-xs text-ink/50">{c.last_scan ? `${ago(c.last_scan.scanned_at)} by ${c.last_scan.user?.name || '—'}` : 'never checked'} · {c.scans_today} today</div></div>
                                <span className="font-mono text-[11px] text-ink/40">{c.code}</span>
                                {d.can_edit && <button className="btn-ghost btn-sm" onClick={() => { setEdit(c); setPick(c.map_x ? [c.map_x, c.map_y] : null); }}>Edit</button>}
                            </div>
                        ))}
                        {!d.checkpoints.length && <div className="p-6 text-center text-sm text-ink/45">No checkpoints yet{d.can_edit ? ' — add them and print the QR codes to fix at each spot.' : '.'}</div>}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={`card p-4 ${round ? 'ring-2 ring-brand-500' : ''}`}>
                        <div className="mb-2 flex items-center gap-2 font-bold"><Footprints size={18} />My patrol round</div>
                        {round ? (
                            <>
                                <div className="mb-2 flex items-center justify-between text-sm"><span>Started {ago(round.started_at)}</span><b>{done.size} / {round.expected}</b></div>
                                <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(done.size / Math.max(1, round.expected)) * 100}%` }} /></div>
                                <QrScanner onResult={scan} placeholder="Scan checkpoint CP-…" />
                                <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-amber-600" checked={issue} onChange={(e) => setIssue(e.target.checked)} />Report a problem at this checkpoint</label>
                                {issue && <input className="input mt-2" placeholder="What is wrong? (light off, lock broken, suspicious…)" value={note} onChange={(e) => setNote(e.target.value)} />}
                                {last && <div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${last.ok ? (last.issue ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700') : 'bg-red-50 text-red-700'}`}>{last.ok ? `✓ ${last.name}${last.dup ? ' (again this round)' : ''}` : last.msg}</div>}
                                <div className="mt-3 flex flex-wrap gap-1.5">{active.map((c) => <span key={c.id} className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${done.has(c.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-ink/5 text-ink/50'}`}>{done.has(c.id) ? '✓ ' : ''}{c.name}</span>)}</div>
                                <button className="btn-outline mt-4 w-full" onClick={() => act(() => post(`patrol/rounds/${round.id}/end`, { notes: window.prompt('Round notes (optional)') || '' }), 'Round finished', p.reload)}><Square size={14} />Finish round</button>
                            </>
                        ) : (
                            <>
                                <p className="mb-3 text-sm text-ink/55">Start a round, walk the route and scan the QR code fixed at every checkpoint. Your GPS is saved with each scan.</p>
                                <button className="btn-primary w-full py-3" onClick={() => act(() => post('patrol/rounds'), 'Round started', p.reload)}><Play size={15} />Start patrol round</button>
                            </>
                        )}
                    </div>
                    <div className="card p-4">
                        <div className="mb-2 font-bold">Latest checks</div>
                        {d.recent.slice(0, 12).map((s) => (
                            <div key={s.id} className="flex gap-2 border-b border-ink/5 py-1.5 text-sm last:border-0">
                                <span>{s.status === 'issue' ? '⚠️' : '✅'}</span>
                                <div className="min-w-0 flex-1"><div className="truncate font-medium">{s.checkpoint?.name}{s.note ? ' — ' + s.note : ''}</div><div className="text-[11px] text-ink/45">{s.user?.name} · {ago(s.scanned_at)}{s.lat ? ' · 📍GPS' : ''}</div></div>
                            </div>
                        ))}
                        {!d.recent.length && <div className="py-4 text-center text-sm text-ink/45">No checks yet.</div>}
                    </div>
                    <div className="card p-4">
                        <div className="mb-2 font-bold">Rounds</div>
                        {d.rounds.slice(0, 10).map((r) => (
                            <div key={r.id} className="flex items-center gap-2 border-b border-ink/5 py-1.5 text-sm last:border-0">
                                <Clock size={13} className="text-ink/40" /><span className="flex-1">{r.user?.name} · {dt(r.started_at)}</span>
                                <Badge value={r.status === 'completed' ? 'approved' : r.status === 'in_progress' ? 'pending' : 'rejected'}>{r.scanned}/{r.expected}</Badge>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Modal open={!!edit} onClose={() => { setEdit(null); setPick(null); }} title={edit?.id ? 'Edit checkpoint' : 'New checkpoint'} wide>
                {edit && <Form initial={edit} onSubmit={saveCp} submitLabel="Save" fields={[
                    { name: 'name', label: 'Name', required: true, half: true }, { name: 'location', label: 'Location note', half: true },
                    { name: 'sort', label: 'Order on the route', type: 'number', half: true }, { name: 'active', label: 'Active', type: 'checkbox', half: true },
                ]}>
                    {() => (
                        <div>
                            <div className="label flex items-center gap-1"><MapPin size={13} />Position {pick ? <span className="text-ink/45">({pick[0]}, {pick[1]})</span> : <span className="text-ink/45">— click the map</span>}</div>
                            {map.data?.site?.boundary && <PlanMap site={map.data.site} houses={map.data.houses} height={240} compact onPick={(x, y) => setPick([x, y])} markers={pick ? [{ key: 'p', x: pick[0], y: pick[1], icon: '📍', color: '#f5a524', pulse: true }] : []} />}
                            {edit.id && <div className="mt-3"><Confirm className="btn-ghost btn-sm text-red-600" message="Remove this checkpoint?" onConfirm={() => act(() => del(`patrol/checkpoints/${edit.id}`), 'Removed', () => { setEdit(null); p.reload(); })}><Trash2 size={13} />Remove</Confirm></div>}
                        </div>
                    )}
                </Form>}
            </Modal>
        </>
    );
}
