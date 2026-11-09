import { useEffect, useState } from 'react';
import { FileCheck2, Plus, Upload, CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, FileLink, useToast, Spinner } from '../components/ui';
import { get, post, dt, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAlerts } from '../lib/alerts';

const FLOW = ['submitted', 'under_review', 'documents_required', 'approved', 'completed'];

function Tracker({ noc }) {
    const reached = new Set(noc.logs.map((l) => l.status));
    const steps = FLOW.filter((s) => s !== 'documents_required' || reached.has(s));
    if (noc.status === 'rejected') steps.push('rejected');
    return (
        <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            {steps.map((s, i) => {
                const on = reached.has(s) || s === noc.status;
                return (
                    <li key={s} className="flex items-center gap-1.5">
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${s === noc.status ? (s === 'rejected' ? 'bg-red-600 text-white' : 'bg-brand-600 text-white') : on ? 'bg-brand-50 text-brand-700' : 'bg-black/5 text-black/40'}`}>
                            {on ? <CheckCircle2 size={12} /> : <Circle size={12} />}{title(s)}
                        </span>
                        {i < steps.length - 1 && <span className="h-px w-3 bg-black/15" />}
                    </li>
                );
            })}
        </ol>
    );
}

export default function Noc() {
    const { can } = useAuth();
    const manage = can('noc', true);
    const list = useList('noc');
    const checklists = useGet('noc/checklists');
    const [modal, setModal] = useState(null);
    const [noc, setNoc] = useState(null);
    const toast = useToast();
    const { tick } = useAlerts();
    useEffect(() => { if (tick) { list.reload(); if (noc) open(noc.id); } }, [tick]); // eslint-disable-line

    const open = (id) => get(`noc/${id}`).then(setNoc);
    const types = Object.entries(checklists.data || {}).map(([value, c]) => ({ value, label: c.label }));

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={FileCheck2} title="NOC Processing" subtitle="Upload documents against a checklist and follow every status change.">
                <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />Apply for NOC</button>
            </PageHeader>
            <div className="mb-3 flex flex-wrap gap-2">
                <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="Reference…" />
                <Select value={list.params.status} onChange={(status) => list.set({ status })} placeholder="All statuses" options={[...FLOW, 'rejected']} />
            </div>
            <Table list={list} empty="No NOC applications." onRow={(n) => open(n.id)} columns={[
                { label: 'Reference', render: (n) => <span className="font-mono text-xs font-semibold">{n.reference}</span> },
                { label: 'Type', render: (n) => checklists.data?.[n.type]?.label || title(n.type) },
                { label: 'House', render: (n) => n.house?.label || '—' },
                manage && { label: 'Applicant', render: (n) => n.user?.name },
                { label: 'Documents', render: (n) => n.documents_count },
                { label: 'Updated', render: (n) => dt(n.updated_at) },
                { label: 'Status', render: (n) => <Badge value={n.status} /> },
            ].filter(Boolean)} />

            <Modal open={!!modal} onClose={() => setModal(null)} title="NOC application" wide>
                {modal && (
                    <Form onSubmit={async (v) => {
                        const docs = [];
                        const names = [];
                        (checklists.data?.[v.type]?.docs || []).forEach((d, i) => { if (v['doc_' + i]) { docs.push(v['doc_' + i]); names.push(d); } });
                        (v.extra || []).forEach((f) => { docs.push(f); names.push(f.name); });
                        const r = await post('noc', { type: v.type, details: v.details, house_id: v.house_id, documents: docs, document_names: names });
                        toast(`Application ${r.reference} submitted`);
                        setModal(null);
                        list.reload();
                        setNoc(r);
                    }} submitLabel="Submit application" fields={[
                        { name: 'type', label: 'NOC type', type: 'select', options: types, required: true },
                        { name: 'details', label: 'Details', type: 'textarea', rows: 2 },
                        { name: 'extra', label: 'Other documents', type: 'file', multiple: true, accept: 'image/*,.pdf' },
                    ]}>
                        {(v, set) => v.type && <DocChecklist key={v.type} docs={checklists.data[v.type].docs} set={set} />}
                    </Form>
                )}
            </Modal>

            <Modal open={!!noc} onClose={() => setNoc(null)} title={noc ? `${noc.reference} · ${checklists.data?.[noc.type]?.label || ''}` : ''} wide>
                {noc && <NocDetail noc={noc} manage={manage} onChange={(n) => { setNoc(n); list.reload(); }} />}
            </Modal>
        </div>
    );
}

// Upload slots for each checklist document. Files are picked up via hidden inputs named doc_<i>.
function DocChecklist({ docs, set }) {
    return (
        <div className="rounded-xl border border-black/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ListChecks size={15} className="text-brand-600" />Document checklist & guideline</div>
            <p className="mb-2 text-xs text-black/50">Upload a clear scan or photo (PDF/JPG/PNG, max 10MB each). Missing documents can be added later.</p>
            <DocSlots docs={docs} set={set} />
        </div>
    );
}

function DocSlots({ docs, set }) {
    const [files, setFiles] = useState({});
    return (
        <div className="space-y-1.5">
            {docs.map((d, i) => (
                <label key={d} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg bg-black/[.025] px-3 py-2 text-sm hover:bg-brand-50">
                    <span className="flex items-center gap-2">{files[i] ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Circle size={15} className="text-black/25" />}{d}</span>
                    <span className="truncate text-xs text-black/45">{files[i]?.name || 'Choose file'}</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => {
                        const f = e.target.files[0];
                        setFiles((s) => ({ ...s, [i]: f }));
                        set('doc_' + i, f);
                    }} />
                </label>
            ))}
        </div>
    );
}

function NocDetail({ noc, manage, onChange }) {
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const upload = async (files) => {
        if (!files.length) return;
        setBusy(true);
        try { onChange(await post(`noc/${noc.id}/documents`, { documents: [...files] })); toast('Documents uploaded'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-5 text-sm">
            <Tracker noc={noc} />
            {noc.remarks && <div className={`rounded-xl p-3 ${noc.status === 'documents_required' ? 'bg-orange-50 text-orange-900' : 'bg-black/[.03]'}`}><b>Remarks:</b> {noc.remarks}</div>}
            {noc.certificate_path && <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900"><b>NOC certificate issued.</b> <FileLink path={noc.certificate_path} label="Download certificate" /></div>}
            <div className="grid gap-5 sm:grid-cols-2">
                <div>
                    <div className="mb-2 font-semibold">Documents ({noc.documents.length})</div>
                    <ul className="space-y-1">
                        {noc.documents.map((d) => <li key={d.id} className="flex items-center justify-between rounded-lg bg-black/[.025] px-3 py-1.5"><span className="truncate">{d.name}</span><FileLink path={d.path} label="Open" /></li>)}
                    </ul>
                    {noc.checklist && (
                        <div className="mt-2 text-xs text-black/50">Checklist: {noc.checklist.docs.map((c) => (noc.documents.some((d) => d.name === c) ? '✓ ' : '• ') + c).join('   ')}</div>
                    )}
                    {!['completed', 'rejected'].includes(noc.status) && (
                        <label className="btn-outline btn-sm mt-3 cursor-pointer">{busy ? <Spinner className="size-3.5" /> : <Upload size={13} />}Upload more
                            <input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => upload(e.target.files)} />
                        </label>
                    )}
                </div>
                <div>
                    <div className="mb-2 font-semibold">Status history</div>
                    <ol className="relative space-y-3 border-l border-black/10 pl-4">
                        {noc.logs.map((l) => (
                            <li key={l.id}>
                                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-brand-500" />
                                <div className="font-semibold">{title(l.status)}</div>
                                {l.note && <div className="text-black/60">{l.note}</div>}
                                <div className="text-[11px] text-black/40">{dt(l.created_at)} · {l.user?.name}</div>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
            {manage && !['completed', 'rejected'].includes(noc.status) && (
                <div className="border-t border-black/5 pt-4">
                    <div className="mb-2 font-semibold">Update status</div>
                    <Form initial={{ status: '' }} submitLabel="Update & notify applicant" onSubmit={async (v) => { onChange(await post(`noc/${noc.id}/status`, v)); toast('Status updated'); }} fields={[
                        { name: 'status', label: 'New status', type: 'select', required: true, half: true, options: ['under_review', 'documents_required', 'approved', 'completed', 'rejected'] },
                        { name: 'certificate', label: 'NOC certificate (on completion)', type: 'file', accept: '.pdf,image/*', half: true, show: (v) => ['approved', 'completed'].includes(v.status) },
                        { name: 'note', label: 'Note to applicant', type: 'textarea', rows: 2 },
                    ]} />
                </div>
            )}
        </div>
    );
}
