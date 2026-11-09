import { useEffect, useState } from 'react';
import { Briefcase, LogIn, LogOut, CalendarOff, Banknote, Check } from 'lucide-react';
import { useGet, useList, PageHeader, Modal, Form, Badge, Table, useAction, useToast } from '../components/ui';
import { post, dt, title, money } from '../lib/api';
import { useLive } from '../lib/alerts';

const hm = (m) => `${Math.floor((m || 0) / 60)}h ${String((m || 0) % 60).padStart(2, '0')}m`;

function Clock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
    return <div className="font-mono text-4xl font-bold tracking-tight">{now.toLocaleTimeString('en-PK')}</div>;
}

/** Self-service for staff: check in / out, my tasks, leave and expense requests. */
export default function Workspace() {
    const ws = useGet('crm/workspace');
    const reqs = useList('finance/expense-requests');
    const [modal, setModal] = useState(null);
    const act = useAction();
    const toast = useToast();
    useLive(['crm', 'finance'], () => { ws.reload(); reqs.reload(); });
    const d = ws.data;
    if (!d) return null;
    if (!d.employee) return <div className="card mx-auto max-w-xl p-6 text-sm">No employee profile is linked to your login yet. Ask HR to link it in Staff CRM.</div>;
    const t = d.today;
    const worked = t?.check_in ? (t.check_out ? t.minutes_worked : Math.round((Date.now() - new Date(t.check_in)) / 60000)) : 0;

    return (
        <div className="mx-auto max-w-5xl">
            <PageHeader icon={Briefcase} title="My Workspace" subtitle={`${d.employee.name} · ${d.employee.code} · ${d.employee.department} · shift ${d.employee.shift_start?.slice(0, 5)}–${d.employee.shift_end?.slice(0, 5)}`} />
            <div className="grid gap-5 lg:grid-cols-5">
                <div className="card flex flex-col items-center justify-center gap-3 p-6 text-center lg:col-span-2">
                    <Clock />
                    <div className="text-sm text-ink/55">{new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                    {!t?.check_out && (
                        <button onClick={() => act(() => post('crm/punch'), t?.check_in ? 'Checked out — have a good day!' : 'Checked in', ws.reload)}
                            className={`mt-2 flex size-36 flex-col items-center justify-center gap-1 rounded-full text-white shadow-xl transition hover:scale-105 ${t?.check_in ? 'bg-sand-500 shadow-sand-500/30' : 'bg-brand-600 shadow-brand-600/30'}`}>
                            {t?.check_in ? <LogOut size={30} /> : <LogIn size={30} />}<span className="text-lg font-bold">{t?.check_in ? 'Check out' : 'Check in'}</span>
                        </button>
                    )}
                    {t?.check_in && <div className="text-sm">In at <b>{new Date(t.check_in).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</b>{t.check_out && <> · out at <b>{new Date(t.check_out).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</b></>} · worked <b>{hm(worked)}</b>{t.late_minutes > 0 && <span className="text-red-600"> · {t.late_minutes}m late</span>}</div>}
                    {t?.check_out && <Badge value="completed">Day complete</Badge>}
                </div>
                <div className="card p-5 lg:col-span-3">
                    <div className="mb-2 font-bold">My tasks</div>
                    {!d.tasks.length && <div className="py-6 text-center text-sm text-ink/45">No open tasks 🎉</div>}
                    {d.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 border-b border-ink/5 py-2.5 last:border-0">
                            <button className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-brand-500 text-brand-600 hover:bg-brand-50" title="Mark done" onClick={() => act(() => post(`crm/tasks/${task.id}`, { status: 'done' }), 'Task done', ws.reload)}><Check size={13} /></button>
                            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{task.title}</div>{task.due_at && <div className={`text-xs ${new Date(task.due_at) < new Date() ? 'text-red-600' : 'text-ink/45'}`}>Due {dt(task.due_at)}</div>}</div>
                            <Badge value={task.priority} />
                            {task.status === 'todo' && <button className="btn-ghost btn-sm" onClick={() => act(() => post(`crm/tasks/${task.id}`, { status: 'in_progress' }), null, ws.reload)}>Start</button>}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="card p-5">
                    <div className="mb-2 flex items-center justify-between font-bold">My leave<button className="btn-outline btn-sm" onClick={() => setModal('leave')}><CalendarOff size={13} />Request leave</button></div>
                    {d.leaves.map((l) => <div key={l.id} className="flex justify-between border-b border-ink/5 py-2 text-sm last:border-0"><span>{title(l.type)} · {dt(l.from, false)} → {dt(l.to, false)}</span><Badge value={l.status} /></div>)}
                    {!d.leaves.length && <div className="py-4 text-sm text-ink/45">No leave requests.</div>}
                    <div className="mt-4 mb-1 font-bold">This month</div>
                    <div className="text-sm text-ink/60">{d.month.filter((a) => a.check_in).length} days · {hm(d.month.reduce((s, a) => s + a.minutes_worked, 0))} worked · {d.month.filter((a) => a.late_minutes > 0).length} late · {hm(d.month.reduce((s, a) => s + a.overtime_minutes, 0))} overtime</div>
                </div>
                <div className="card p-5">
                    <div className="mb-2 flex items-center justify-between font-bold">My expense requests<button className="btn-outline btn-sm" onClick={() => setModal('expense')}><Banknote size={13} />New request</button></div>
                    {reqs.rows.map((r) => <div key={r.id} className="flex justify-between border-b border-ink/5 py-2 text-sm last:border-0"><span>{r.title} · {money(r.amount)}</span><Badge value={r.status} /></div>)}
                    {!reqs.rows.length && <div className="py-4 text-sm text-ink/45">No requests.</div>}
                </div>
            </div>

            <Modal open={modal === 'leave'} onClose={() => setModal(null)} title="Request leave">
                {modal === 'leave' && <Form submitLabel="Send to HR" onSubmit={async (v) => { await post('crm/leaves', v); toast('Leave request sent'); setModal(null); ws.reload(); }} fields={[
                    { name: 'type', label: 'Type', type: 'select', options: ['casual', 'sick', 'annual', 'unpaid'], default: 'casual', required: true },
                    { name: 'from', label: 'From', type: 'date', required: true, half: true }, { name: 'to', label: 'To', type: 'date', required: true, half: true }, { name: 'reason', label: 'Reason', type: 'textarea', rows: 2 },
                ]} />}
            </Modal>
            <Modal open={modal === 'expense'} onClose={() => setModal(null)} title="Expense request">
                {modal === 'expense' && <Form submitLabel="Submit for approval" onSubmit={async (v) => { await post('finance/expense-requests', v); toast('Request sent to Admin for approval'); setModal(null); reqs.reload(); }} fields={[
                    { name: 'title', label: 'What is it for?', required: true }, { name: 'amount', label: 'Amount (Rs)', type: 'number', min: 1, required: true, half: true },
                    { name: 'category', label: 'Category', type: 'select', options: ['utilities', 'repair', 'security', 'cleaning', 'gardening', 'events', 'office', 'allowance', 'other'], default: 'other', required: true, half: true },
                    { name: 'purpose', label: 'Details', type: 'textarea' }, { name: 'receipt', label: 'Quotation / bill', type: 'file', accept: 'image/*,.pdf' },
                ]} />}
            </Modal>
        </div>
    );
}
