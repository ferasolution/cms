// Small fetch wrapper for the Laravel session API (cookie auth + CSRF).
function xsrf() {
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : document.querySelector('meta[name="csrf-token"]')?.content;
}

export class ApiError extends Error {
    constructor(message, status, errors = {}) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

function toFormData(data) {
    const fd = new FormData();
    const add = (key, val) => {
        if (val === undefined || val === null || val === '') return;
        if (val instanceof File) fd.append(key, val);
        else if (Array.isArray(val)) val.forEach((v, i) => add(`${key}[${i}]`, v));
        else if (typeof val === 'object' && !(val instanceof Blob)) Object.entries(val).forEach(([k, v]) => add(`${key}[${k}]`, v));
        else if (typeof val === 'boolean') fd.append(key, val ? '1' : '0');
        else fd.append(key, val);
    };
    Object.entries(data).forEach(([k, v]) => add(k, v));
    return fd;
}

const hasFile = (o) => o && typeof o === 'object' && Object.values(o).some((v) => v instanceof File || (Array.isArray(v) && v.some((x) => x instanceof File)));

/** Base of the current society, e.g. "/block19" ('' on the platform site). */
export const BASE = window.APP?.base || '';
/** The society's region: currency, locale and wording (set from its country, editable in Settings). */
const R = window.APP?.society || {};
export const CURRENCY = R.currency || 'USD';
export const LOCALE = R.locale || undefined;
export const UNIT = R.unit_label || 'Lot';
export const ID_LABEL = R.id_label || 'ID number';

export async function api(method, url, data, { params, root } = {}) {
    let full = (root ?? BASE + '/api/') + url.replace(/^\//, '');
    if (params) {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false));
        if ([...qs].length) full += '?' + qs;
    }
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf() || '' };
    let body;
    if (data !== undefined) {
        if (hasFile(data)) {
            body = toFormData(data);
        } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(data);
        }
    }
    const res = await fetch(full, { method, headers, body, credentials: 'same-origin' });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401) onUnauthorized();
        if (res.status === 419) { window.location.reload(); }
        const errors = json.errors || {};
        const first = Object.values(errors)[0]?.[0];
        throw new ApiError(first || json.message || `Request failed (${res.status})`, res.status, errors);
    }
    return json;
}

export const get = (url, params) => api('GET', url, undefined, { params });
export const post = (url, data) => api('POST', url, data ?? {});
export const put = (url, data) => api('PUT', url, data ?? {});
export const del = (url) => api('DELETE', url);
/** Platform (SaaS) API — landing, sign-up and the owner console. */
export const papi = {
    get: (url, params) => api('GET', url, undefined, { params, root: '/_p/api/' }),
    post: (url, data) => api('POST', url, data ?? {}, { root: '/_p/api/' }),
    put: (url, data) => api('PUT', url, data ?? {}, { root: '/_p/api/' }),
};

export const fileUrl = (path, download = false) => (path ? `${BASE}/files/${path}${download ? '?download=1' : ''}` : null);
const SYM = { USD: '$', CAD: 'CA$', AUD: 'A$', GBP: '£', EUR: '€', PKR: 'Rs ', INR: '₹', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ' };
export const money = (n, cur = CURRENCY) => (SYM[cur] ?? cur + ' ') + Number(n || 0).toLocaleString(LOCALE, { maximumFractionDigits: 0 });
export const dt = (s, withTime = true) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleString(LOCALE, withTime ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
};
export const ago = (s) => {
    const sec = Math.round((Date.now() - new Date(s)) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
};
export const duration = (a, b) => {
    if (!a) return '—';
    const m = Math.max(0, Math.round(((b ? new Date(b) : new Date()) - new Date(a)) / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const today = () => new Date().toLocaleDateString('en-CA');
