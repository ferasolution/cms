import { useState } from 'react';
import { BookOpen, Plus, BookMarked, FileText, Check, X, Undo2, Pencil } from 'lucide-react';
import { useList, useGet, PageHeader, Table, Modal, Form, Badge, SearchBox, Select, Tabs, Confirm, useAction, useToast, Empty, Spinner } from '../components/ui';
import { get, post, del, dt, fileUrl, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';

export default function Library() {
    const { can } = useAuth();
    const manage = can('library', true);
    const [tab, setTab] = useState('books');
    const books = useList('library/books');
    const issues = useList(tab === 'books' ? null : 'library/issues', { status: manage ? 'requested' : '' });
    const cats = useGet('library/categories');
    const [modal, setModal] = useState(null);
    useLive('library', () => { books.reload(); issues.reload(); });
    const [reader, setReader] = useState(null);
    const act = useAction();
    const toast = useToast();
    const refresh = () => { books.reload(); issues.reload(); };

    const bookFields = [
        { name: 'title', label: 'Title', required: true },
        { name: 'author', label: 'Author', half: true },
        { name: 'category', label: 'Category', half: true },
        { name: 'isbn', label: 'ISBN', half: true },
        { name: 'shelf', label: 'Shelf', half: true },
        { name: 'copies', label: 'Physical copies', type: 'number', min: 0, required: true, default: 1, half: true },
        { name: 'ebook', label: 'E-book (PDF / EPUB)', type: 'file', accept: '.pdf,.epub', half: true, hint: 'Adds the book to the digital library' },
        { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
    ];

    const save = async (v) => {
        if (modal.mode === 'issue') {
            await post('library/issues', v);
            toast('Book issued');
            setTab('issues');
        } else {
            await post(modal.id ? `library/books/${modal.id}` : 'library/books', v);
            toast(modal.id ? 'Book updated' : 'Book added');
        }
        setModal(null);
        refresh();
        cats.reload();
    };

    const openIssue = async () => {
        const [members, allBooks] = await Promise.all([get('users', { residents: 1 }), get('library/books', { per_page: 100 })]);
        setModal({ mode: 'issue', members, books: allBooks.data });
    };

    return (
        <div className="mx-auto max-w-7xl">
            <PageHeader icon={BookOpen} title="Library" subtitle={manage ? 'Catalogue, e-books, requests and issuance record.' : 'Browse, read e-books and request books.'}>
                {manage && <button className="btn-outline" onClick={openIssue}><BookMarked size={16} />Issue book</button>}
                {manage && <button className="btn-primary" onClick={() => setModal({ mode: 'book' })}><Plus size={16} />Add book</button>}
            </PageHeader>
            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'books', label: 'Catalogue' }, { key: 'issues', label: manage ? 'Requests & issuance' : 'My books & requests' }]} />

            {tab === 'books' && (
                <>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <SearchBox value={books.params.q} onChange={(q) => books.set({ q })} placeholder="Title, author, ISBN…" />
                        <Select value={books.params.category} onChange={(category) => books.set({ category })} placeholder="All categories" options={cats.data || []} />
                        <label className="btn-outline cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={!!books.params.digital} onChange={(e) => books.set({ digital: e.target.checked ? 1 : '' })} />Digital library</label>
                    </div>
                    {books.loading && !books.rows.length ? <div className="grid h-40 place-items-center"><Spinner /></div> : !books.rows.length ? <div className="card"><Empty text="No books found." /></div> : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {books.rows.map((b) => (
                                <div key={b.id} className="card flex flex-col p-4">
                                    <div className="mb-3 flex gap-3">
                                        <div className="grid h-20 w-14 shrink-0 place-items-center rounded-lg text-center text-[10px] font-bold leading-tight text-white" style={{ background: `hsl(${(b.id * 47) % 360} 35% 38%)` }}>{b.title.slice(0, 18)}</div>
                                        <div className="min-w-0">
                                            <div className="font-semibold leading-snug">{b.title}</div>
                                            <div className="text-xs text-ink/50">{b.author}</div>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {b.category && <Badge>{b.category}</Badge>}
                                                {b.ebook_path && <Badge value="approved">E-book</Badge>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-auto flex items-center justify-between text-xs text-ink/55">
                                        <span>{b.available}/{b.copies} available{b.shelf ? ' · ' + b.shelf : ''}</span>
                                        <div className="flex gap-1">
                                            {b.ebook_path && <button className="btn-ghost btn-sm" onClick={() => setReader(b)}><FileText size={13} />Read</button>}
                                            {b.copies > 0 && <button className="btn-outline btn-sm" onClick={() => act(() => post(`library/books/${b.id}/request`), 'Request sent to librarian', refresh)}>Request</button>}
                                            {manage && <button className="btn-ghost btn-sm" onClick={() => setModal({ mode: 'book', ...b })}><Pencil size={13} /></button>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {books.data?.last_page > 1 && (
                        <div className="mt-4 flex justify-center gap-2">
                            <button className="btn-outline btn-sm" disabled={books.data.current_page <= 1} onClick={() => books.setPage(books.data.current_page - 1)}>Previous</button>
                            <span className="px-2 py-1.5 text-xs">Page {books.data.current_page} / {books.data.last_page}</span>
                            <button className="btn-outline btn-sm" disabled={books.data.current_page >= books.data.last_page} onClick={() => books.setPage(books.data.current_page + 1)}>Next</button>
                        </div>
                    )}
                </>
            )}

            {tab === 'issues' && (
                <>
                    <div className="mb-3 flex gap-2">
                        <Select value={issues.params.status} onChange={(status) => issues.set({ status })} placeholder="All" options={['requested', 'issued', 'overdue', 'returned', 'rejected']} />
                    </div>
                    <Table list={issues} empty="Nothing here." columns={[
                        { label: 'Book', render: (r) => <div><div className="font-semibold">{r.book?.title}</div><div className="text-xs text-ink/45">{r.book?.author}</div></div> },
                        manage && { label: 'Member', render: (r) => <div>{r.user?.name}<div className="text-xs text-ink/45">{r.user?.house ? r.user.house.label : ''}</div></div> },
                        { label: 'Status', render: (r) => <Badge value={r.status === 'issued' && r.due_at && new Date(r.due_at) < new Date(new Date().toDateString()) ? 'overdue' : r.status} /> },
                        { label: 'Issued', render: (r) => (r.issued_at ? dt(r.issued_at) : '—') },
                        { label: 'Due', render: (r) => (r.due_at ? dt(r.due_at, false) : '—') },
                        { label: 'Issued by', render: (r) => r.issuer?.name || '—' },
                        { label: 'Fine', render: (r) => (r.fine > 0 ? money(r.fine) : '—') },
                        manage && { label: '', className: 'text-right', render: (r) => (
                            <div className="flex justify-end gap-1">
                                {r.status === 'requested' && <button className="btn-primary btn-sm" onClick={() => act(() => post('library/issues', { issue_id: r.id }), 'Book issued', refresh)}><Check size={13} />Issue</button>}
                                {r.status === 'requested' && <button className="btn-ghost btn-sm" onClick={() => act(() => post(`library/issues/${r.id}/reject`, { note: window.prompt('Reason (optional)') || '' }), 'Rejected', refresh)}><X size={13} /></button>}
                                {r.status === 'issued' && <button className="btn-outline btn-sm" onClick={() => act(() => post(`library/issues/${r.id}/return`), 'Return recorded', refresh)}><Undo2 size={13} />Return</button>}
                            </div>
                        ) },
                    ].filter(Boolean)} />
                </>
            )}

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'issue' ? 'Issue a book' : modal?.id ? 'Edit book' : 'Add book'}>
                {modal?.mode === 'issue' && (
                    <Form onSubmit={save} submitLabel="Issue book" fields={[
                        { name: 'book_id', label: 'Book', type: 'select', required: true, options: modal.books.filter((b) => b.available > 0).map((b) => ({ value: b.id, label: `${b.title} (${b.available} left)` })) },
                        { name: 'user_id', label: 'Member', type: 'select', required: true, options: modal.members.map((m) => ({ value: m.id, label: m.name })) },
                        { name: 'days', label: 'Loan period (days)', type: 'number', min: 1, max: 90, default: 14 },
                    ]} />
                )}
                {modal?.mode === 'book' && (
                    <>
                        <Form fields={bookFields} initial={modal} onSubmit={save} />
                        {modal.id && <div className="mt-3 border-t border-ink/5 pt-3"><Confirm className="btn-ghost btn-sm text-red-600" message="Delete this book?" onConfirm={() => act(() => del(`library/books/${modal.id}`), 'Book deleted', () => { setModal(null); refresh(); })}>Delete book</Confirm></div>}
                    </>
                )}
            </Modal>

            <Modal open={!!reader} onClose={() => setReader(null)} title={reader?.title} wide>
                {reader && (reader.ebook_path.endsWith('.pdf')
                    ? <iframe src={fileUrl(reader.ebook_path)} className="h-[75vh] w-full rounded-xl border border-ink/10" title="E-book" />
                    : <a className="btn-primary" href={fileUrl(reader.ebook_path, true)}>Download EPUB</a>)}
            </Modal>
        </div>
    );
}
