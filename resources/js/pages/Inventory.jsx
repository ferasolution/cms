import { useState } from 'react';
import { Boxes, Plus, ArrowUpRight, Undo2, AlertTriangle, Pencil } from 'lucide-react';
import { useList, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Confirm, useAction, useToast } from '../components/ui';
import { post, put, del, dt, money, CURRENCY } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

export default function Inventory() {
    const { user } = useAuth();
    const [tab, setTab] = useState('stock');
    const items = useList('inventory');
    const issues = useList(tab === 'issues' ? 'inventory/issues' : null);
    const all = useList('inventory', { all: 1 });
    const [modal, setModal] = useState(null);
    useLive('inventory', () => { items.reload(); issues.reload(); all.reload(); });
    const act = useAction();
    const toast = useToast();

    const itemFields = [
        { name: 'name', label: 'Item name', required: true, half: true },
        { name: 'sku', label: 'Code / SKU', half: true },
        { name: 'category', label: 'Category', half: true },
        { name: 'location', label: 'Store location', half: true },
        { name: 'quantity', label: 'Quantity in stock', type: 'number', min: 0, required: true, half: true },
        { name: 'unit', label: 'Unit', default: 'pcs', half: true },
        { name: 'min_quantity', label: 'Low-stock alert at', type: 'number', min: 0, half: true },
        { name: 'unit_cost', label: `Unit cost (${CURRENCY})`, type: 'number', min: 0, half: true },
    ];
    const issueFields = [
        { name: 'inventory_item_id', label: 'Item', type: 'select', required: true, options: all.rows.map((i) => ({ value: i.id, label: `${i.name} (${i.quantity} ${i.unit} available)` })) },
        { name: 'quantity', label: 'Quantity', type: 'number', min: 1, required: true, half: true, default: 1 },
        { name: 'expected_return', label: 'Expected return', type: 'date', half: true },
        { name: 'issued_to', label: 'Issued to (taken by)', required: true, half: true },
        { name: 'issued_to_contact', label: 'Contact', half: true },
        { name: 'purpose', label: 'Purpose', required: true },
        { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2 },
    ];

    const refresh = () => { items.reload(); issues.reload(); all.reload(); };
    const save = async (v) => {
        if (modal.type === 'issue') { await post('inventory/issues', v); toast('Item issued'); setTab('issues'); }
        else if (modal.id) { await put(`inventory/${modal.id}`, v); toast('Item updated'); }
        else { await post('inventory', v); toast('Item added'); }
        setModal(null);
        refresh();
    };

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={Boxes} title="Inventory Management" subtitle={`Track all stock and every issuance. Inventory handler: ${user.name}`}>
                <button className="btn-outline" onClick={() => setModal({ type: 'issue' })}><ArrowUpRight size={16} />Issue item</button>
                <button className="btn-primary" onClick={() => setModal({ type: 'item' })}><Plus size={16} />Add item</button>
            </PageHeader>
            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'stock', label: 'Stock' }, { key: 'issues', label: 'Issuance record' }]} />

            {tab === 'stock' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={items.params.q} onChange={(q) => items.set({ q })} placeholder="Search items…" />
                        <label className="btn-outline cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={!!items.params.low} onChange={(e) => items.set({ low: e.target.checked ? 1 : '' })} />Low stock only</label>
                    </div>
                    <Table list={items} empty="No items yet." columns={[
                        { label: 'Item', render: (i) => <div><div className="font-semibold">{i.name}</div><div className="text-xs text-ink/45">{i.sku}</div></div> },
                        { label: 'Category', key: 'category' },
                        { label: 'In stock', render: (i) => <span className={`font-semibold ${i.quantity <= i.min_quantity ? 'text-red-600' : ''}`}>{i.quantity <= i.min_quantity && <AlertTriangle size={13} className="mr-1 inline" />}{i.quantity} {i.unit}</span> },
                        { label: 'Issued out', render: (i) => i.out_count || '—' },
                        { label: 'Location', key: 'location' },
                        { label: 'Value', render: (i) => money(i.quantity * i.unit_cost) },
                        { label: '', className: 'text-right', render: (i) => (
                            <div className="flex justify-end gap-1">
                                <button className="btn-ghost btn-sm" onClick={() => setModal({ type: 'issue', inventory_item_id: i.id })}>Issue</button>
                                <button className="btn-ghost btn-sm" onClick={() => setModal({ type: 'item', ...i })}><Pencil size={13} /></button>
                                <Confirm className="btn-ghost btn-sm text-red-600" message={`Delete ${i.name}?`} onConfirm={() => act(() => del(`inventory/${i.id}`), 'Deleted', refresh)}>×</Confirm>
                            </div>
                        ) },
                    ]} />
                </>
            )}

            {tab === 'issues' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={issues.params.q} onChange={(q) => issues.set({ q })} placeholder="Person or purpose…" />
                        <Select value={issues.params.status} onChange={(status) => issues.set({ status })} placeholder="All" options={[{ value: 'out', label: 'Not returned' }, { value: 'overdue', label: 'Overdue' }, { value: 'returned', label: 'Returned' }]} />
                    </div>
                    <Table list={issues} empty="No items issued yet." columns={[
                        { label: 'Item', render: (r) => <span className="font-semibold">{r.quantity} × {r.item?.name}</span> },
                        { label: 'Taken by', render: (r) => <div>{r.issued_to}<div className="text-xs text-ink/45">{r.issued_to_contact}</div></div> },
                        { label: 'Purpose', key: 'purpose', className: 'max-w-56' },
                        { label: 'Issued by', render: (r) => r.issuer?.name },
                        { label: 'Issued', render: (r) => dt(r.issued_at) },
                        { label: 'Status', render: (r) => r.returned_at ? <Badge value="returned">Returned {r.returned_quantity < r.quantity ? `(${r.returned_quantity}/${r.quantity})` : ''}</Badge> : r.expected_return && new Date(r.expected_return) < new Date(new Date().toDateString()) ? <Badge value="overdue" /> : <Badge value="issued">Out{r.expected_return ? ' · due ' + dt(r.expected_return, false) : ''}</Badge> },
                        { label: '', className: 'text-right', render: (r) => !r.returned_at && <button className="btn-outline btn-sm" onClick={() => {
                            const q = window.prompt(`How many of ${r.quantity} returned?`, r.quantity);
                            if (q !== null) act(() => post(`inventory/issues/${r.id}/return`, { returned_quantity: Number(q) }), 'Return recorded', refresh);
                        }}><Undo2 size={13} />Return</button> },
                    ]} />
                </>
            )}

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.type === 'issue' ? 'Item issuance form' : modal?.id ? 'Edit item' : 'Add item'}>
                {modal && <Form fields={modal.type === 'issue' ? issueFields : itemFields} initial={modal} onSubmit={save} submitLabel={modal.type === 'issue' ? 'Issue item' : 'Save'} />}
            </Modal>
        </div>
    );
}
