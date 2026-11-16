import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Wallet, CalendarDays, Undo2, Download } from 'lucide-react';
import { PageHeader, Select, Stat, Tabs, exportCsv } from '../../components/ui';
import { dt } from '../../lib/api';
import { Loading, Panel, PaymentSettings, PROVIDER, usd, usePlatform } from './kit';

function Ledger() {
    const [f, setF] = useState({ type: 'money', provider: '' });
    const [d] = usePlatform('payments', f);
    if (!d) return <Loading />;
    const rows = d.data;
    return (
        <>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Collected, all time" value={usd(d.totals.all_time)} icon={Wallet} tone="green" />
                <Stat label="Collected this month" value={usd(d.totals.this_month)} icon={CalendarDays} tone="brand" />
                <Stat label="Refunded" value={usd(Math.abs(d.totals.refunds))} icon={Undo2} tone="red" />
            </div>
            <Panel pad={false} title="Ledger" action={
                <div className="flex flex-wrap gap-2">
                    <Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: 'money', label: 'Payments & refunds' }, { value: 'subscription', label: 'Subscription changes' }, { value: '', label: 'Everything' }]} />
                    <Select value={f.provider} onChange={(v) => setF({ ...f, provider: v })} placeholder="Any provider" options={Object.entries(PROVIDER).map(([value, label]) => ({ value, label }))} />
                    <button className="btn-outline btn-sm" onClick={() => exportCsv('payments.csv', rows, [['Date', (r) => r.occurred_at], ['Community', (r) => r.society?.name || ''], ['Type', (r) => r.type], ['Provider', (r) => r.provider], ['Plan', (r) => r.plan || ''], ['Amount', (r) => r.amount ?? ''], ['Currency', (r) => r.currency], ['Reference', (r) => r.reference || ''], ['Description', (r) => r.description || '']].map(([label, value]) => ({ label, value })))}><Download size={13} />CSV</button>
                </div>}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="border-b border-ink/[.07] bg-canvas/60"><tr><th className="th">Date</th><th className="th">Community</th><th className="th">What</th><th className="th">Provider</th><th className="th">Reference</th><th className="th text-right">Amount</th></tr></thead>
                        <tbody className="divide-y divide-ink/[.05]">
                            {rows.map((p) => (
                                <tr key={p.id}>
                                    <td className="td whitespace-nowrap">{dt(p.occurred_at)}</td>
                                    <td className="td">{p.society ? <Link className="font-semibold hover:text-brand-600" to={`/platform/communities/${p.society.id}`}>{p.society.name}</Link> : <span className="text-ink/45">Deleted community</span>}</td>
                                    <td className="td">{p.description || p.type}{p.plan && <span className="text-ink/45"> · {p.plan}</span>}</td>
                                    <td className="td">{PROVIDER[p.provider] || p.provider}</td>
                                    <td className="td font-mono text-xs text-ink/55">{p.reference || '—'}</td>
                                    <td className={`td text-right font-semibold ${p.amount < 0 ? 'text-red-600' : ''}`}>{p.amount !== null ? usd(p.amount, 2) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!rows.length && <p className="p-10 text-center text-sm text-ink/45">Nothing here yet. Card payments arrive from the payment provider by webhook; bank transfers can be recorded on a community's page.</p>}
            </Panel>
        </>
    );
}

export default function Payments({ owner }) {
    const [tab, setTab] = useState('ledger');
    return (
        <div>
            <PageHeader icon={Receipt} title="Payments" subtitle="Every charge, refund and subscription change across the platform." />
            {owner && <Tabs value={tab} onChange={setTab} tabs={[{ key: 'ledger', label: 'Ledger' }, { key: 'provider', label: 'Payment provider' }]} />}
            {tab === 'ledger' ? <Ledger /> : <Panel title="How communities pay"><div className="max-w-2xl"><PaymentSettings /></div></Panel>}
        </div>
    );
}
