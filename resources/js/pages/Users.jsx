import { useState } from 'react';
import { Users as UsersIcon, Plus, Home, Pencil, Trash2 } from 'lucide-react';
import { useList, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Confirm, useAction, useToast, useHouses, clearHouseCache } from '../components/ui';
import { post, put, del, money, title } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Users() {
    const { roles, user: me } = useAuth();
    const [tab, setTab] = useState('users');
    const users = useList('users');
    const houses = useList(tab === 'houses' ? 'houses' : null);
    const houseOpts = useHouses();
    const [modal, setModal] = useState(null);
    const act = useAction();
    const toast = useToast();
    const roleOpts = Object.entries(roles).map(([value, label]) => ({ value, label }));

    const saveUser = async (v) => {
        if (modal.id) await put(`users/${modal.id}`, v); else await post('users', v);
        toast('Account saved'); setModal(null); users.reload();
    };
    const saveHouse = async (v) => {
        if (modal.id) await put(`houses/${modal.id}`, v); else await post('houses', v);
        clearHouseCache(); toast('House saved'); setModal(null); houses.reload();
    };

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={UsersIcon} title="Users & Houses" subtitle="Accounts for officials and residents, and the household register.">
                <button className="btn-primary" onClick={() => setModal({ kind: tab === 'houses' ? 'house' : 'user' })}><Plus size={16} />{tab === 'houses' ? 'Add house' : 'Add account'}</button>
            </PageHeader>
            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Accounts', icon: UsersIcon }, { key: 'houses', label: 'Households', icon: Home }]} />

            {tab === 'users' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={users.params.q} onChange={(q) => users.set({ q })} placeholder="Name, email, phone…" />
                        <Select value={users.params.role} onChange={(role) => users.set({ role })} placeholder="All roles" options={roleOpts} />
                    </div>
                    <Table list={users} empty="No accounts." columns={[
                        { label: 'Name', render: (u) => <div><div className="font-semibold">{u.name}</div><div className="text-xs text-black/45">{u.email}</div></div> },
                        { label: 'Role', render: (u) => <Badge value={u.role === 'admin' ? 'approved' : ''}>{roles[u.role]}</Badge> },
                        { label: 'House', render: (u) => u.house?.label || '—' },
                        { label: 'Phone', key: 'phone' },
                        { label: 'Status', render: (u) => <Badge value={u.active ? 'approved' : 'rejected'}>{u.active ? 'Active' : 'Disabled'}</Badge> },
                        { label: '', className: 'text-right', render: (u) => (
                            <div className="flex justify-end gap-1">
                                <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: 'user', ...u, house_id: u.house_id || '' })}><Pencil size={13} /></button>
                                {u.id !== me.id && <Confirm className="btn-ghost btn-sm text-red-600" message={`Delete ${u.name}?`} onConfirm={() => act(() => del(`users/${u.id}`), 'Deleted', users.reload)}><Trash2 size={13} /></Confirm>}
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
                        { label: 'Owner', render: (h) => <div>{h.owner_name}<div className="text-xs text-black/45">{h.owner_phone}</div></div> },
                        { label: 'Type', render: (h) => title(h.type) },
                        { label: 'Residents', key: 'residents_count' },
                        { label: 'Maintenance', render: (h) => money(h.monthly_maintenance) },
                        { label: 'Map', render: (h) => <span className="text-xs text-black/45">{h.grid_x}, {h.grid_y}</span> },
                        { label: '', className: 'text-right', render: (h) => (
                            <div className="flex justify-end gap-1">
                                <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: 'house', ...h })}><Pencil size={13} /></button>
                                <Confirm className="btn-ghost btn-sm text-red-600" message={`Delete house ${h.label}? Its record-room files will be deleted too.`} onConfirm={() => act(() => del(`houses/${h.id}`), 'Deleted', () => { clearHouseCache(); houses.reload(); })}><Trash2 size={13} /></Confirm>
                            </div>
                        ) },
                    ]} />
                </>
            )}

            <Modal open={modal?.kind === 'user'} onClose={() => setModal(null)} title={modal?.id ? 'Edit account' : 'New account'}>
                {modal?.kind === 'user' && <Form initial={{ active: true, ...modal, password: '' }} onSubmit={saveUser} fields={[
                    { name: 'name', label: 'Full name', required: true },
                    { name: 'email', label: 'Email (login)', type: 'email', required: true, half: true },
                    { name: 'phone', label: 'Phone', half: true },
                    { name: 'role', label: 'Role', type: 'select', options: roleOpts, required: true, half: true, default: 'resident' },
                    { name: 'house_id', label: 'House (for residents)', type: 'select', options: houseOpts, half: true },
                    { name: 'password', label: modal.id ? 'New password (leave blank to keep)' : 'Password', type: 'password', required: !modal.id, hint: 'At least 8 characters' },
                    { name: 'active', label: 'Account active', type: 'checkbox' },
                ]} />}
            </Modal>
            <Modal open={modal?.kind === 'house'} onClose={() => setModal(null)} title={modal?.id ? 'Edit house' : 'New house'}>
                {modal?.kind === 'house' && <Form initial={modal} onSubmit={saveHouse} fields={[
                    { name: 'block', label: 'Block', half: true },
                    { name: 'house_no', label: 'House no.', required: true, half: true },
                    { name: 'street', label: 'Street', half: true },
                    { name: 'type', label: 'Type', type: 'select', options: ['house', 'flat', 'commercial', 'plot'], required: true, half: true, default: 'house' },
                    { name: 'owner_name', label: 'Owner name', half: true },
                    { name: 'owner_phone', label: 'Owner phone', half: true },
                    { name: 'monthly_maintenance', label: 'Monthly maintenance (Rs)', type: 'number', min: 0, half: true },
                    { name: 'floors', label: 'Floors', type: 'number', min: 0, max: 20, half: true, default: 1 },
                    { name: 'grid_x', label: '3D map column (X)', type: 'number', min: 0, half: true, default: 0 },
                    { name: 'grid_y', label: '3D map row (Y)', type: 'number', min: 0, half: true, default: 0 },
                ]} />}
            </Modal>
        </div>
    );
}
