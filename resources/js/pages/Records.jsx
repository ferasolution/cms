import { useState } from 'react';
import { Archive, Upload, FileText, Image as ImageIcon, Download, Trash2 } from 'lucide-react';
import { useList, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Confirm, useAction, useToast, useHouses } from '../components/ui';
import { post, del, dt, fileUrl, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const CATS = ['ownership', 'allotment', 'transfer', 'map', 'utility', 'legal', 'noc', 'general'];
const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

export default function Records() {
    const { can, approve, isResident, user } = useAuth();
    const isAdmin = approve('records');
    const manage = can('records', true);
    const list = useList('records');
    useLive('records', () => list.reload());
    const houses = useHouses(!isResident);
    const [modal, setModal] = useState(false);
    const act = useAction();
    const toast = useToast();

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={Archive} title="Record Room" subtitle={isResident ? `E-files of your household${user.house ? ' — ' + user.house.label : ''}. Only you can see them.` : 'All household files in e-format. Owners can only access their own house.'}>
                {manage && <button className="btn-primary" onClick={() => setModal(true)}><Upload size={16} />Upload files</button>}
            </PageHeader>
            <div className="mb-3 flex flex-wrap gap-2">
                <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="File title…" />
                {!isResident && <Select value={list.params.house_id} onChange={(house_id) => list.set({ house_id })} placeholder="All houses" options={houses} className="max-w-60" />}
                <Select value={list.params.category} onChange={(category) => list.set({ category })} placeholder="All categories" options={CATS} />
            </div>
            <Table list={list} empty={isResident && !user.house_id ? 'Your account is not linked to a house yet. Please contact the office.' : 'No files.'} columns={[
                { label: 'File', render: (r) => (
                    <a href={fileUrl(r.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:text-brand-600">
                        <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-600">{/\.(png|jpe?g|webp|gif)$/i.test(r.path) ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
                        <span><span className="block font-semibold">{r.title}</span><span className="block text-xs text-ink/45">{r.original_name} · {size(r.size)}</span></span>
                    </a>
                ) },
                !isResident && { label: 'House', render: (r) => r.house?.label },
                { label: 'Category', render: (r) => <Badge>{title(r.category)}</Badge> },
                { label: 'Uploaded', render: (r) => <div>{dt(r.created_at)}<div className="text-xs text-ink/45">{r.uploader?.name}</div></div> },
                { label: '', className: 'text-right', render: (r) => (
                    <div className="flex justify-end gap-1">
                        <a className="btn-ghost btn-sm" href={fileUrl(r.path, true)}><Download size={14} /></a>
                        {isAdmin && <Confirm className="btn-ghost btn-sm text-red-600" message="Delete this file permanently?" onConfirm={() => act(() => del(`records/${r.id}`), 'File deleted', list.reload)}><Trash2 size={14} /></Confirm>}
                    </div>
                ) },
            ].filter(Boolean)} />
            <Modal open={modal} onClose={() => setModal(false)} title="Upload to record room">
                {modal && <Form submitLabel="Upload" onSubmit={async (v) => { await post('records', v); toast('Files uploaded'); setModal(false); list.reload(); }} fields={[
                    { name: 'house_id', label: 'Household', type: 'select', options: houses, required: true },
                    { name: 'title', label: 'Title', required: true, half: true },
                    { name: 'category', label: 'Category', type: 'select', options: CATS, required: true, half: true, default: 'general' },
                    { name: 'files', label: 'Files (PDF, images, scans — up to 50MB each)', type: 'file', multiple: true, required: true },
                ]} />}
            </Modal>
        </div>
    );
}
