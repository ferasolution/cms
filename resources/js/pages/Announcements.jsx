import { useState } from 'react';
import { Megaphone, Plus, Pin, Pencil, Trash2, Eye } from 'lucide-react';
import { useList, useGet, PageHeader, Modal, Form, Badge, SearchBox, Select, Confirm, useAction, useToast, Spinner, Empty } from '../components/ui';
import { post, put, del, ago, title } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const CATS = ['general', 'maintenance', 'utility', 'event', 'security', 'emergency'];
const TONE = { normal: 'border-l-brand-500', important: 'border-l-amber-500', emergency: 'border-l-red-600' };

export default function Announcements() {
    const { can, approve } = useAuth();
    const manage = can('announcements', true);
    const list = useList('announcements');
    const [modal, setModal] = useState(null);
    const act = useAction();
    const toast = useToast();
    useLive('announcements', list.reload);
    const houses = useGet(manage ? 'houses?all=1' : null);
    const blocks = [...new Set((houses.data || []).map((h) => h.block).filter(Boolean))].sort();

    return (
        <div className="mx-auto max-w-4xl">
            <PageHeader icon={Megaphone} title="Notice Board" subtitle="Community announcements, utility interruptions, events and emergency notices.">
                {manage && <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />New announcement</button>}
            </PageHeader>
            <div className="mb-4 flex gap-2"><SearchBox value={list.params.q} onChange={(q) => list.set({ q })} /><Select value={list.params.category} onChange={(category) => list.set({ category })} placeholder="All categories" options={CATS} /></div>
            {list.loading && !list.rows.length ? <div className="grid h-40 place-items-center"><Spinner /></div> : !list.rows.length ? <div className="card"><Empty text="No announcements." /></div> : (
                <div className="space-y-3">
                    {list.rows.map((a) => (
                        <article key={a.id} className={`card border-l-4 p-5 ${TONE[a.priority]} ${!a.is_read ? '' : 'opacity-90'}`} onMouseEnter={() => !a.is_read && post(`announcements/${a.id}/read`).catch(() => {})}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <h2 className="flex items-center gap-2 text-lg font-bold">{a.pinned && <Pin size={15} className="text-sand-500" />}{a.title}</h2>
                                <div className="flex gap-1">{a.priority !== 'normal' && <Badge value={a.priority === 'emergency' ? 'urgent' : 'pending'}>{title(a.priority)}</Badge>}<Badge>{title(a.category)}</Badge>{!a.is_read && <Badge value="live">New</Badge>}</div>
                            </div>
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/75">{a.body}</p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/45">
                                <span>{a.author?.name} · {ago(a.created_at)} · to {a.audience.startsWith('block:') ? 'Block ' + a.audience.slice(6) : title(a.audience)}{a.expires_at ? ' · until ' + new Date(a.expires_at).toLocaleDateString() : ''}</span>
                                {manage && <span className="flex items-center gap-1"><Eye size={12} />{a.readers_count} read
                                    <button className="btn-ghost btn-sm" onClick={() => setModal(a)}><Pencil size={12} /></button>
                                    {approve('announcements') && <Confirm className="btn-ghost btn-sm text-red-600" message="Delete?" onConfirm={() => act(() => del(`announcements/${a.id}`), 'Deleted', list.reload)}><Trash2 size={12} /></Confirm>}</span>}
                            </div>
                        </article>
                    ))}
                </div>
            )}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit announcement' : 'New announcement'} wide>
                {modal && <Form initial={{ category: 'general', priority: 'normal', audience: 'all', ...modal, expires_at: modal.expires_at?.slice(0, 16) }} submitLabel={modal.id ? 'Save' : 'Publish & notify'} onSubmit={async (v) => { modal.id ? await put(`announcements/${modal.id}`, v) : await post('announcements', v); toast(modal.id ? 'Saved' : 'Published — everyone in the audience was notified'); setModal(null); list.reload(); }} fields={[
                    { name: 'title', label: 'Title', required: true }, { name: 'body', label: 'Message', type: 'textarea', rows: 5, required: true },
                    { name: 'category', label: 'Category', type: 'select', options: CATS, required: true, half: true },
                    { name: 'priority', label: 'Priority', type: 'select', options: ['normal', 'important', 'emergency'], required: true, half: true },
                    { name: 'audience', label: 'Audience', type: 'select', required: true, half: true, options: [{ value: 'all', label: 'Everyone' }, { value: 'residents', label: 'Residents only' }, { value: 'staff', label: 'Staff only' }, ...blocks.map((b) => ({ value: 'block:' + b, label: 'Block ' + b }))] },
                    { name: 'expires_at', label: 'Expires (optional)', type: 'datetime-local', half: true }, { name: 'pinned', label: 'Pin to top', type: 'checkbox' },
                ]} />}
            </Modal>
        </div>
    );
}
