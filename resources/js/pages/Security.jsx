import { useEffect, useState } from 'react';
import { ShieldCheck, Plus, LogOut, Video, Camera, Clock, Users } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Stat, FileLink, Confirm, useAction, useHouses, useToast } from '../components/ui';
import { post, del, dt, duration, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAlerts } from '../lib/alerts';

const CATS = ['visitor', 'guest', 'worker', 'relative', 'friend', 'delivery', 'other'];

export default function Security() {
    const { can, isAdmin } = useAuth();
    const manage = can('security', true);
    const list = useList('visitors', { status: '' });
    const stats = useGet('visitors/stats');
    const houses = useHouses();
    const [modal, setModal] = useState(null);
    const [view, setView] = useState(null);
    const act = useAction();
    const toast = useToast();
    const { tick } = useAlerts();
    useEffect(() => { if (tick) { list.reload(); stats.reload(); } }, [tick]); // eslint-disable-line

    const refresh = () => { list.reload(); stats.reload(); };
    const fields = [
        { name: 'name', label: 'Visitor name', required: true, half: true },
        { name: 'category', label: 'Type', type: 'select', options: CATS, required: true, half: true, default: 'visitor' },
        { name: 'house_id', label: 'Visiting household (HH)', type: 'select', options: houses, half: true },
        { name: 'purpose', label: 'Purpose of visit', required: true, half: true },
        { name: 'cnic', label: 'CNIC', half: true, placeholder: '42101-1234567-1' },
        { name: 'phone', label: 'Phone', half: true },
        { name: 'vehicle_no', label: 'Vehicle no.', half: true },
        { name: 'persons', label: 'Persons', type: 'number', min: 1, default: 1, half: true },
        { name: 'gate', label: 'Gate', type: 'select', options: ['Main Gate', 'Gate 2', 'Service Gate'], default: 'Main Gate', half: true },
        { name: 'photo', label: 'Photo', type: 'file', accept: 'image/*', capture: 'environment', half: true, placeholder: 'Take / choose photo' },
        { name: 'video', label: 'Video clip (entry track)', type: 'file', accept: 'video/*', capture: 'environment', placeholder: 'Record / choose video (max 50MB)' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2 },
    ];

    const save = async (v) => {
        if (modal?.id) await post(`visitors/${modal.id}`, v); else await post('visitors', v);
        toast(modal?.id ? 'Visitor updated' : 'Entry recorded');
        setModal(null);
        refresh();
    };

    const s = stats.data;
    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={ShieldCheck} title="Security Management" subtitle="Visitors, guests, workers, relatives & friends — entry, stay and exit.">
                {manage && <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />New entry</button>}
            </PageHeader>

            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Inside right now" value={s?.inside ?? '—'} icon={Users} tone="green" onClick={() => list.set({ status: 'inside' })} />
                <Stat label="Entries today" value={s?.today ?? '—'} icon={ShieldCheck} />
                <Stat label="Avg. stay (30 days)" value={s ? (s.avg_stay_minutes < 60 ? `${s.avg_stay_minutes}m` : `${Math.floor(s.avg_stay_minutes / 60)}h ${s.avg_stay_minutes % 60}m`) : '—'} icon={Clock} tone="sand" />
                <Stat label="Workers / Guests (30d)" value={s ? `${s.by_category?.worker || 0} / ${s.by_category?.guest || 0}` : '—'} icon={Users} tone="blue" />
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
                <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} placeholder="Name, CNIC, vehicle…" />
                <Select value={list.params.status} onChange={(status) => list.set({ status })} placeholder="All" options={[{ value: 'inside', label: 'Inside now' }, { value: 'exited', label: 'Exited' }]} />
                <Select value={list.params.category} onChange={(category) => list.set({ category })} placeholder="All types" options={CATS} />
                <Select value={list.params.house_id} onChange={(house_id) => list.set({ house_id })} placeholder="All houses" options={houses} className="max-w-56" />
                <input type="date" className="input w-auto" value={list.params.from || ''} onChange={(e) => list.set({ from: e.target.value })} title="From date" />
            </div>

            <Table list={list} empty="No visitor records." onRow={setView} columns={[
                { label: 'Visitor', render: (v) => <div><div className="font-semibold">{v.name}</div><div className="text-xs text-black/50">{v.cnic || v.phone || ''}</div></div> },
                { label: 'Type', render: (v) => <Badge value={v.category} /> },
                { label: 'House', render: (v) => v.house?.label || '—' },
                { label: 'Purpose', key: 'purpose', className: 'max-w-48' },
                { label: 'Entry', render: (v) => dt(v.entry_at) },
                { label: 'Stay', render: (v) => <span className={!v.exit_at ? 'font-semibold text-emerald-700' : ''}>{duration(v.entry_at, v.exit_at)}</span> },
                { label: 'Status', render: (v) => <Badge value={v.exit_at ? 'exited' : 'inside'} /> },
                { label: '', className: 'text-right', render: (v) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {v.video_path && <Video size={15} className="mt-1.5 text-brand-500" />}
                        {manage && !v.exit_at && <button className="btn-outline btn-sm" onClick={() => act(() => post(`visitors/${v.id}/checkout`), `${v.name} checked out`, refresh)}><LogOut size={13} />Exit</button>}
                    </div>
                ) },
            ]} />

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit visitor' : 'New visitor entry'} wide>
                {modal && <Form fields={fields} initial={modal} onSubmit={save} submitLabel={modal.id ? 'Update' : 'Record entry'} />}
            </Modal>

            <Modal open={!!view} onClose={() => setView(null)} title={view?.name}>
                {view && (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                            {[['Type', title(view.category)], ['House', view.house?.label], ['Purpose', view.purpose], ['CNIC', view.cnic], ['Phone', view.phone], ['Vehicle', view.vehicle_no], ['Persons', view.persons], ['Gate', view.gate],
                                ['Entry', dt(view.entry_at)], ['Exit', view.exit_at ? dt(view.exit_at) : 'Still inside'], ['Duration of stay', duration(view.entry_at, view.exit_at)], ['Logged by', view.logger?.name]].map(([k, v]) => (
                                <div key={k}><div className="text-[11px] font-semibold text-black/45">{k}</div><div>{v || '—'}</div></div>
                            ))}
                        </div>
                        {view.remarks && <p className="rounded-xl bg-black/[.03] p-3">{view.remarks}</p>}
                        {view.photo_path && <img src={`/files/${view.photo_path}`} className="max-h-64 rounded-xl" alt="" />}
                        {view.video_path && <video src={`/files/${view.video_path}`} controls className="w-full rounded-xl bg-black" />}
                        <div className="flex flex-wrap gap-2">
                            {manage && <button className="btn-outline btn-sm" onClick={() => { setModal({ ...view, house_id: view.house_id || '' }); setView(null); }}><Camera size={13} />Edit / add media</button>}
                            {view.video_path && <FileLink path={view.video_path} label="Open video" />}
                            {isAdmin && <Confirm className="btn-ghost btn-sm text-red-600" message="Delete this visitor record?" onConfirm={() => act(() => del(`visitors/${view.id}`), 'Deleted', () => { setView(null); refresh(); })}>Delete</Confirm>}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
