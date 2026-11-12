import { useMemo, useState } from 'react';
import { Wallet, Plus, Check, X, Banknote, Printer, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Stat, FileLink, Confirm, useAction, useToast, useHouses, useTab } from '../components/ui';
import { useLive } from '../lib/alerts';
import { post, del, dt, money, title, today, LOCALE, CURRENCY } from '../lib/api';
import { useAuth } from '../lib/auth';

const CATS = {
    revenue: ['maintenance', 'subscription', 'event', 'penalty', 'dues', 'fine', 'other'],
    expense: ['utilities', 'repair', 'security', 'cleaning', 'gardening', 'events', 'office', 'allowance', 'other'],
    salary: ['salary'],
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

function printReceipt(t) {
    const w = window.open('', '_blank', 'width=420,height=600');
    w.document.write(`<html><head><title>Receipt</title><style>body{font-family:system-ui;padding:24px}h2{margin:0}table{width:100%;margin-top:16px;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #eee;font-size:14px}td:last-child{text-align:right;font-weight:600}.amt{font-size:26px;font-weight:700;margin:16px 0}</style></head><body>
    <h2>${window.APP?.name || 'Community'}</h2><div style="color:#666;font-size:13px">${t.type === 'revenue' ? 'Payment receipt' : t.type === 'salary' ? 'Salary slip' : 'Expense / allowance voucher'} #${t.id}</div>
    <div class="amt">${money(t.amount)}</div><table>
    <tr><td>Date</td><td>${dt(t.date, false)}</td></tr><tr><td>Category</td><td>${title(t.category)}</td></tr>
    ${t.house ? `<tr><td>House</td><td>${t.house.label}</td></tr>` : ''}${t.staff || t.party ? `<tr><td>${t.type === 'revenue' ? 'Received from' : 'Paid to'}</td><td>${t.staff?.name || t.party}</td></tr>` : ''}
    ${t.period ? `<tr><td>Period</td><td>${t.period}</td></tr>` : ''}${t.reference ? `<tr><td>Reference</td><td>${t.reference}</td></tr>` : ''}
    ${t.description ? `<tr><td>Note</td><td>${t.description}</td></tr>` : ''}<tr><td>Recorded by</td><td>${t.recorder?.name || ''}</td></tr></table>
    <p style="margin-top:40px;font-size:12px;color:#888">Signature ____________________</p><script>print()</script></body></html>`);
    w.document.close();
}

function MyBills() {
    const { data } = useGet('finance/my');
    if (!data) return null;
    const p = data.pay_to || {};
    return (
        <div className="mx-auto max-w-5xl">
            <PageHeader icon={Wallet} title="My Bills & Payments" subtitle={`House ${data.house.block ? data.house.block + '-' : ''}${data.house.house_no} · monthly maintenance ${money(data.house.monthly_maintenance)}`} />
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <Stat label="Outstanding (12 months)" value={money(data.outstanding)} tone={data.outstanding ? 'red' : 'green'} icon={Wallet} />
                <Stat label="Months paid" value={`${data.months.filter((m) => m.paid > 0).length} / 12`} tone="brand" />
                <Stat label="Total paid" value={money(data.payments.reduce((a, t) => a + Number(t.amount), 0))} tone="sand" />
            </div>
            <div className="grid gap-5 lg:grid-cols-5">
                <div className="card p-5 lg:col-span-3">
                    <div className="mb-3 font-bold">Monthly maintenance</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {data.months.map((m) => (
                            <div key={m.period} className={`rounded-xl p-3 text-center ${m.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                <div className="text-xs font-semibold">{new Date(m.period + '-01').toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' })}</div>
                                <div className="text-sm font-bold">{m.paid ? '✓ Paid' : money(m.due)}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="card p-5 lg:col-span-2">
                    <div className="mb-2 font-bold">How to pay</div>
                    {p.payment_account || p.payment_iban || p.payment_wallet ? (
                        <div className="space-y-1 text-sm">{[['Title', p.payment_title], ['Bank', p.payment_bank], ['Account', p.payment_account], ['IBAN', p.payment_iban], ['Wallet', p.payment_wallet]].filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span className="text-ink/50">{k}</span><span className="font-mono font-semibold">{v}</span></div>)}
                            <p className="pt-2 text-xs text-ink/50">Use your house number ({data.house.block}-{data.house.house_no}) as the payment reference.</p></div>
                    ) : <p className="text-sm text-ink/55">Pay at the community office. Online details will appear here once set by the admin.</p>}
                </div>
            </div>
            <div className="card mt-5 p-5">
                <div className="mb-2 font-bold">Payment history</div>
                {data.payments.map((t) => <div key={t.id} className="flex justify-between border-b border-ink/5 py-2 text-sm last:border-0"><span>{title(t.category)}{t.period ? ' · ' + t.period : ''} · {dt(t.date, false)}</span><span className="flex items-center gap-3 font-semibold">{money(t.amount)}<button className="btn-ghost btn-sm" onClick={() => printReceipt(t)}><Printer size={13} /></button></span></div>)}
                {!data.payments.length && <div className="text-sm text-ink/45">No payments recorded yet.</div>}
            </div>
        </div>
    );
}

export default function Finance() {
    const { isResident } = useAuth();
    return isResident ? <MyBills /> : <FinanceStaff />;
}

function FinanceStaff() {
    const { can, approve, isAdmin: isAdm } = useAuth();
    const isAdmin = isAdm; const canDelete = approve('finance');
    const manage = can('finance', true);
    const [tab, setTab] = useTab(manage ? 'overview' : 'requests');
    const [period, setPeriod] = useState(thisMonth());
    const [modal, setModal] = useState(null);
    const summary = useGet(manage && tab === 'overview' ? 'finance/summary' : null);
    const tx = useList(manage && tab === 'transactions' ? 'finance/transactions' : null);
    const maint = useGet(manage && tab === 'maintenance' ? `finance/maintenance?period=${period}` : null, [period]);
    const sal = useGet(manage && tab === 'salaries' ? `finance/salaries?period=${period}` : null, [period]);
    const reqs = useList(tab === 'requests' ? 'finance/expense-requests' : null);
    const houses = useHouses(manage);
    const act = useAction();
    const toast = useToast();

    const refresh = () => { summary.reload(); tx.reload(); maint.reload(); sal.reload(); reqs.reload(); };
    useLive('finance', refresh);
    const txFields = (type) => [
        { name: 'type', label: 'Type', type: 'select', options: ['revenue', 'expense', 'salary'], required: true, half: true, default: type || 'revenue' },
        { name: 'category', label: 'Category', type: 'select', required: true, half: true, options: CATS[modal?.values?.type || modal?.type || 'revenue'] },
        { name: 'amount', label: `Amount (${CURRENCY})`, type: 'number', min: 1, required: true, half: true },
        { name: 'date', label: 'Date', type: 'date', required: true, half: true, default: today() },
        { name: 'house_id', label: 'House', type: 'select', options: houses, half: true, show: (v) => v.type === 'revenue' },
        { name: 'period', label: 'For month', type: 'month', half: true, show: (v) => ['maintenance', 'subscription', 'salary'].includes(v.category) },
        { name: 'party', label: 'Paid to / received from', half: true },
        { name: 'reference', label: 'Reference / receipt no.', half: true },
        { name: 'receipt', label: 'Receipt / bill', type: 'file', accept: 'image/*,.pdf' },
        { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
    ];

    const saveTx = async (v) => {
        const t = await post('finance/transactions', v);
        toast('Entry saved');
        setModal(null);
        refresh();
        if (window.confirm('Print receipt?')) printReceipt(t);
    };

    const s = summary.data;
    const maintStats = useMemo(() => {
        const rows = maint.data || [];
        return { paid: rows.filter((r) => r.paid > 0).length, total: rows.length, collected: rows.reduce((a, r) => a + r.paid, 0), due: rows.reduce((a, r) => a + (r.paid > 0 ? 0 : r.due), 0) };
    }, [maint.data]);

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={Wallet} title="Finance" subtitle={manage ? 'Salaries, revenue, maintenance, expenses and approvals.' : 'Submit and track your expense requests.'}>
                <button className="btn-outline" onClick={() => setModal({ mode: 'request' })}><Banknote size={16} />Expense request</button>
                {manage && <button className="btn-primary" onClick={() => setModal({ mode: 'tx', type: 'revenue' })}><Plus size={16} />New entry</button>}
            </PageHeader>
            <Tabs value={tab} onChange={setTab} tabs={[
                manage && { key: 'overview', label: 'Overview' }, manage && { key: 'transactions', label: 'Transactions' },
                manage && { key: 'maintenance', label: 'Monthly maintenance' }, manage && { key: 'salaries', label: 'Salaries' },
                { key: 'requests', label: isAdmin ? 'Expense approvals' : 'Expense requests' },
            ]} />

            {tab === 'overview' && s && (
                <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label="Revenue (this month)" value={money(s.revenue)} icon={TrendingUp} tone="green" />
                        <Stat label="Expenses" value={money(s.expense)} icon={TrendingDown} tone="red" />
                        <Stat label="Salaries" value={money(s.salary)} icon={Users} tone="blue" />
                        <Stat label="Net balance" value={money(s.revenue - s.expense - s.salary)} icon={Wallet} tone={s.revenue - s.expense - s.salary >= 0 ? 'brand' : 'red'} />
                    </div>
                    <div className="card p-5">
                        <div className="mb-3 font-bold">By category</div>
                        <div className="space-y-2">
                            {s.by_category.map((c) => {
                                const max = Math.max(...s.by_category.map((x) => Number(x.total)));
                                return (
                                    <div key={c.type + c.category} className="grid grid-cols-[140px_1fr_110px] items-center gap-3 text-sm">
                                        <span className="flex items-center gap-2"><Badge value={c.type} />{title(c.category)}</span>
                                        <div className="h-2.5 rounded-full bg-ink/5"><div className={`h-full rounded-full ${c.type === 'revenue' ? 'bg-brand-500' : 'bg-sand-400'}`} style={{ width: `${(c.total / max) * 100}%` }} /></div>
                                        <span className="text-right font-semibold">{money(c.total)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {tab === 'transactions' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={tx.params.q} onChange={(q) => tx.set({ q })} placeholder="Party, reference…" />
                        <Select value={tx.params.type} onChange={(type) => tx.set({ type, category: '' })} placeholder="All types" options={['revenue', 'expense', 'salary']} />
                        <Select value={tx.params.category} onChange={(category) => tx.set({ category })} placeholder="All categories" options={tx.params.type ? CATS[tx.params.type] : [...CATS.revenue, ...CATS.expense, 'salary']} />
                        <input type="month" className="input w-auto" value={tx.params.month || ''} onChange={(e) => tx.set({ month: e.target.value })} />
                    </div>
                    <Table list={tx} empty="No transactions." columns={[
                        { label: 'Date', render: (t) => dt(t.date, false) },
                        { label: 'Type', render: (t) => <Badge value={t.type} /> },
                        { label: 'Category', render: (t) => title(t.category) + (t.period ? ` · ${t.period}` : '') },
                        { label: 'Party', render: (t) => t.house?.label || t.staff?.name || t.party || '—' },
                        { label: 'Amount', className: 'text-right', render: (t) => <span className={`font-semibold ${t.type === 'revenue' ? 'text-emerald-700' : 'text-red-700'}`}>{t.type === 'revenue' ? '+' : '−'}{money(t.amount)}</span> },
                        { label: '', className: 'text-right', render: (t) => (
                            <div className="flex items-center justify-end gap-1">
                                <FileLink path={t.receipt_path} label="Bill" />
                                <button className="btn-ghost btn-sm" onClick={() => printReceipt(t)}><Printer size={13} /></button>
                                {canDelete && <Confirm className="btn-ghost btn-sm text-red-600" message="Delete this entry?" onConfirm={() => act(() => del(`finance/transactions/${t.id}`), 'Deleted', refresh)}>×</Confirm>}
                            </div>
                        ) },
                    ]} />
                </>
            )}

            {(tab === 'maintenance' || tab === 'salaries') && (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <input type="month" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} />
                    {tab === 'maintenance' && <span className="text-sm text-ink/60"><b>{maintStats.paid}</b>/{maintStats.total} houses paid · collected <b>{money(maintStats.collected)}</b> · outstanding <b className="text-red-600">{money(maintStats.due)}</b></span>}
                </div>
            )}
            {tab === 'maintenance' && (
                <div className="card overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b border-ink/5"><tr>{['House', 'Owner', 'Monthly due', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-ink/5">
                            {(maint.data || []).map((r) => (
                                <tr key={r.house.id}>
                                    <td className="td font-semibold">{r.house.label}</td>
                                    <td className="td">{r.house.owner_name}</td>
                                    <td className="td">{money(r.due)}</td>
                                    <td className="td">{r.paid > 0 ? <Badge value="paid">Paid {dt(r.paid_on, false)}</Badge> : <Badge value="pending">Unpaid</Badge>}</td>
                                    <td className="td text-right">{!r.paid && <button className="btn-outline btn-sm" onClick={() => setModal({ mode: 'tx', type: 'revenue', category: 'maintenance', house_id: r.house.id, amount: r.due, period, reference: `MNT-${period}-${r.house.id}` })}>Record payment</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {tab === 'salaries' && (
                <div className="card overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b border-ink/5"><tr>{['Staff', 'Role', 'Last salary', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-ink/5">
                            {(sal.data || []).map((r) => (
                                <tr key={r.staff.id}>
                                    <td className="td font-semibold">{r.staff.name}</td>
                                    <td className="td">{title(r.staff.role)}</td>
                                    <td className="td">{r.last_amount ? money(r.last_amount) : '—'}</td>
                                    <td className="td">{r.paid > 0 ? <Badge value="paid">Paid {money(r.paid)}</Badge> : <Badge value="pending">Not paid</Badge>}</td>
                                    <td className="td text-right">{!r.paid && <button className="btn-outline btn-sm" onClick={() => setModal({ mode: 'tx', type: 'salary', category: 'salary', staff_id: r.staff.id, party: r.staff.name, amount: r.last_amount || '', period })}>Pay salary</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'requests' && (
                <>
                    <div className="mb-3 flex gap-2">
                        <Select value={reqs.params.status} onChange={(status) => reqs.set({ status })} placeholder="All" options={['pending', 'approved', 'rejected', 'paid']} />
                    </div>
                    <Table list={reqs} empty="No expense requests." columns={[
                        { label: 'Request', render: (r) => <div><div className="font-semibold">{r.title}</div><div className="max-w-72 text-xs text-ink/50">{r.purpose}</div></div> },
                        { label: 'Requested by', render: (r) => <div>{r.requester?.name}<div className="text-xs text-ink/45">{title(r.requester?.role)} · {dt(r.created_at)}</div></div> },
                        { label: 'Amount', render: (r) => <b>{money(r.amount)}</b> },
                        { label: 'Status', render: (r) => <div><Badge value={r.status} />{r.review_note && <div className="mt-1 text-xs text-ink/50">{r.review_note}</div>}</div> },
                        { label: '', className: 'text-right', render: (r) => (
                            <div className="flex items-center justify-end gap-1">
                                <FileLink path={r.receipt_path} label="Bill" />
                                {isAdmin && r.status === 'pending' && <>
                                    <button className="btn-primary btn-sm" onClick={() => act(() => post(`finance/expense-requests/${r.id}/review`, { status: 'approved', review_note: window.prompt('Note (optional)') || '' }), 'Approved', refresh)}><Check size={13} />Approve</button>
                                    <button className="btn-ghost btn-sm text-red-600" onClick={() => act(() => post(`finance/expense-requests/${r.id}/review`, { status: 'rejected', review_note: window.prompt('Reason') || '' }), 'Rejected', refresh)}><X size={13} /></button>
                                </>}
                                {manage && r.status === 'approved' && <button className="btn-outline btn-sm" onClick={() => act(() => post(`finance/expense-requests/${r.id}/pay`), 'Paid & recorded', refresh)}><Banknote size={13} />Release payment</button>}
                            </div>
                        ) },
                    ]} />
                </>
            )}

            <Modal open={modal?.mode === 'tx'} onClose={() => setModal(null)} title="New finance entry">
                {modal?.mode === 'tx' && <Form fields={txFields(modal.type)} initial={modal} onSubmit={saveTx} onChange={(values) => setModal((m) => (m.values?.type === values.type ? m : { ...m, values }))} />}
            </Modal>
            <Modal open={modal?.mode === 'request'} onClose={() => setModal(null)} title="Expense request">
                {modal?.mode === 'request' && <Form onSubmit={async (v) => { await post('finance/expense-requests', v); toast('Request sent to Admin for approval'); setModal(null); setTab('requests'); reqs.reload(); }} submitLabel="Submit request" fields={[
                    { name: 'title', label: 'What is it for?', required: true },
                    { name: 'amount', label: `Amount (${CURRENCY})`, type: 'number', min: 1, required: true, half: true },
                    { name: 'category', label: 'Category', type: 'select', options: CATS.expense, required: true, half: true, default: 'other' },
                    { name: 'purpose', label: 'Details / justification', type: 'textarea' },
                    { name: 'receipt', label: 'Quotation / bill', type: 'file', accept: 'image/*,.pdf' },
                ]} />}
            </Modal>
        </div>
    );
}
