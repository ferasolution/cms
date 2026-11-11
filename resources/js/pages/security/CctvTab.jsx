import { useEffect, useRef, useState } from 'react';
import { Cctv, Plus, Maximize2, Settings2, Search, ExternalLink, Grid2x2, Grid3x3, Square, Trash2, MapPin } from 'lucide-react';
import { useGet, Modal, Form, useAction, useToast, Spinner, Confirm } from '../../components/ui';
import { get, post, put, del, dt } from '../../lib/api';
import PlanMap from '../../components/PlanMap';

/** Simulated feed so the wall works before real cameras are connected. */
function DemoFeed({ cam }) {
    const ref = useRef();
    useEffect(() => {
        const c = ref.current, g = c.getContext('2d');
        let raf, t = 0;
        const seed = cam.id * 37;
        const draw = () => {
            t++;
            const w = c.width, h = c.height;
            const grd = g.createLinearGradient(0, 0, 0, h);
            grd.addColorStop(0, '#1d2b2a'); grd.addColorStop(1, '#0c1413');
            g.fillStyle = grd; g.fillRect(0, 0, w, h);
            // road + "buildings"
            g.fillStyle = '#2a3533'; g.beginPath(); g.moveTo(w * 0.35, h * 0.45); g.lineTo(w * 0.65, h * 0.45); g.lineTo(w, h); g.lineTo(0, h); g.fill();
            for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(120,140,135,${0.12 + ((seed + i * 13) % 10) / 80})`; const bx = ((seed * (i + 3)) % 90) / 100 * w; g.fillRect(bx, h * 0.18, w * 0.12, h * 0.3); }
            // moving object
            const x = ((t * (1 + (seed % 3))) % (w + 80)) - 40;
            g.fillStyle = 'rgba(230,230,210,.55)'; g.fillRect(x, h * 0.62 + (seed % 20), 34, 16);
            // noise
            const img = g.getImageData(0, 0, w, h), d = img.data;
            for (let i = 0; i < d.length; i += 4 * 3) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
            g.putImageData(img, 0, 0);
            g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, w, 18);
            g.fillStyle = '#fff'; g.font = '11px monospace';
            g.fillText(`${cam.name.toUpperCase()}`, 6, 13);
            const ts = new Date().toLocaleString();
            g.fillText(ts, w - g.measureText(ts).width - 6, 13);
            g.fillStyle = t % 40 < 20 ? '#ef4444' : 'transparent'; g.beginPath(); g.arc(w - 10, h - 10, 4, 0, 7); g.fill();
            raf = setTimeout(() => requestAnimationFrame(draw), 120);
        };
        draw();
        return () => clearTimeout(raf);
    }, [cam]);
    return <canvas ref={ref} width={480} height={270} className="h-full w-full object-cover" />;
}

function HlsFeed({ url }) {
    const ref = useRef();
    const [err, setErr] = useState('');
    useEffect(() => {
        const v = ref.current;
        let hls;
        if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(() => {}); }
        else import('hls.js').then(({ default: Hls }) => {
            if (!Hls.isSupported()) return setErr('HLS not supported in this browser');
            hls = new Hls({ liveDurationInfinity: true });
            hls.loadSource(url); hls.attachMedia(v);
            hls.on(Hls.Events.ERROR, (_, d) => d.fatal && setErr('Stream offline'));
        });
        return () => hls?.destroy();
    }, [url]);
    return <>{err && <Offline text={err} />}<video ref={ref} muted autoPlay playsInline className="h-full w-full object-cover" /></>;
}

function SnapFeed({ url, every = 2 }) {
    const [n, setN] = useState(0);
    const [err, setErr] = useState(false);
    useEffect(() => { const i = setInterval(() => setN((x) => x + 1), every * 1000); return () => clearInterval(i); }, [every]);
    return err ? <Offline /> : <img src={`${url}${url.includes('?') ? '&' : '?'}_t=${n}`} onError={() => setErr(true)} className="h-full w-full object-cover" alt="" />;
}

const Offline = ({ text = 'Camera offline' }) => <div className="absolute inset-0 grid place-items-center bg-black/80 text-xs font-semibold text-white/70">{text}</div>;

export function Feed({ cam }) {
    if (!cam.active) return <Offline text="Switched off" />;
    if (cam.stream_type === 'demo') return <DemoFeed cam={cam} />;
    if (!cam.stream_url) return <Offline text="No stream URL" />;
    if (cam.stream_type === 'hls') return <HlsFeed url={cam.stream_url} />;
    if (cam.stream_type === 'snapshot') return <SnapFeed url={cam.stream_url} every={cam.refresh_seconds || 2} />;
    if (cam.stream_type === 'embed') return <iframe src={cam.stream_url} className="h-full w-full" allow="autoplay; fullscreen" title={cam.name} />;
    return <img src={cam.stream_url} className="h-full w-full object-cover" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}

/** "Relevant footage" for a moment at a gate — used from visitor records & incidents too. */
export function FootageLinks({ at, gate }) {
    const [d, setD] = useState(null);
    useEffect(() => { get('cameras/footage', { at, gate }).then(setD).catch((e) => setD({ error: e.message })); }, [at, gate]);
    if (!d) return <Spinner />;
    if (d.error) return <p className="text-xs text-ink/45">{d.error}</p>;
    if (!d.cameras.length) return <p className="text-xs text-ink/45">No cameras set up for {gate || 'this place'} yet.</p>;
    return (
        <div className="space-y-2">
            <p className="text-xs text-ink/50">Footage window {dt(d.from)} – {new Date(d.to).toLocaleTimeString()}</p>
            {d.cameras.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl bg-ink/[.03] p-2 text-sm">
                    <Cctv size={15} className="text-ink/45" /><span className="flex-1 font-semibold">{c.name}</span>
                    {c.playback ? <a className="btn-primary btn-sm" href={c.playback} target="_blank" rel="noreferrer"><ExternalLink size={12} />Recording</a> : <span className="text-[11px] text-ink/40">no recorder link</span>}
                </div>
            ))}
        </div>
    );
}

export default function CctvTab({ approve, gates }) {
    const cams = useGet('cameras');
    const map = useGet('map');
    const act = useAction();
    const toast = useToast();
    const [cols, setCols] = useState(3);
    const [big, setBig] = useState(null);
    const [edit, setEdit] = useState(null);
    const [pick, setPick] = useState(null);
    const [find, setFind] = useState({ at: new Date(Date.now() - 10 * 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), gate: '' });
    const [search, setSearch] = useState(null);
    const list = cams.data || [];
    const save = async (v) => {
        const body = { ...v, active: !!v.active, ...(pick ? { map_x: pick[0], map_y: pick[1] } : {}) };
        edit.id ? await put(`cameras/${edit.id}`, body) : await post('cameras', body);
        toast('Camera saved', 'success'); setEdit(null); setPick(null); cams.reload();
    };
    const camMarkers = list.filter((c) => c.map_x).map((c) => ({ key: 'c' + c.id, x: c.map_x, y: c.map_y, icon: '📹', color: c.active ? '#0f766e' : '#94a3b8', label: c.name, onClick: () => setBig(c) }));

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl bg-ink/[.04] p-1">{[[1, Square], [2, Grid2x2], [3, Grid3x3]].map(([n, I]) => <button key={n} onClick={() => setCols(n)} className={`rounded-lg p-1.5 ${cols === n ? 'bg-surface shadow-sm' : 'text-ink/50'}`}><I size={16} /></button>)}</div>
                <span className="text-sm text-ink/55">{list.filter((c) => c.active).length} live camera{list.length === 1 ? '' : 's'}</span>
                {approve && <button className="btn-primary ml-auto" onClick={() => { setEdit({ stream_type: 'hls', active: true, refresh_seconds: 2 }); setPick(null); }}><Plus size={15} />Add camera</button>}
            </div>
            {!cams.data ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
                <div className={`grid gap-3 ${cols === 1 ? '' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
                    {list.map((c) => (
                        <div key={c.id} className="group overflow-hidden rounded-2xl bg-black shadow-sm">
                            <div className="relative aspect-video"><Feed cam={c} />
                                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-white">
                                    <span className="size-2 animate-pulse rounded-full bg-red-500" /><span className="text-sm font-semibold">{c.name}</span><span className="text-[11px] text-white/60">{c.location}</span>
                                    <span className="ml-auto flex gap-1 opacity-80 group-hover:opacity-100">
                                        <button className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" onClick={() => setBig(c)} title="Full screen"><Maximize2 size={14} /></button>
                                        {approve && <button className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" onClick={() => { setEdit(c); setPick(c.map_x ? [c.map_x, c.map_y] : null); }} title="Settings"><Settings2 size={14} /></button>}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!list.length && <div className="card col-span-full p-8 text-center text-sm text-ink/45"><Cctv className="mx-auto mb-2 text-ink/25" size={30} />No cameras yet. {approve ? 'Add your NVR / IP cameras with their HLS, MJPEG or snapshot URL.' : 'Ask the security supervisor to add cameras.'}</div>}
                </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="card p-4">
                    <div className="mb-2 flex items-center gap-2 font-bold"><Search size={16} />Find footage</div>
                    <p className="mb-3 text-xs text-ink/55">Pick a time and gate — opens the recorder playback for the right cameras (2 min before to 5 min after).</p>
                    <div className="flex flex-wrap gap-2">
                        <input type="datetime-local" className="input w-auto" value={find.at} onChange={(e) => setFind({ ...find, at: e.target.value })} />
                        <select className="input w-auto" value={find.gate} onChange={(e) => setFind({ ...find, gate: e.target.value })}><option value="">All cameras</option>{(gates || []).map((g) => <option key={g}>{g}</option>)}</select>
                        <button className="btn-primary" onClick={() => setSearch({ ...find })}>Search</button>
                    </div>
                    {search && <div className="mt-3"><FootageLinks key={search.at + search.gate} at={search.at} gate={search.gate || undefined} /></div>}
                </div>
                {map.data?.site?.boundary && <div className="card p-3"><div className="mb-2 px-1 font-bold">Camera positions</div><PlanMap site={map.data.site} houses={map.data.houses} markers={camMarkers} height={260} compact /></div>}
            </div>

            <Modal open={!!big} onClose={() => setBig(null)} title={big?.name} wide>
                {big && <div><div className="relative aspect-video overflow-hidden rounded-xl bg-black"><Feed cam={big} /></div>
                    <div className="mt-3"><div className="mb-1 text-sm font-semibold">Recording of the last 10 minutes</div><FootageLinks at={new Date(Date.now() - 5 * 60000).toISOString()} gate={big.gate || undefined} /></div></div>}
            </Modal>
            <Modal open={!!edit} onClose={() => { setEdit(null); setPick(null); }} title={edit?.id ? 'Camera settings' : 'Add camera'} wide>
                {edit && <Form initial={edit} onSubmit={save} submitLabel="Save" fields={[
                    { name: 'name', label: 'Name', required: true, half: true }, { name: 'location', label: 'Location', half: true },
                    { name: 'gate', label: 'Linked gate (for gate footage)', type: 'select', options: gates || [], half: true },
                    { name: 'stream_type', label: 'Stream type', type: 'select', required: true, half: true, options: [{ value: 'hls', label: 'HLS (.m3u8) — NVR / cloud' }, { value: 'mjpeg', label: 'MJPEG stream' }, { value: 'snapshot', label: 'Snapshot JPG (auto refresh)' }, { value: 'embed', label: 'Web player (iframe)' }, { value: 'demo', label: 'Demo feed' }] },
                    { name: 'stream_url', label: 'Live stream URL', hint: 'Use an https:// address — browsers block plain http video on an https site. RTSP needs a converter (e.g. NVR cloud / go2rtc) that gives HLS.' },
                    { name: 'playback_url', label: 'Recorder playback URL (optional)', hint: 'Placeholders: {start} {end} (ISO), {start_hik} {end_hik} (Hikvision), {start_unix} {end_unix}, {date} {time}' },
                    { name: 'refresh_seconds', label: 'Snapshot refresh (seconds)', type: 'number', min: 1, half: true }, { name: 'sort', label: 'Order', type: 'number', half: true },
                    { name: 'active', label: 'Camera on', type: 'checkbox' },
                ]}>
                    {() => (
                        <div>
                            <div className="label flex items-center gap-1"><MapPin size={13} />Position on the map {pick ? <span className="text-ink/45">({pick[0]}, {pick[1]})</span> : <span className="text-ink/45">— click the map</span>}</div>
                            {map.data?.site?.boundary && <PlanMap site={map.data.site} houses={map.data.houses} height={220} compact onPick={(x, y) => setPick([x, y])} markers={pick ? [{ key: 'p', x: pick[0], y: pick[1], icon: '📹', color: '#f5a524', pulse: true }] : []} />}
                            {edit.id && <div className="mt-3"><Confirm className="btn-ghost btn-sm text-red-600" message="Remove this camera?" onConfirm={() => act(() => del(`cameras/${edit.id}`), 'Removed', () => { setEdit(null); cams.reload(); })}><Trash2 size={13} />Remove camera</Confirm></div>}
                        </div>
                    )}
                </Form>}
            </Modal>
        </>
    );
}
