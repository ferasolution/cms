import { useEffect, useState } from 'react';
import { MessageSquareWarning, Plus, UserCheck, CheckCircle2, Star, BarChart3, Wrench } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Stat, FileLink, useAction, useToast, useHouses } from '../components/ui';
import { post, dt, ago, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const CATS = ['plumbing', 'electrical', 'cleaning', 'security', 'gardening', 'construction', 'noise', 'parking', 'other'];
const PRI = ['low', 'normal', 'high', 'urgent'];

export default function Complaints() {
    const { can, isResident } = useAuth();
    const manage = can('complaints', true);
    const [tab, setTab] = useState('list');
    const list = useList('complaints', { status: '', q: new URLSearchParams(location.search).get('q') || '' });
    const report = useGet(manage && tab === 'report' ? 'complaints/report' : null);
    const houses = useHouses(!isResident);
    const [modal, setModal] = useState(null);
    const act = useAction();
    const toast = useToast();
    useLive('complaints', () => { list.reload(); });

    const done = (msg) => { toast(msg); setModal(null); list.reload(); };

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={MessageSquareWarning} title="Complaint Management" subtitle={manage ? "Manager's portal — align workers and track resolution." : 'Raise complaints online and follow them until resolved.'}>
                <button className="btn-primary" onClick={() => setModal({ mode: 'new' })}><Plus size={16} />New complaint</button>
            </PageHeader>
            {manage && <Tabs value={tab} onChange={setTab} tabs={[{ key: 'list', label: 'Complaints' }, { key: 'report', label: 'Resolution report', icon: BarChart3 }]} />}

            {tab === 'list' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="Ticket, title, worker…" />
                        <Select value={list.params.status} onChange={(status) => list.set({ status })} placeholder="All statuses" options={['open', 'assigned', 'in_progress', 'resolved', 'closed']} />
                        <Select value={list.params.category} onChange={(category) => list.set({ category })} placeholder="All categories" options={CATS} />
                        {manage && <Select value={list.params.priority} onChange={(priority) => list.set({ priority })} placeholder="Any priority" options={PRI} />}
                    </div>
                    <Table list={list} empty="No complaints." onRow={(c) => setModal({ mode: 'view', ...c })} columns={[
                        { label: 'Ticket', render: (c) => <div><div className="font-mono text-xs font-semibold">{c.ticket_no}</div><div className="text-[11px] text-ink/45">{ago(c.created_at)}</div></div> },
                        { label: 'Complaint', render: (c) => <div><div className="font-semibold">{c.title}</div><div className="text-xs text-ink/50">{title(c.category)}{!isResident && c.house ? ' · ' + c.house.label : ''}</div></div> },
                        { label: 'Priority', render: (c) => <Badge value={c.priority} /> },
                        { label: 'Worker', render: (c) => c.assigned_worker ? <span className="flex items-center gap-1"><Wrench size={13} className="text-ink/40" />{c.assigned_worker}</span> : '—' },
                        { label: 'Status', render: (c) => <Badge value={c.status} /> },
                    ]} />
                </>
            )}

            {tab === 'report' && report.data && (
                <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label="Complaints (30 days)" value={report.data.total} />
                        <Stat label="Resolved" value={report.data.resolved} tone="green" icon={CheckCircle2} />
                        <Stat label="Pending" value={report.data.pending} tone="red" />
                        <Stat label="Avg. resolution time" value={report.data.avg_hours ? `${report.data.avg_hours} h` : '—'} sub={report.data.avg_rating ? `Avg rating ${Number(report.data.avg_rating).toFixed(1)} / 5` : ''} tone="sand" />
                    </div>
                    <div className="card p-5">
                        <div className="mb-3 font-bold">By category</div>
                        {report.data.by_category.map((c) => (
                            <div key={c.category} className="mb-2 grid grid-cols-[120px_1fr_70px] items-center gap-3 text-sm">
                                <span>{title(c.category)}</span>
                                <div className="h-2.5 overflow-hidden rounded-full bg-red-100"><div className="h-full bg-emerald-500" style={{ width: `${(c.resolved / c.total) * 100}%` }} /></div>
                                <span className="text-right text-ink/60">{c.resolved}/{c.total}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <Modal open={modal?.mode === 'new'} onClose={() => setModal(null)} title="New complaint">
                {modal?.mode === 'new' && <Form onSubmit={async (v) => { await post('complaints', v); done('Complaint submitted'); }} submitLabel="Submit complaint" fields={[
                    { name: 'category', label: 'Category', type: 'select', options: CATS, required: true, half: true },
                    { name: 'priority', label: 'Priority', type: 'select', options: PRI, default: 'normal', half: true },
                    !isResident && { name: 'house_id', label: 'House', type: 'select', options: houses },
                    { name: 'title', label: 'Short title', required: true },
                    { name: 'description', label: 'Describe the problem', type: 'textarea', rows: 4 },
                    { name: 'photo', label: 'Photo (optional)', type: 'file', accept: 'image/*', capture: 'environment' },
                ].filter(Boolean)} />}
            </Modal>

            <Modal open={modal?.mode === 'view'} onClose={() => setModal(null)} title={`${modal?.ticket_no || ''} · ${modal?.title || ''}`}>
                {modal?.mode === 'view' && (
                    <div className="space-y-4 text-sm">
                        <div className="flex flex-wrap gap-2"><Badge value={modal.status} /><Badge value={modal.priority} /><Badge>{title(modal.category)}</Badge></div>
                        {modal.description && <p className="whitespace-pre-line rounded-xl bg-ink/[.03] p-3">{modal.description}</p>}
                        {modal.photo_path && <img src={`/files/${modal.photo_path}`} className="max-h-56 rounded-xl" alt="" />}
                        <div className="grid grid-cols-2 gap-3">
                            {[['House', modal.house?.label], ['Raised by', modal.user?.name], ['Raised on', dt(modal.created_at)], ['Worker', modal.assigned_worker ? `${modal.assigned_worker}${modal.worker_phone ? ' · ' + modal.worker_phone : ''}` : null], ['Assigned', modal.assigned_at ? dt(modal.assigned_at) + ' by ' + (modal.assigner?.name || '') : null], ['Resolved', modal.resolved_at ? dt(modal.resolved_at) : null]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-ink/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {modal.resolution && <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900"><b>Resolution:</b> {modal.resolution}</div>}

                        {manage && !['resolved', 'closed'].includes(modal.status) && (
                            <div className="space-y-3 border-t border-ink/5 pt-4">
                                <div className="font-semibold">Align worker / labour</div>
                                <Form initial={modal} submitLabel={modal.assigned_worker ? 'Re-assign' : 'Assign'} onSubmit={async (v) => { await post(`complaints/${modal.id}/assign`, v); done('Worker assigned'); }} fields={[
                                    { name: 'assigned_worker', label: 'Worker name', required: true, half: true },
                                    { name: 'worker_phone', label: 'Worker phone', half: true },
                                ]} />
                                <div className="flex flex-wrap gap-2">
                                    {modal.status !== 'in_progress' && <button className="btn-outline btn-sm" onClick={() => act(() => post(`complaints/${modal.id}/status`, { status: 'in_progress' }), 'Marked in progress', () => { setModal(null); list.reload(); })}><UserCheck size={13} />Work started</button>}
                                    <button className="btn-primary btn-sm" onClick={() => { const r = window.prompt('Resolution details'); if (r) act(() => post(`complaints/${modal.id}/status`, { status: 'resolved', resolution: r }), 'Resolved', () => { setModal(null); list.reload(); }); }}><CheckCircle2 size={13} />Mark resolved</button>
                                </div>
                            </div>
                        )}
                        {isResident && modal.status === 'resolved' && !modal.rating && (
                            <div className="border-t border-ink/5 pt-4">
                                <div className="mb-2 font-semibold">How was the service?</div>
                                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn-ghost btn-sm" onClick={() => act(() => post(`complaints/${modal.id}/rate`, { rating: n }), 'Thanks for your feedback', () => { setModal(null); list.reload(); })}><Star size={20} className="text-sand-400" /></button>)}</div>
                            </div>
                        )}
                        <FileLink path={modal.photo_path} label="Open photo" />
                    </div>
                )}
            </Modal>
        </div>
    );
}
