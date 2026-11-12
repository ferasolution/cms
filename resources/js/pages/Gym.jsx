import { useState } from 'react';
import { Dumbbell, Plus, CreditCard, QrCode, Banknote, Check, X, Upload, Pencil, Users, Wallet, Ban } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, useTab, urlParam, useAction, useToast, Stat, QrImage, FileLink, useHouses } from '../components/ui';
import { post, put, dt, money, title, today, CURRENCY } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

function MemberState({ m }) {
    const st = m.state || {};
    return <div><Badge value={st.allowed ? (st.days_left <= 3 ? 'pending' : 'approved') : 'rejected'}>{m.card_blocked ? 'Card blocked' : st.allowed ? (st.days_left <= 3 ? `Due in ${st.days_left}d` : 'Active') : title(m.status === 'active' ? 'expired' : m.status)}</Badge><div className="mt-0.5 text-[10px] text-ink/45">till {dt(m.end_date, false)}</div></div>;
}

export default function Gym() {
    const { can } = useAuth();
    const manage = can('gym', true);
    const [tab, setTab] = useTab(manage ? 'door' : 'mine');
    const members = useList(['members', 'mine'].includes(tab) ? 'gym/members' : null, { q: urlParam('q') });
    const payments = useList(tab === 'payments' || tab === 'mine' ? 'gym/payments' : null, { status: manage ? 'pending' : '' });
    const plans = useGet('gym/plans');
    const stats = useGet(manage ? 'gym/stats' : null);
    const checkins = useGet(manage && tab === 'door' ? 'gym/checkins' : null);
    const houses = useHouses(manage);
    const residents = useGet(manage ? 'users?residents=1' : null);
    const [modal, setModal] = useState(null);
    const [card, setCard] = useState('');
    const [scan, setScan] = useState(null);
    const act = useAction();
    const toast = useToast();
    const refresh = () => { members.reload(); payments.reload(); plans.reload(); stats.reload(); checkins.reload(); };
    useLive('gym', refresh);

    const doScan = (e) => { e.preventDefault(); if (!card.trim()) return; post('gym/scan', { card: card.trim() }).then((r) => { setScan(r); setCard(''); checkins.reload(); stats.reload(); }).catch((er) => toast(er.message, 'error')); };
    const startPay = (m) => act(() => post(`gym/members/${m.id}/pay`, { method: 'qr' }), null, (p) => setModal({ mode: 'pay', payment: p, member: m }));
    const s = stats.data;
    const planOpts = (plans.data || []).filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} — ${money(p.price)} / ${p.duration_days}d` }));

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={Dumbbell} title="Gym & Community Club" subtitle={manage ? 'Memberships, RFID door check-in, subscription payments and dues.' : 'Your membership, payments and pay-by-QR.'}>
                {manage && <button className="btn-outline" onClick={() => setModal({ mode: 'plan' })}><Plus size={16} />Plan</button>}
                {manage && <button className="btn-primary" onClick={() => setModal({ mode: 'member', start_date: today(), paid: true })}><Plus size={16} />New member</button>}
            </PageHeader>
            {manage && s && (
                <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
                    <Stat label="Active members" value={s.active} icon={Users} tone="green" />
                    <Stat label="Due soon" value={s.due} tone="sand" />
                    <Stat label="Expired" value={s.expired} tone="red" />
                    <Stat label="Payments to verify" value={s.pending_payments} tone={s.pending_payments ? 'red' : 'brand'} onClick={() => setTab('payments')} />
                    <Stat label="Revenue this month" value={money(s.month_revenue)} icon={Wallet} />
                    <Stat label="Check-ins today" value={s.today_checkins} tone="blue" />
                </div>
            )}
            <Tabs value={tab} onChange={setTab} tabs={manage ? [{ key: 'door', label: 'Door / RFID', icon: CreditCard }, { key: 'members', label: 'Members', icon: Users }, { key: 'payments', label: 'Payments', icon: Banknote, count: s?.pending_payments }, { key: 'plans', label: 'Plans' }] : [{ key: 'mine', label: 'My membership' }, { key: 'plans', label: 'Plans' }]} />

            {tab === 'door' && (
                <div className="grid gap-5 lg:grid-cols-2">
                    <div className="card p-5">
                        <div className="mb-1 font-bold">Scan member card</div>
                        <p className="mb-3 text-sm text-ink/55">Keep the cursor in the box — a USB RFID reader types the card number and presses Enter. Checks: membership active, payment not overdue, card not blocked.</p>
                        <form onSubmit={doScan} className="flex gap-2"><input autoFocus className="input font-mono text-lg" placeholder="Tap card / member no." value={card} onChange={(e) => setCard(e.target.value)} /><button className="btn-primary">Check</button></form>
                        {scan && (
                            <div className={`mt-4 rounded-2xl p-5 text-center ${scan.allowed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                                <div className="text-5xl">{scan.allowed ? '✅' : '⛔'}</div>
                                <div className="mt-2 text-xl font-bold">{scan.allowed ? 'ACCESS GRANTED' : 'ACCESS DENIED'}</div>
                                {scan.member && <div className="mt-1 font-semibold">{scan.member.name} · {scan.member.member_no}</div>}
                                <div className="text-sm">{scan.reason}</div>
                            </div>
                        )}
                    </div>
                    <div className="card p-5">
                        <div className="mb-2 flex justify-between font-bold">Door log<span className="text-xs font-normal text-ink/45">~{checkins.data?.inside_estimate ?? 0} inside now</span></div>
                        {(checkins.data?.recent || []).map((c) => (
                            <div key={c.id} className="flex items-center justify-between border-b border-ink/5 py-2 text-sm last:border-0">
                                <span>{c.allowed ? '✅' : '⛔'} {c.member?.name || c.card}</span><span className="text-xs text-ink/45">{c.allowed ? '' : c.reason + ' · '}{dt(c.created_at)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'members' && (
                <>
                    <div className="mb-3 flex gap-2"><SearchBox value={members.params.q} onChange={(q) => members.set({ q })} placeholder="Name, member no, card…" /><Select value={members.params.status} onChange={(status) => members.set({ status })} placeholder="All" options={['active', 'due', 'expired', 'frozen']} /></div>
                    <Table list={members} empty="No members." onRow={(m) => setModal({ mode: 'member', ...m, user_id: m.user_id || '', house_id: m.house_id || '' })} columns={[
                        { label: 'Member', render: (m) => <div><div className="font-semibold">{m.name}</div><div className="text-xs text-ink/45">{m.member_no}{m.house ? ' · ' + m.house.label : ''}</div></div> },
                        { label: 'Plan', render: (m) => m.plan?.name },
                        { label: 'RFID', render: (m) => <span className="font-mono text-xs">{m.rfid_card || '—'}</span> },
                        { label: 'Status', render: (m) => <MemberState m={m} /> },
                        { label: '', className: 'text-right', render: (m) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><button className="btn-outline btn-sm" onClick={() => act(() => post(`gym/members/${m.id}/cash`), `Cash ${money(m.plan?.price)} received`, refresh)}><Banknote size={13} />Cash</button><button className="btn-ghost btn-sm" onClick={() => startPay(m)}><QrCode size={13} /></button></div> },
                    ]} />
                </>
            )}

            {tab === 'mine' && (
                <div className="space-y-4">
                    {!members.rows.length && !members.loading && <div className="card p-5 text-sm">You are not a club member yet. Visit the club office to register — or ask them to add you from the portal.</div>}
                    {members.rows.map((m) => (
                        <div key={m.id} className="card flex flex-wrap items-center gap-5 p-5">
                            <div className="grid size-16 place-items-center rounded-2xl bg-brand-600 text-white"><Dumbbell size={28} /></div>
                            <div className="flex-1"><div className="text-lg font-bold">{m.name}</div><div className="text-sm text-ink/55">{m.member_no} · {m.plan?.name} · card {m.rfid_card || '—'}</div><div className="mt-1"><MemberState m={m} /></div></div>
                            <button className="btn-primary" onClick={() => startPay(m)}><QrCode size={16} />Pay {money(m.plan?.price)}</button>
                        </div>
                    ))}
                    <div className="card p-5"><div className="mb-2 font-bold">Payment history</div>
                        {payments.rows.map((p) => <div key={p.id} className="flex items-center justify-between border-b border-ink/5 py-2 text-sm last:border-0"><span>{money(p.amount)} · {p.reference} · {title(p.method)}</span><span className="flex items-center gap-2">{p.status === 'pending' && !p.proof_path && <button className="btn-ghost btn-sm" onClick={() => setModal({ mode: 'pay', payment: p, member: p.member })}>Upload proof</button>}<Badge value={p.status} /></span></div>)}
                        {!payments.rows.length && <div className="text-sm text-ink/45">No payments yet.</div>}
                    </div>
                </div>
            )}

            {tab === 'payments' && (
                <>
                    <div className="mb-3"><Select value={payments.params.status} onChange={(status) => payments.set({ status })} placeholder="All" options={['pending', 'paid', 'rejected']} /></div>
                    <Table list={payments} empty="No payments." columns={[
                        { label: 'Reference', render: (p) => <span className="font-mono text-xs font-bold">{p.reference}</span> },
                        { label: 'Member', render: (p) => <div>{p.member?.name}<div className="text-xs text-ink/45">{p.member?.member_no}</div></div> },
                        { label: 'Amount', render: (p) => <b>{money(p.amount)}</b> },
                        { label: 'Method', render: (p) => title(p.method) },
                        { label: 'Proof', render: (p) => p.proof_path ? <FileLink path={p.proof_path} label="View" /> : '—' },
                        { label: 'Status', render: (p) => <div><Badge value={p.status} />{p.confirmer && <div className="text-[10px] text-ink/45">by {p.confirmer.name}</div>}</div> },
                        { label: '', className: 'text-right', render: (p) => p.status === 'pending' && <div className="flex justify-end gap-1"><button className="btn-primary btn-sm" onClick={() => act(() => post(`gym/payments/${p.id}/confirm`, { status: 'paid' }), 'Payment confirmed — membership extended', refresh)}><Check size={13} />Received</button><button className="btn-ghost btn-sm text-red-600" onClick={() => act(() => post(`gym/payments/${p.id}/confirm`, { status: 'rejected' }), 'Rejected', refresh)}><X size={13} /></button></div> },
                    ]} />
                </>
            )}

            {tab === 'plans' && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(plans.data || []).map((p) => (
                        <div key={p.id} className={`card p-5 ${p.active ? '' : 'opacity-50'}`}>
                            <div className="flex items-start justify-between"><div className="font-bold">{p.name}</div>{manage && <button className="btn-ghost btn-sm" onClick={() => setModal({ mode: 'plan', ...p })}><Pencil size={13} /></button>}</div>
                            <div className="mt-2 text-3xl font-bold">{money(p.price)}</div>
                            <div className="text-sm text-ink/55">{p.duration_days} days · {title(p.type)}</div>
                            <div className="mt-2 flex flex-wrap gap-1">{(p.facilities || '').split(',').filter(Boolean).map((f) => <Badge key={f}>{title(f.trim())}</Badge>)}</div>
                            {manage && <div className="mt-3 text-xs text-ink/45">{p.members_count} active members</div>}
                        </div>
                    ))}
                </div>
            )}

            <Modal open={modal?.mode === 'pay'} onClose={() => { setModal(null); refresh(); }} title="Pay subscription">
                {modal?.mode === 'pay' && (
                    <div className="flex flex-col items-center gap-3 text-center text-sm">
                        {modal.payment.qr && <QrImage text={modal.payment.qr.text} size={220} />}
                        <div className="text-2xl font-bold">{money(modal.payment.amount)}</div>
                        <div>Reference <span className="font-mono font-bold">{modal.payment.reference}</span></div>
                        {modal.payment.qr && <div className="w-full rounded-xl bg-ink/[.03] p-3 text-left text-xs leading-relaxed whitespace-pre-line">{modal.payment.qr.text}</div>}
                        <p className="text-xs text-ink/55">Scan with your banking / wallet app or transfer to the account above, using the reference. Then upload the payment screenshot — the club confirms it and your membership is extended automatically.</p>
                        <label className="btn-primary cursor-pointer"><Upload size={15} />Upload payment screenshot
                            <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files[0] && act(() => post(`gym/payments/${modal.payment.id}/proof`, { proof: e.target.files[0] }), 'Proof uploaded — the club will confirm shortly', () => { setModal(null); refresh(); })} />
                        </label>
                    </div>
                )}
            </Modal>
            <Modal open={modal?.mode === 'member'} onClose={() => setModal(null)} title={modal?.id ? `Member ${modal.member_no}` : 'New member'}>
                {modal?.mode === 'member' && <Form initial={modal} submitLabel="Save" onSubmit={async (v) => { modal.id ? await put(`gym/members/${modal.id}`, v) : await post('gym/members', v); toast('Member saved'); setModal(null); refresh(); }} fields={[
                    { name: 'name', label: 'Name', required: true, half: true }, { name: 'phone', label: 'Phone', half: true },
                    { name: 'gym_plan_id', label: 'Plan', type: 'select', options: planOpts, required: true },
                    { name: 'user_id', label: 'Portal account (to pay online)', type: 'select', options: (residents.data || []).map((u) => ({ value: u.id, label: u.name })), half: true },
                    { name: 'house_id', label: 'House', type: 'select', options: houses, half: true },
                    { name: 'rfid_card', label: 'RFID card no.', half: true },
                    !modal.id && { name: 'start_date', label: 'Start date', type: 'date', required: true, half: true },
                    !modal.id && { name: 'paid', label: 'First payment received in cash', type: 'checkbox' },
                    modal.id && { name: 'end_date', label: 'Valid until', type: 'date', required: true, half: true },
                    modal.id && { name: 'status', label: 'Status', type: 'select', options: ['active', 'frozen', 'cancelled'], required: true, half: true },
                    modal.id && { name: 'card_blocked', label: 'Block RFID card', type: 'checkbox' },
                ].filter(Boolean)} />}
            </Modal>
            <Modal open={modal?.mode === 'plan'} onClose={() => setModal(null)} title={modal?.id ? 'Edit plan' : 'New plan'}>
                {modal?.mode === 'plan' && <Form initial={{ active: true, type: 'individual', duration_days: 30, ...modal }} onSubmit={async (v) => { modal.id ? await put(`gym/plans/${modal.id}`, v) : await post('gym/plans', v); toast('Plan saved'); setModal(null); refresh(); }} fields={[
                    { name: 'name', label: 'Plan name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['individual', 'family', 'trial', 'guest'], required: true, half: true },
                    { name: 'duration_days', label: 'Days', type: 'number', min: 1, required: true, half: true }, { name: 'price', label: `Price (${CURRENCY})`, type: 'number', min: 0, required: true, half: true },
                    { name: 'facilities', label: 'Facilities (comma separated)', half: true, placeholder: 'gym,pool,courts' }, { name: 'active', label: 'Available for new members', type: 'checkbox' },
                ]} />}
            </Modal>
        </div>
    );
}
