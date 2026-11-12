import { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Home, Pencil, Trash2, Crown, ShieldCheck, PenLine, User, History, Loader2, Download } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Confirm, useAction, useToast, useHouses, clearHouseCache, useTab, urlParam, exportCsv } from '../components/ui';
import { post, put, del, get, money, title, dt, ago, CURRENCY } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

const ROLE_INFO = {
    super_admin: { icon: Crown, tone: 'bg-violet-50 text-violet-700', desc: 'Complete control — users, settings, every module.' },
    admin: { icon: ShieldCheck, tone: 'bg-brand-50 text-brand-700', desc: 'Runs the whole community. Cannot change Super Admins or system settings.' },
    editor: { icon: PenLine, tone: 'bg-sky-50 text-sky-700', desc: 'Staff. Choose exactly which modules they can view, edit or manage.' },
    user: { icon: User, tone: 'bg-sand-100 text-sand-500', desc: 'Resident / household member. Sees only their own household.' },
};
const LEVELS = [[0, 'None'], [1, 'View'], [2, 'Edit'], [3, 'Manage']];
const LEVEL_TONE = ['', 'bg-ink/8 text-ink/60', 'bg-sky-50 text-sky-700', 'bg-brand-600 text-white'];

function RoleBadge({ role, roles }) {
    const I = ROLE_INFO[role]?.icon || User;
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_INFO[role]?.tone}`}><I size={11} />{roles[role]}</span>;
}

/** Account editor: details + role + module access matrix. */
function AccountForm({ initial, meta, houseOpts, onSaved }) {
    const [v, setV] = useState({ role: 'editor', active: true, permissions: {}, ...initial, password: '' });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
    const perms = v.permissions && !Array.isArray(v.permissions) ? v.permissions : {};
    const roles = Object.keys(meta.roles).filter((r) => meta.can_super || r !== 'super_admin');
    const modules = Object.entries(meta.modules).filter(([k]) => v.role !== 'user' || !['users', 'settings'].includes(k));

    const save = async (e) => {
        e.preventDefault();
        setBusy(true); setErrors({});
        try {
            const body = { ...v, permissions: perms };
            const r = v.id ? await put(`users/${v.id}`, body) : await post('users', body);
            toast(v.id ? 'Account updated' : 'Account created');
            onSaved(r);
        } catch (err) { setErrors(err.errors || {}); toast(err.message, 'error'); } finally { setBusy(false); }
    };
    const field = (k, label, type = 'text', extra = {}) => (
        <div className={extra.full ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
            <label className="label">{label}</label>
            <input className="input" type={type} value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...extra.input} />
            {errors[k] && <p className="mt-1 text-xs text-red-600">{errors[k][0]}</p>}
        </div>
    );

    return (
        <form onSubmit={save} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                {field('name', 'Full name', 'text', { input: { required: true } })}
                {field('email', 'Email (login)', 'email', { input: { required: true } })}
                {field('phone', 'Phone')}
                {field('password', v.id ? 'New password (blank = keep)' : 'Password', 'password', { input: { required: !v.id, minLength: 8 } })}
            </div>

            <div>
                <div className="label">Role</div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {roles.map((r) => {
                        const I = ROLE_INFO[r].icon;
                        return (
                            <button type="button" key={r} onClick={() => set('role', r)} className={`flex gap-3 rounded-2xl border-2 p-3 text-left transition ${v.role === r ? 'border-brand-500 bg-brand-50' : 'border-ink/8 hover:border-ink/20'}`}>
                                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${ROLE_INFO[r].tone}`}><I size={17} /></span>
                                <span><span className="block text-sm font-bold">{meta.roles[r]}</span><span className="block text-xs text-ink/55">{ROLE_INFO[r].desc}</span></span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {(v.role === 'editor' || v.role === 'user') && (
                <div className="grid grid-cols-2 gap-3">
                    {v.role === 'editor' ? (
                        <div className="col-span-2">
                            <label className="label">Designation / template</label>
                            <select className="input" value={v.designation || ''} onChange={(e) => { const d = e.target.value; set('designation', d); if (meta.templates[d]) set('permissions', { ...meta.templates[d] }); }}>
                                <option value="">Custom…</option>
                                {Object.keys(meta.templates).map((t) => <option key={t}>{t}</option>)}
                            </select>
                            <p className="mt-1 text-[11px] text-ink/45">Picking a template fills the access below. You can fine-tune it after.</p>
                        </div>
                    ) : (
                        <>
                            <div className="col-span-2 sm:col-span-1"><label className="label">Household</label><select className="input" value={v.house_id || ''} onChange={(e) => set('house_id', e.target.value)}><option value="">Not linked</option>{houseOpts.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}</select></div>
                            <div className="col-span-2 sm:col-span-1"><label className="label">Household role</label><select className="input" value={v.household_role || ''} onChange={(e) => set('household_role', e.target.value)}><option value="">—</option><option value="owner">Owner (household admin)</option><option value="family">Family member</option><option value="tenant">Tenant</option></select></div>
                        </>
                    )}
                </div>
            )}

            {v.role === 'editor' && (
                <div>
                    <div className="label">Module access</div>
                    <div className="overflow-hidden rounded-2xl border border-ink/8">
                        {modules.map(([k, label]) => (
                            <div key={k} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/5 px-3 py-2 last:border-0">
                                <span className="text-sm font-medium">{label}</span>
                                <div className="flex rounded-lg bg-ink/[.04] p-0.5">
                                    {LEVELS.map(([l, name]) => (
                                        <button type="button" key={l} onClick={() => set('permissions', { ...perms, [k]: l })}
                                            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${(perms[k] || 0) === l ? (l ? LEVEL_TONE[l] : 'bg-surface text-ink shadow-sm') : 'text-ink/45 hover:text-ink'}`}>{name}</button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-ink/45"><b>View</b> = open & read · <b>Edit</b> = create and update · <b>Manage</b> = also approve and delete.</p>
                </div>
            )}
            {v.role === 'user' && <p className="rounded-xl bg-sand-100 p-3 text-xs text-ink/65">Users automatically get: own visitors & QR passes, complaints, events, NOC, record room files, library, gym, bills, notices and SOS — only for their own household.</p>}
            {(v.role === 'admin' || v.role === 'super_admin') && <p className="rounded-xl bg-brand-50 p-3 text-xs text-ink/65">{meta.roles[v.role]}s have full access to every module{v.role === 'admin' ? ' (settings are read-only)' : ''}.</p>}

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={!!v.active} onChange={(e) => set('active', e.target.checked)} />Account active (unticked = cannot sign in)</label>
            <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}{v.id ? 'Save changes' : 'Create account'}</button></div>
        </form>
    );
}

export default function Users() {
    const { user: me, approve } = useAuth();
    const [tab, setTab] = useTab('users');
    const users = useList(tab === 'users' ? 'users' : null, { role: urlParam('role'), q: urlParam('q') });
    const houses = useList(tab === 'houses' ? 'houses' : null);
    const meta = useGet('users/meta');
    const houseOpts = useHouses();
    const [modal, setModal] = useState(null);
    const [history, setHistory] = useState(null);
    const act = useAction();
    const toast = useToast();
    useLive('users', () => { users.reload(); meta.reload(); });

    const m = meta.data;
    const roles = m?.roles || {};
    const saveHouse = async (v) => {
        if (modal.id) await put(`houses/${modal.id}`, v); else await post('houses', v);
        clearHouseCache(); toast('House saved'); setModal(null); houses.reload();
    };
    const openHistory = (u) => { setHistory({ user: u }); get(`users/${u.id}/history`).then((h) => setHistory({ user: u, ...h })); };

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={UsersIcon} title="User Panel" subtitle="Super Admin · Admin · Editor · User — who can open what, and the household register.">
                {tab === 'users' && <button className="btn-outline" onClick={() => exportCsv('users.csv', users.rows, [{ label: 'Name', value: (u) => u.name }, { label: 'Email', value: (u) => u.email }, { label: 'Role', value: (u) => roles[u.role] }, { label: 'Designation', value: (u) => u.designation }, { label: 'Active', value: (u) => (u.active ? 'yes' : 'no') }, { label: 'Last login', value: (u) => u.last_login_at }])}><Download size={15} />CSV</button>}
                <button className="btn-primary" onClick={() => setModal({ kind: tab === 'houses' ? 'house' : 'user' })}><Plus size={16} />{tab === 'houses' ? 'Add house' : 'Add account'}</button>
            </PageHeader>

            {m && tab === 'users' && (
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.keys(roles).map((r) => {
                        const I = ROLE_INFO[r].icon;
                        return (
                            <button key={r} onClick={() => users.set({ role: users.params.role === r ? '' : r })} className={`card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 ${users.params.role === r ? 'ring-2 ring-brand-500' : ''}`}>
                                <span className={`grid size-10 place-items-center rounded-xl ${ROLE_INFO[r].tone}`}><I size={19} /></span>
                                <span><span className="block text-xl font-bold">{m.counts[r] || 0}</span><span className="block text-xs text-ink/50">{roles[r]}s</span></span>
                            </button>
                        );
                    })}
                </div>
            )}

            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Accounts', icon: UsersIcon }, { key: 'houses', label: 'Households', icon: Home }]} />

            {tab === 'users' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={users.params.q} onChange={(q) => users.set({ q })} placeholder="Name, email, phone, designation…" />
                        <Select value={users.params.role} onChange={(role) => users.set({ role })} placeholder="All roles" options={Object.entries(roles).map(([value, label]) => ({ value, label }))} />
                        <Select value={users.params.active} onChange={(active) => users.set({ active })} placeholder="Any status" options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Disabled' }]} />
                    </div>
                    <Table list={users} empty="No accounts." columns={[
                        { label: 'User', render: (u) => (
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{u.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                                <div><div className="font-semibold">{u.name}</div><div className="text-xs text-ink/45">{u.email}</div></div>
                            </div>
                        ) },
                        { label: 'Role', render: (u) => <div className="space-y-1"><RoleBadge role={u.role} roles={roles} />{u.designation && <div className="text-xs text-ink/55">{u.designation}</div>}</div> },
                        { label: 'Access', render: (u) => (
                            u.role === 'super_admin' || u.role === 'admin' ? <span className="text-xs text-ink/50">All modules</span>
                                : <div className="flex max-w-xs flex-wrap gap-1">{Object.entries(u.levels || {}).filter(([k]) => u.role !== 'user' || k === 'none').map(([k, l]) => <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_TONE[l]}`}>{m?.modules[k]?.split(' ')[0]}·{LEVELS[l][1][0]}</span>)}
                                    {u.role === 'user' && <span className="text-xs text-ink/50">{u.house ? 'House ' + u.house.label : 'No house'}{u.household_role ? ' · ' + title(u.household_role) : ''}</span>}</div>
                        ) },
                        { label: 'Last sign-in', render: (u) => (u.last_login_at ? <span className="text-xs">{ago(u.last_login_at)}<span className="block text-ink/40">{u.last_login_ip}</span></span> : <span className="text-xs text-ink/35">Never</span>) },
                        { label: 'Status', render: (u) => <Badge value={u.active ? 'approved' : 'rejected'}>{u.active ? 'Active' : 'Disabled'}</Badge> },
                        { label: '', className: 'text-right', render: (u) => (
                            <div className="flex justify-end gap-1">
                                <button className="btn-ghost btn-sm" title="History" onClick={() => openHistory(u)}><History size={13} /></button>
                                {(u.role !== 'super_admin' || m?.can_super) && <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: 'user', ...u, house_id: u.house_id || '' })}><Pencil size={13} /></button>}
                                {u.id !== me.id && approve('users') && (u.role !== 'super_admin' || m?.can_super) && <Confirm className="btn-ghost btn-sm text-red-600" message={`Delete ${u.name}?`} onConfirm={() => act(() => del(`users/${u.id}`), 'Deleted', users.reload)}><Trash2 size={13} /></Confirm>}
                            </div>
                        ) },
                    ]} />
                </>
            )}

            {tab === 'houses' && (
                <>
                    <div className="mb-3"><SearchBox value={houses.params.q} onChange={(q) => houses.set({ q })} placeholder="House no, owner…" /></div>
                    <Table list={houses} empty="No houses." columns={[
                        { label: 'House', render: (h) => <b>{h.label}</b> },
                        { label: 'Street', key: 'street' },
                        { label: 'Owner', render: (h) => <div>{h.owner_name}<div className="text-xs text-ink/45">{h.owner_phone}</div></div> },
                        { label: 'Type', render: (h) => title(h.type) },
                        { label: 'Accounts', key: 'residents_count' },
                        { label: 'Maintenance', render: (h) => money(h.monthly_maintenance) },
                        { label: 'Map', render: (h) => <span className="text-xs text-ink/45">{h.grid_x}, {h.grid_y}</span> },
                        { label: '', className: 'text-right', render: (h) => (
                            <div className="flex justify-end gap-1">
                                <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: 'house', ...h })}><Pencil size={13} /></button>
                                <Confirm className="btn-ghost btn-sm text-red-600" message={`Delete house ${h.label}? Its record-room files will be deleted too.`} onConfirm={() => act(() => del(`houses/${h.id}`), 'Deleted', () => { clearHouseCache(); houses.reload(); })}><Trash2 size={13} /></Confirm>
                            </div>
                        ) },
                    ]} />
                </>
            )}

            <Modal open={modal?.kind === 'user'} onClose={() => setModal(null)} title={modal?.id ? `Edit ${modal.name}` : 'New account'} wide>
                {modal?.kind === 'user' && m && <AccountForm initial={modal} meta={m} houseOpts={houseOpts} onSaved={() => { setModal(null); users.reload(); meta.reload(); }} />}
            </Modal>
            <Modal open={modal?.kind === 'house'} onClose={() => setModal(null)} title={modal?.id ? 'Edit house' : 'New house'}>
                {modal?.kind === 'house' && <Form initial={modal} onSubmit={saveHouse} fields={[
                    { name: 'block', label: 'Block', half: true },
                    { name: 'house_no', label: 'House no.', required: true, half: true },
                    { name: 'street', label: 'Street', half: true },
                    { name: 'type', label: 'Type', type: 'select', options: ['house', 'flat', 'commercial', 'plot'], required: true, half: true, default: 'house' },
                    { name: 'owner_name', label: 'Owner name', half: true },
                    { name: 'owner_phone', label: 'Owner phone', half: true },
                    { name: 'monthly_maintenance', label: `Monthly maintenance (${CURRENCY})`, type: 'number', min: 0, half: true },
                    { name: 'floors', label: 'Floors', type: 'number', min: 0, max: 20, half: true, default: 1 },
                    { name: 'grid_x', label: '3D map column (X)', type: 'number', min: 0, half: true, default: 0 },
                    { name: 'grid_y', label: '3D map row (Y)', type: 'number', min: 0, half: true, default: 0 },
                ]} />}
            </Modal>
            <Modal open={!!history} onClose={() => setHistory(null)} title={`Activity — ${history?.user.name || ''}`}>
                {history && (
                    <div className="text-sm">
                        <div className="mb-3 rounded-xl bg-ink/[.03] p-3">Last sign-in: <b>{history.last_login_at ? dt(history.last_login_at) : 'never'}</b>{history.last_login_ip ? ` from ${history.last_login_ip}` : ''}</div>
                        {!history.activity ? <Loader2 className="animate-spin" /> : history.activity.length ? history.activity.map((a) => (
                            <div key={a.id} className="border-b border-ink/5 py-2"><div>{a.description}</div><div className="text-[11px] text-ink/45">{title(a.module)} · {dt(a.created_at)}</div></div>
                        )) : <div className="text-ink/45">No activity.</div>}
                    </div>
                )}
            </Modal>
        </div>
    );
}
