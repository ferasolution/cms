import { useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2 } from 'lucide-react';
import { Confirm, Form, Modal, PageHeader, useToast } from '../../components/ui';
import { dt, papi } from '../../lib/api';
import { Loading, usePlatform } from './kit';

const LEVEL = { info: 'border-brand-500/20 bg-brand-50 text-brand-700', warning: 'border-sand-400/40 bg-sand-50 text-sand-500', critical: 'border-red-300 bg-red-50 text-red-700' };

function live(n) {
    const now = Date.now();
    return n.active && (!n.starts_at || new Date(n.starts_at) <= now) && (!n.ends_at || new Date(n.ends_at) >= now);
}

/** Banners shown inside community portals: maintenance windows, new features, billing reminders. */
export default function Notices({ owner }) {
    const [list, reload] = usePlatform('notices');
    const [plans] = usePlatform('plans/manage');
    const [communities] = usePlatform('societies');
    const [edit, setEdit] = useState(null);
    const toast = useToast();
    if (!list) return <Loading />;

    return (
        <div>
            <PageHeader icon={Megaphone} title="Notices" subtitle="Messages that appear at the top of community portals.">
                {owner && <button className="btn-primary" onClick={() => setEdit({ level: 'info', audience: 'all', admins_only: true, active: true })}><Plus size={15} />New notice</button>}
            </PageHeader>
            <div className="space-y-3">
                {list.map((n) => (
                    <div key={n.id} className="card flex flex-wrap items-start gap-4 p-4">
                        <div className={`min-w-0 flex-1 rounded-xl border px-4 py-2.5 text-sm ${LEVEL[n.level]}`}><b>{n.title}</b>{n.body && <span className="opacity-80"> — {n.body}</span>}</div>
                        <div className="w-56 text-xs text-ink/55">
                            <div className={`font-semibold ${live(n) ? 'text-emerald-700' : 'text-ink/45'}`}>{live(n) ? 'Showing now' : n.active ? 'Scheduled / ended' : 'Off'}</div>
                            <div>{n.audience === 'all' ? 'All communities' : n.audience === 'plans' ? `Plans: ${(n.plans || []).join(', ')}` : `${(n.society_ids || []).length} communities`} · {n.admins_only ? 'admins only' : 'everyone'}</div>
                            <div>{n.starts_at ? dt(n.starts_at) : 'now'} → {n.ends_at ? dt(n.ends_at) : 'no end'}</div>
                        </div>
                        {owner && <div className="flex gap-1">
                            <button className="btn-ghost btn-sm" onClick={() => setEdit({ ...n, starts_at: n.starts_at?.slice(0, 16), ends_at: n.ends_at?.slice(0, 16) })}><Pencil size={14} /></button>
                            <Confirm message="Delete this notice?" onConfirm={async () => { await papi.del(`notices/${n.id}`); toast('Deleted'); reload(); }}><Trash2 size={14} /></Confirm>
                        </div>}
                    </div>
                ))}
                {!list.length && <div className="card p-10 text-center text-sm text-ink/45">No notices yet. Post one to tell communities about maintenance or new features.</div>}
            </div>

            <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit notice' : 'New notice'} wide>
                {edit && (
                    <Form initial={edit} submitLabel={edit.id ? 'Save' : 'Post notice'}
                        onSubmit={async (v) => { edit.id ? await papi.put(`notices/${edit.id}`, v) : await papi.post('notices', v); toast('Notice saved', 'success'); setEdit(null); reload(); }}
                        fields={[
                            { name: 'title', label: 'Title', required: true },
                            { name: 'body', label: 'Message', type: 'textarea', rows: 2 },
                            { name: 'level', label: 'Style', type: 'select', required: true, half: true, options: [{ value: 'info', label: 'Information (blue)' }, { value: 'warning', label: 'Heads-up (amber)' }, { value: 'critical', label: 'Urgent (red)' }] },
                            { name: 'audience', label: 'Show to', type: 'select', required: true, half: true, options: [{ value: 'all', label: 'All communities' }, { value: 'plans', label: 'Communities on certain plans' }, { value: 'societies', label: 'Chosen communities' }] },
                            { name: 'plans', label: 'Plans', type: 'chips', show: (v) => v.audience === 'plans', options: (plans?.plans || []).map((p) => ({ value: p.key, label: p.name })) },
                            { name: 'society_ids', label: 'Communities', type: 'chips', show: (v) => v.audience === 'societies', options: (communities || []).map((c) => ({ value: c.id, label: c.name })) },
                            { name: 'starts_at', label: 'Show from', type: 'datetime-local', half: true }, { name: 'ends_at', label: 'Show until', type: 'datetime-local', half: true },
                            { name: 'admins_only', label: 'Only community admins see it', type: 'checkbox', half: true }, { name: 'active', label: 'Switched on', type: 'checkbox', half: true },
                        ]} />
                )}
            </Modal>
        </div>
    );
}
