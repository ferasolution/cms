import { useEffect, useState } from 'react';
import { Printer, Share2, Clock, Car, Home, Phone, IdCard } from 'lucide-react';
import { QrImage, Spinner } from '../../components/ui';
import { get, dt, title, UNIT, ID_LABEL } from '../../lib/api';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Print an 80 mm thermal-style gate slip with the exit QR in a separate window. */
export async function printSlip(v) {
    const QR = await import('qrcode');
    const qr = await QR.toDataURL(v.token, { width: 360, margin: 1 });
    const rows = [['Name', v.name], ['Phone', v.phone], [ID_LABEL, v.cnic], ['Vehicle', [v.vehicle_type && title(v.vehicle_type), v.vehicle_no].filter(Boolean).join(' · ')],
        ['Visiting', v.house ? `${UNIT} ${v.house.label}${v.house.owner_name ? ' — ' + v.house.owner_name : ''}` : '—'], ['Reason', v.purpose], ['Persons', v.persons],
        ['Gate', v.gate], ['Entry', v.entry_at ? dt(v.entry_at) : 'Waiting for approval'], ['Valid until', v.expected_exit_at ? dt(v.expected_exit_at) : '—'], ['Issued by', v.logger?.name]]
        .filter(([, x]) => x !== null && x !== undefined && x !== '');
    const w = window.open('', '_blank', 'width=420,height=720');
    if (!w) return alert('Allow pop-ups to print the slip.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gate slip ${esc(v.token)}</title><style>
        @page{size:80mm auto;margin:3mm} *{box-sizing:border-box} body{font-family:ui-monospace,Menlo,Consolas,monospace;width:74mm;margin:0 auto;color:#000;font-size:11px}
        h1{font-size:14px;margin:4px 0 0;text-align:center} .sub{text-align:center;font-size:10px;margin-bottom:6px} .tok{font-size:18px;font-weight:700;text-align:center;letter-spacing:2px;margin:2px 0 6px}
        img{display:block;width:44mm;height:44mm;margin:6px auto 0} table{width:100%;border-collapse:collapse} td{padding:2px 0;vertical-align:top} td:first-child{width:24mm;font-weight:700}
        hr{border:0;border-top:1px dashed #000;margin:6px 0} .foot{text-align:center;font-size:10px;margin-top:6px}
    </style></head><body>
        <h1>${esc(v.community || 'Community')}</h1><div class="sub">VISITOR GATE SLIP</div><hr>
        <img src="${qr}" alt=""><div class="tok">${esc(v.token)}</div><hr>
        <table>${rows.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`).join('')}</table><hr>
        <div class="foot">${esc(v.receipt_footer || 'Show this QR code at the gate when leaving.')}<br>Printed ${esc(new Date().toLocaleString())}</div>
        <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}<\/script>
    </body></html>`);
    w.document.close();
}

/** On-screen slip shown right after an entry is recorded (and from the visitor record). */
export default function GateSlip({ id, initial, autoPrint }) {
    const [v, setV] = useState(null);
    useEffect(() => { get(`visitors/${id || initial.id}`).then((d) => { setV(d); if (autoPrint) printSlip(d); }).catch(() => setV(initial)); }, [id]); // eslint-disable-line
    if (!v) return <div className="grid h-40 place-items-center"><Spinner /></div>;
    const share = () => {
        const text = `Gate slip ${v.token}\n${v.name} → ${v.house ? UNIT + ' ' + v.house.label : ''}\nValid until ${v.expected_exit_at ? dt(v.expected_exit_at) : '—'}\nShow this code at the gate when leaving.`;
        if (navigator.share) navigator.share({ title: 'Gate slip', text }).catch(() => {}); else navigator.clipboard?.writeText(text);
    };
    return (
        <div className="mx-auto max-w-sm">
            <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-sm">
                <div className="bg-brand-700 px-5 py-3 text-center text-white">
                    <div className="text-[11px] font-semibold uppercase tracking-[.2em] text-white/70">Visitor gate slip</div>
                    <div className="font-bold">{v.community || 'Community'}</div>
                </div>
                <div className="flex flex-col items-center gap-1 px-5 pt-4">
                    <QrImage text={v.token} size={180} />
                    <div className="font-mono text-2xl font-black tracking-[.18em]">{v.token}</div>
                    <div className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${v.status === 'inside' ? 'bg-emerald-50 text-emerald-700' : v.status === 'awaiting' ? 'bg-amber-50 text-amber-700' : 'bg-ink/5 text-ink/55'}`}>{v.status === 'awaiting' ? 'Waiting for household approval' : title(v.status)}</div>
                </div>
                <div className="mx-5 my-4 border-t border-dashed border-ink/15" />
                <div className="space-y-1.5 px-5 pb-5 text-sm">
                    <div className="text-lg font-bold">{v.name}</div>
                    {v.house && <div className="flex items-center gap-2 text-ink/70"><Home size={14} />{UNIT} {v.house.label}{v.house.owner_name ? ' — ' + v.house.owner_name : ''}</div>}
                    {(v.phone || v.cnic) && <div className="flex flex-wrap items-center gap-x-3 text-ink/70">{v.phone && <span className="flex items-center gap-1"><Phone size={13} />{v.phone}</span>}{v.cnic && <span className="flex items-center gap-1"><IdCard size={13} />{v.cnic}</span>}</div>}
                    {v.vehicle_no && <div className="flex items-center gap-2 text-ink/70"><Car size={14} />{title(v.vehicle_type || 'vehicle')} · <span className="rounded border border-ink/60 px-1.5 font-mono text-xs font-bold">{v.vehicle_no}</span></div>}
                    <div className="text-ink/70">{v.purpose}</div>
                    <div className="flex items-center gap-2 rounded-xl bg-ink/[.04] p-2.5 text-xs"><Clock size={14} />{v.entry_at ? <>In {dt(v.entry_at)} · <b>valid until {v.expected_exit_at ? dt(v.expected_exit_at) : '—'}</b></> : 'Entry after household approval'}</div>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => printSlip(v)}><Printer size={15} />Print slip</button>
                <button className="btn-outline" onClick={share}><Share2 size={15} />Share</button>
            </div>
            <p className="mt-2 text-center text-[11px] text-ink/45">Visitor shows this QR at the exit — the guard scans it to record the departure.</p>
        </div>
    );
}
