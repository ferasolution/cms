import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get, post } from './api';
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

/** Polls /api/alerts every few seconds — live updates that work on shared hosting. */
export function AlertProvider({ children, interval = 8000 }) {
    const [state, setState] = useState({ alerts: [], unread: 0 });
    const [ringing, setRinging] = useState(false);
    const [tick, setTick] = useState(0); // bumps on each new alert so pages can refresh
    const since = useRef(0);
    const toast = useToast();

    const poll = useCallback(async () => {
        try {
            const r = await get('alerts', { since: since.current });
            const fresh = since.current ? r.new : [];
            since.current = r.latest_id || since.current;
            setState({ alerts: r.alerts, unread: r.unread });
            if (fresh.length) {
                setTick((t) => t + 1);
                fresh.slice(0, 3).forEach((a) => toast(a.title, a.level, a.body));
                if (fresh.some((a) => a.level === 'danger')) {
                    ringAlarm(4);
                    setRinging(true);
                    setTimeout(() => setRinging(false), 15000);
                } else chime();
                if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                    fresh.slice(0, 2).forEach((a) => new Notification(a.title, { body: a.body || '', icon: '/icon.svg' }));
                }
            }
        } catch { /* offline — try next tick */ }
    }, [toast]);

    useEffect(() => {
        poll();
        const id = setInterval(() => !document.hidden && poll(), interval);
        const vis = () => !document.hidden && poll();
        document.addEventListener('visibilitychange', vis);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
    }, [poll, interval]);

    const markRead = async (id) => { await post(`alerts/${id}/read`); poll(); };
    const markAll = async () => { await post('alerts/read-all'); poll(); };

    return <AlertCtx.Provider value={{ ...state, ringing, tick, markRead, markAll, refresh: poll }}>{children}</AlertCtx.Provider>;
}
