import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get, post } from './api';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui';

const AlertCtx = createContext(null);
export const useAlerts = () => useContext(AlertCtx);

// Alarm tone made with WebAudio, so no sound files are needed.
let audioCtx;
export function ringAlarm(times = 3) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const t0 = audioCtx.currentTime;
        for (let i = 0; i < times * 2; i++) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'square';
            o.frequency.value = i % 2 ? 660 : 880;
            g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
            g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.35 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.3);
            o.connect(g).connect(audioCtx.destination);
            o.start(t0 + i * 0.35);
            o.stop(t0 + i * 0.35 + 0.32);
        }
    } catch { /* audio blocked until user interacts */ }
}
function chime() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.frequency.value = 1046; g.gain.setValueAtTime(0.12, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.5);
    } catch { /* ignore */ }
}

/**
 * The live pulse — polls /api/alerts every few seconds (works on shared hosting).
 * Returns new alerts, active SOS calls and which modules changed, so every open page refreshes itself.
 */
export function AlertProvider({ children, interval = 5000 }) {
    const [state, setState] = useState({ alerts: [], unread: 0, sos: [], online: true, lastSync: null });
    const [ringing, setRinging] = useState(false);
    const [tick, setTick] = useState(0);
    const [changes, setChanges] = useState({ n: 0, modules: [] });
    const since = useRef(0);
    const cursor = useRef(0);
    const toast = useToast();
    const nav = useNavigate();

    const poll = useCallback(async () => {
        try {
            const r = await get('alerts', { since: since.current, cursor: cursor.current });
            const fresh = since.current ? r.new : [];
            since.current = r.latest_id || since.current;
            const first = !cursor.current;
            cursor.current = r.cursor || cursor.current;
            setState({ alerts: r.alerts, unread: r.unread, sos: r.sos || [], online: true, lastSync: new Date() });
            if (!first && r.changed?.length) setChanges((c) => ({ n: c.n + 1, modules: r.changed }));
            if (fresh.length) {
                setTick((t) => t + 1);
                [...new Map(fresh.map((a) => [a.title, a])).values()].slice(0, 3).forEach((a) => toast(a.title, a.level, a.body,
                    a.house_id ? { label: '📍 Locate on map', onClick: () => nav(a.module === 'emergency' && a.link?.includes('sos=') ? '/map?' + a.link.split('?')[1] : '/map?house=' + a.house_id) } : a.link ? { label: 'Open', onClick: () => nav(a.link) } : undefined));
                if (fresh.some((a) => a.level === 'danger')) {
                    ringAlarm(4);
                    setRinging(true);
                    setTimeout(() => setRinging(false), 15000);
                } else chime();
                if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                    fresh.slice(0, 2).forEach((a) => new Notification(a.title, { body: a.body || '', icon: '/icon.svg' }));
                }
            }
        } catch { setState((s) => ({ ...s, online: false })); }
    }, [toast, nav]);

    useEffect(() => {
        poll();
        const id = setInterval(() => !document.hidden && poll(), interval);
        const vis = () => !document.hidden && poll();
        document.addEventListener('visibilitychange', vis);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
    }, [poll, interval]);

    const markRead = async (id) => { await post(`alerts/${id}/read`); poll(); };
    const markAll = async () => { await post('alerts/read-all'); poll(); };

    return <AlertCtx.Provider value={{ ...state, ringing, tick, changes, markRead, markAll, refresh: poll }}>{children}</AlertCtx.Provider>;
}

/** Re-run `reload` whenever any of the given modules changes anywhere in the community (live updates). */
export function useLive(modules, reload) {
    const { changes, tick } = useAlerts() || {};
    const list = Array.isArray(modules) ? modules : [modules];
    const r = useRef(reload);
    r.current = reload;
    useEffect(() => {
        if (changes?.n && changes.modules.some((m) => list.includes(m))) r.current();
    }, [changes?.n]); // eslint-disable-line
    useEffect(() => { if (tick) r.current(); }, [tick]);
}
