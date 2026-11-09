import { useState } from 'react';
import { BriefcaseBusiness, Plus, Clock, CalendarOff, ListTodo, Users, Pencil, Check, X, CreditCard, Download } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, useTab, urlParam, useAction, useToast, Stat, exportCsv } from '../components/ui';
import { post, put, dt, title, money, today } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const hm = (m) => `${Math.floor((m || 0) / 60)}h ${String((m || 0) % 60).padStart(2, '0')}m`;
const time = (s) => (s ? new Date(s).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function Crm() {
    const { can, approve } = useAuth();
    const manage = can('crm', true);
    const [tab, setTab] = useTab('attendance');
    const [date, setDate] = useState(today());
    const [month, setMonth] = useState(today().slice(0, 7));
    const emps = useList(tab === 'staff' ? 'crm/employees' : null, { q: urlParam('q') });
    const att = useGet(tab === 'attendance' ? `crm/attendance?date=${date}` : null, [date]);
    const report = useGet(tab === 'report' ? `crm/report?month=${month}` : null, [month]);
    const leaves = useList(tab === 'leave' ? 'crm/leaves' : null, { status: '' });
    const tasks = useList(tab === 'tasks' ? 'crm/tasks' : null);
    const allEmps = useGet('crm/employees?all=1');
    const staffUsers = useGet(manage ? 'users?staff=1' : null);
    const [modal, setModal] = useState(null);
    const [card, setCard] = useState('');
    const act = useAction();
    const toast = useToast();
    const refresh = () => { emps.reload(); att.reload(); report.reload(); leaves.reload(); tasks.reload(); allEmps.reload(); };
    useLive('crm', refresh);

    const rows = att.data || [];
    const present = rows.filter((r) => r.attendance?.check_in).length;
    const depts = [...new Set((allEmps.data || []).map((e) => e.department))];
    const empOpts = (allEmps.data || []).map((e) => ({ value: e.id, label: `${e.name} · ${e.department}` }));

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={BriefcaseBusiness} title="Staff CRM" subtitle="Employees, online attendance with automatic working hours, leave and department tasks.">
                {manage && <button className="btn-outline" onClick={() => setModal({ mode: 'task' })}><ListTodo size={16} />New task</button>}
                {manage && <button className="btn-primary" onClick={() => setModal({ mode: 'emp' })}><Plus size={16} />Add employee</button>}
            </PageHeader>
            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'attendance', label: 'Attendance', icon: Clock }, { key: 'report', label: 'Monthly hours' }, { key: 'staff', label: 'Employees', icon: Users }, { key: 'leave', label: 'Leave', icon: CalendarOff }, { key: 'tasks', label: 'Tasks', icon: ListTodo }]} />

            {tab === 'attendance' && (
                <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label="Present" value={`${present} / ${rows.length}`} tone="green" />
                        <Stat label="Late arrivals" value={rows.filter((r) => r.attendance?.late_minutes > 0).length} tone="red" />
                        <Stat label="Still on duty" value={rows.filter((r) => r.attendance?.check_in && !r.attendance?.check_out).length} tone="blue" />
                        <Stat label="Hours logged" value={hm(rows.reduce((a, r) => a + (r.attendance?.minutes_worked || 0), 0))} tone="sand" />
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
                        {manage && date === today() && (
                            <form className="ml-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); if (card) act(() => post('crm/punch-for', { card }), null, (r) => { toast(`${r.employee.name} ${r.check_out ? 'checked out' : 'checked in'}`); setCard(''); refresh(); }); }}>
                                <CreditCard className="mt-2 text-ink/40" size={18} />
                                <input className="input w-48 font-mono" placeholder="Tap RFID card…" value={card} onChange={(e) => setCard(e.target.value)} />
                                <button className="btn-outline">Punch</button>
                            </form>
                        )}
                    </div>
                    <div className="card overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-ink/5"><tr>{['Employee', 'Shift', 'Check in', 'Check out', 'Worked', 'Late', 'Overtime', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                            <tbody className="divide-y divide-ink/5">
                                {rows.map(({ employee: e, attendance: a }) => (
                                    <tr key={e.id}>
                                        <td className="td"><div className="font-semibold">{e.name}</div><div className="text-xs text-ink/45">{e.code} · {e.department}</div></td>
                                        <td className="td text-xs">{e.shift_start?.slice(0, 5)}–{e.shift_end?.slice(0, 5)}</td>
                                        <td className="td">{a?.check_in ? <span className="font-semibold">{time(a.check_in)}</span> : <Badge value={e.status === 'on_leave' ? 'pending' : 'closed'}>{e.status === 'on_leave' ? 'On leave' : 'Absent'}</Badge>}{a?.method && a.method !== 'web' && <span className="ml-1 text-[10px] text-ink/40">{a.method}</span>}</td>
                                        <td className="td">{a?.check_out ? time(a.check_out) : a?.check_in ? <Badge value="inside">On duty</Badge> : '—'}</td>
                                        <td className="td font-semibold">{a?.check_out ? hm(a.minutes_worked) : '—'}</td>
                                        <td className="td">{a?.late_minutes ? <span className="text-red-600">{a.late_minutes}m</span> : '—'}</td>
                                        <td className="td">{a?.overtime_minutes ? <span className="text-emerald-700">{hm(a.overtime_minutes)}</span> : '—'}</td>
                                        <td className="td text-right">{manage && date === today() && (!a?.check_out) && <button className="btn-ghost btn-sm" onClick={() => act(() => post('crm/punch-for', { employee_id: e.id }), a?.check_in ? 'Checked out' : 'Checked in', refresh)}>{a?.check_in ? 'Check out' : 'Check in'}</button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {tab === 'report' && (
                <>
                    <div className="mb-3 flex gap-2"><input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
                        <button className="btn-outline ml-auto" onClick={() => exportCsv(`attendance-${month}.csv`, report.data || [], [{ label: 'Code', value: (r) => r.employee.code }, { label: 'Name', value: (r) => r.employee.name }, { label: 'Department', value: (r) => r.employee.department }, { label: 'Days', value: (r) => r.days }, { label: 'Hours', value: (r) => r.hours }, { label: 'Late days', value: (r) => r.late_days }, { label: 'Overtime hours', value: (r) => r.overtime_hours }])}><Download size={15} />CSV</button></div>
                    <div className="card overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-ink/5"><tr>{['Employee', 'Department', 'Days present', 'Hours worked', 'Late days', 'Late (min)', 'Overtime'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                            <tbody className="divide-y divide-ink/5">
                                {(report.data || []).map((r) => (
                                    <tr key={r.employee.id}><td className="td font-semibold">{r.employee.name}<div className="text-xs font-normal text-ink/45">{r.employee.code}</div></td><td className="td">{r.employee.department}</td><td className="td">{r.days}</td><td className="td font-semibold">{r.hours} h</td><td className="td">{r.late_days}</td><td className="td">{r.late_minutes}</td><td className="td text-emerald-700">{r.overtime_hours} h</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {tab === 'staff' && (
                <>
                    <div className="mb-3 flex gap-2"><SearchBox value={emps.params.q} onChange={(q) => emps.set({ q })} placeholder="Name, code…" /><Select value={emps.params.department} onChange={(department) => emps.set({ department })} placeholder="All departments" options={depts} /></div>
                    <Table list={emps} empty="No employees." onRow={manage ? (e) => setModal({ mode: 'emp', ...e, shift_start: e.shift_start?.slice(0, 5), shift_end: e.shift_end?.slice(0, 5), user_id: e.user_id || '' }) : undefined} columns={[
                        { label: 'Employee', render: (e) => <div><div className="font-semibold">{e.name}</div><div className="text-xs text-ink/45">{e.code}{e.user ? ' · login ' + e.user.email : ''}</div></div> },
                        { label: 'Department', render: (e) => <div>{e.department}<div className="text-xs text-ink/45">{e.designation}</div></div> },
                        { label: 'Shift', render: (e) => `${e.shift_start?.slice(0, 5)}–${e.shift_end?.slice(0, 5)}` },
                        { label: 'Phone', key: 'phone' },
                        { label: 'Joined', render: (e) => e.joined_on ? dt(e.joined_on, false) : '—' },
                        { label: 'Basic salary', render: (e) => money(e.basic_salary) },
                        { label: 'Today', render: (e) => e.today?.check_in ? <Badge value="inside">In {time(e.today.check_in)}</Badge> : <Badge value="closed">Not in</Badge> },
                        { label: 'Status', render: (e) => <Badge value={e.status === 'active' ? 'approved' : e.status === 'on_leave' ? 'pending' : 'rejected'}>{title(e.status)}</Badge> },
                    ]} />
                </>
            )}

            {tab === 'leave' && (
                <>
                    <div className="mb-3"><Select value={leaves.params.status} onChange={(status) => leaves.set({ status })} placeholder="All" options={['pending', 'approved', 'rejected']} /></div>
                    <Table list={leaves} empty="No leave requests." columns={[
                        { label: 'Employee', render: (l) => <div className="font-semibold">{l.employee?.name}<div className="text-xs font-normal text-ink/45">{l.employee?.department}</div></div> },
                        { label: 'Type', render: (l) => title(l.type) },
                        { label: 'Dates', render: (l) => `${dt(l.from, false)} → ${dt(l.to, false)}` },
                        { label: 'Reason', key: 'reason', className: 'max-w-64' },
                        { label: 'Status', render: (l) => <div><Badge value={l.status} />{l.reviewer && <div className="text-[10px] text-ink/45">by {l.reviewer.name}</div>}</div> },
                        { label: '', className: 'text-right', render: (l) => approve('crm') && l.status === 'pending' && <div className="flex justify-end gap-1"><button className="btn-primary btn-sm" onClick={() => act(() => post(`crm/leaves/${l.id}/review`, { status: 'approved' }), 'Approved', refresh)}><Check size={13} />Approve</button><button className="btn-ghost btn-sm text-red-600" onClick={() => act(() => post(`crm/leaves/${l.id}/review`, { status: 'rejected' }), 'Rejected', refresh)}><X size={13} /></button></div> },
                    ]} />
                </>
            )}

            {tab === 'tasks' && (
                <div className="grid gap-4 lg:grid-cols-3">
                    {[['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']].map(([st, label]) => (
                        <div key={st} className="rounded-2xl bg-ink/[.03] p-3">
                            <div className="mb-2 flex items-center justify-between px-1 text-sm font-bold">{label}<span className="text-xs text-ink/45">{tasks.rows.filter((t) => t.status === st).length}</span></div>
                            <div className="space-y-2">
                                {tasks.rows.filter((t) => t.status === st).map((t) => {
                                    const overdue = t.due_at && st !== 'done' && new Date(t.due_at) < new Date();
                                    return (
                                        <div key={t.id} className="card p-3">
                                            <div className="flex items-start justify-between gap-2"><div className="text-sm font-semibold">{t.title}</div><Badge value={t.priority} /></div>
                                            <div className="mt-1 text-xs text-ink/50">{t.employee?.name || 'Unassigned'}{t.department ? ' · ' + t.department : ''}</div>
                                            {t.due_at && <div className={`mt-1 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-ink/45'}`}>Due {dt(t.due_at)}{overdue ? ' — overdue' : ''}</div>}
                                            {manage && <div className="mt-2 flex gap-1">{['todo', 'in_progress', 'done'].filter((x) => x !== st).map((x) => <button key={x} className="btn-ghost btn-sm" onClick={() => act(() => post(`crm/tasks/${t.id}`, { status: x }), null, refresh)}>→ {title(x)}</button>)}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={modal?.mode === 'emp'} onClose={() => setModal(null)} title={modal?.id ? 'Edit employee' : 'Add employee'} wide>
                {modal?.mode === 'emp' && <Form initial={{ status: 'active', shift_start: '09:00', shift_end: '17:00', ...modal }} onSubmit={async (v) => { modal.id ? await put(`crm/employees/${modal.id}`, v) : await post('crm/employees', v); toast('Employee saved'); setModal(null); refresh(); }} fields={[
                    { name: 'name', label: 'Full name', required: true, half: true }, { name: 'department', label: 'Department', required: true, half: true, placeholder: 'Security, Maintenance…' },
                    { name: 'designation', label: 'Designation', half: true }, { name: 'phone', label: 'Phone', half: true },
                    { name: 'cnic', label: 'CNIC', half: true }, { name: 'emergency_contact', label: 'Emergency contact', half: true },
                    { name: 'shift_start', label: 'Shift start', type: 'time', required: true, half: true }, { name: 'shift_end', label: 'Shift end', type: 'time', required: true, half: true },
                    { name: 'joined_on', label: 'Joined on', type: 'date', half: true }, { name: 'basic_salary', label: 'Basic salary (Rs)', type: 'number', min: 0, half: true },
                    { name: 'rfid_card', label: 'RFID card no.', half: true }, { name: 'status', label: 'Status', type: 'select', options: ['active', 'on_leave', 'terminated'], required: true, half: true },
                    { name: 'user_id', label: 'Portal login (for self check-in)', type: 'select', options: (staffUsers.data || []).map((u) => ({ value: u.id, label: `${u.name} · ${u.designation || u.role}` })) },
                ]} />}
            </Modal>
            <Modal open={modal?.mode === 'task'} onClose={() => setModal(null)} title="New task">
                {modal?.mode === 'task' && <Form onSubmit={async (v) => { await post('crm/tasks', v); toast('Task assigned'); setModal(null); setTab('tasks'); refresh(); }} fields={[
                    { name: 'title', label: 'Task', required: true }, { name: 'description', label: 'Details', type: 'textarea', rows: 2 },
                    { name: 'employee_id', label: 'Assign to', type: 'select', options: empOpts, half: true }, { name: 'department', label: 'Department', half: true },
                    { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'], default: 'normal', required: true, half: true }, { name: 'due_at', label: 'Deadline', type: 'datetime-local', half: true },
                ]} />}
            </Modal>
        </div>
    );
}
