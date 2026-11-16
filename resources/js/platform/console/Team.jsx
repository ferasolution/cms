import { useState } from 'react';
import { UsersRound, UserPlus } from 'lucide-react';
import { Form, Modal, PageHeader, useToast } from '../../components/ui';
import { ago, papi } from '../../lib/api';
import { Loading, usePlatform } from './kit';

const ROLE = { platform_owner: 'Owner', platform_support: 'Support' };

/** People who run the platform. Owners do everything; support can look after communities but not money, plans or the team. */
export default function Team({ me }) {
    const [list, , err] = usePlatform('team');
    const [rows, setRows] = useState(null);
    const [modal, setModal] = useState(null);
    const toast = useToast();
    const data = rows || list;
    if (err) return <p className="text-sm text-red-600">{err}</p>;
    if (!data) return <Loading />;
    const update = async (u, v, msg) => { try { setRows(await papi.put(`team/${u.id}`, v)); toast(msg, 'success'); } catch (e) { toast(e.message, 'error'); } };

    return (
        <div>
            <PageHeader icon={UsersRound} title="Team" subtitle="Who can sign in to this console.">
                <button className="btn-primary" onClick={() => setModal({})}><UserPlus size={15} />Add teammate</button>
            </PageHeader>
            <div className="card divide-y divide-ink/[.05]">
                {data.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <span className="grid size-10 place-items-center rounded-full bg-night font-bold text-sand-400">{u.name.slice(0, 1)}</span>
                        <div className="min-w-0 flex-1"><div className="font-semibold">{u.name}{u.id === me.id && <span className="ml-2 text-xs font-medium text-ink/45">you</span>}{!u.active && <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink/55">disabled</span>}</div><div className="text-xs text-ink/50">{u.email} · {u.last_login_at ? 'last in ' + ago(u.last_login_at) : 'never signed in'}</div></div>
                        <select className="input w-auto" value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value }, 'Role changed')}>
                            {Object.entries(ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button className="btn-outline btn-sm" onClick={() => setModal({ reset: u })}>New password</button>
                        {u.id !== me.id && <button className={`btn-sm ${u.active ? 'btn-ghost text-red-600' : 'btn-outline'}`} onClick={() => update(u, { active: !u.active }, u.active ? 'Access removed' : 'Access restored')}>{u.active ? 'Disable' : 'Enable'}</button>}
                    </div>
                ))}
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="card p-4"><b>Owner</b><p className="mt-1 text-ink/60">Everything: payment keys, plans and prices, notices, the team, recording payments and deleting communities.</p></div>
                <div className="card p-4"><b>Support</b><p className="mt-1 text-ink/60">Sees every community, signs in as an admin for support, extends trials, resets admin passwords and edits details.</p></div>
            </div>

            <Modal open={!!modal && !modal.reset} onClose={() => setModal(null)} title="Add teammate">
                {modal && !modal.reset && <Form initial={{ role: 'platform_support' }} submitLabel="Add" onSubmit={async (v) => { setRows(await papi.post('team', v)); toast('Added', 'success'); setModal(null); }}
                    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
                        { name: 'role', label: 'Role', type: 'select', required: true, options: Object.entries(ROLE).map(([value, label]) => ({ value, label })) },
                        { name: 'password', label: 'Starting password (10+ characters)', type: 'password', required: true, hint: 'Share it privately; they can change it under Settings → My account.' }]} />}
            </Modal>
            <Modal open={!!modal?.reset} onClose={() => setModal(null)} title={`New password for ${modal?.reset?.name}`}>
                {modal?.reset && <Form submitLabel="Set password" onSubmit={async (v) => { await update(modal.reset, v, 'Password changed'); setModal(null); }}
                    fields={[{ name: 'password', label: 'New password (10+ characters)', type: 'password', required: true }]} />}
            </Modal>
        </div>
    );
}
