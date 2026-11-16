import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { PageHeader, SearchBox, Select } from '../../components/ui';
import { dt } from '../../lib/api';
import { Loading, usePlatform } from './kit';

const KINDS = [['', 'Everything'], ['society', 'Communities'], ['billing', 'Payments'], ['plans', 'Plans'], ['notice', 'Notices'], ['team', 'Team'], ['login', 'Sign-ins'], ['signup', 'Sign-ups'], ['settings', 'Settings'], ['system', 'System']];

/** Everything the platform team has done, newest first. */
export default function Audit() {
    const [f, setF] = useState({ action: '', q: '' });
    const [rows] = usePlatform('audit', f);
    return (
        <div>
            <PageHeader icon={ScrollText} title="Audit trail" subtitle="Every change made from this console, and every new sign-up.">
                <Select value={f.action} onChange={(v) => setF({ ...f, action: v })} options={KINDS.map(([value, label]) => ({ value, label }))} />
                <SearchBox value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Search" />
            </PageHeader>
            {!rows ? <Loading /> : (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="border-b border-ink/[.07] bg-canvas/60"><tr><th className="th">When</th><th className="th">Who</th><th className="th">What happened</th><th className="th">Community</th></tr></thead>
                            <tbody className="divide-y divide-ink/[.05]">
                                {rows.map((a) => {
                                    const meta = a.meta ? JSON.parse(a.meta) : null;
                                    return (
                                        <tr key={a.id} className="align-top">
                                            <td className="td whitespace-nowrap text-ink/60">{dt(a.created_at)}</td>
                                            <td className="td whitespace-nowrap font-semibold">{a.user_name}<div className="text-xs font-normal text-ink/40">{a.ip}</div></td>
                                            <td className="td">{a.description}{meta?.changes && <div className="mt-1 break-all text-xs text-ink/45">{meta.changes}</div>}</td>
                                            <td className="td">{a.society_id ? <Link className="text-brand-600" to={`/platform/communities/${a.society_id}`}>Open</Link> : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {!rows.length && <p className="p-10 text-center text-sm text-ink/45">Nothing matches.</p>}
                </div>
            )}
        </div>
    );
}
