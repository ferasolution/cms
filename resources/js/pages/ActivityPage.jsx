import { Activity } from 'lucide-react';
import { useList, PageHeader, SearchBox, Select, Spinner } from '../components/ui';
import { ActivityFeed } from './Dashboard';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/alerts';
import { useEffect } from 'react';

export default function ActivityPage() {
    const { modules } = useAuth();
    const list = useList('activity');
    useLive(["security", "inventory", "library", "finance", "events", "complaints", "noc", "records", "crm", "gym", "announcements", "emergency", "users", "settings"], () => { list.reload(); });
    return (
        <div className="mx-auto max-w-4xl">
            <PageHeader icon={Activity} title="Audit & Activity Log" subtitle="Every action by every user in every module — live. Filter by module or date, export to CSV." />
            <div className="mb-3 flex flex-wrap gap-2">
                <SearchBox value={list.params.q} onChange={(q) => list.set({ q })} />
                <Select value={list.params.module} onChange={(module) => list.set({ module })} placeholder="All modules" options={modules.map((m) => ({ value: m.key, label: m.label }))} />
                <input type="date" className="input w-auto" value={list.params.from || ''} onChange={(e) => list.set({ from: e.target.value })} />
            </div>
            <div className="card px-5 py-2">{list.loading && !list.rows.length ? <div className="grid h-40 place-items-center"><Spinner /></div> : <ActivityFeed rows={list.rows} />}</div>
            {list.data?.last_page > 1 && (
                <div className="mt-3 flex justify-center gap-2">
                    <button className="btn-outline btn-sm" disabled={list.data.current_page <= 1} onClick={() => list.setPage(list.data.current_page - 1)}>Newer</button>
                    <button className="btn-outline btn-sm" disabled={list.data.current_page >= list.data.last_page} onClick={() => list.setPage(list.data.current_page + 1)}>Older</button>
                </div>
            )}
        </div>
    );
}
