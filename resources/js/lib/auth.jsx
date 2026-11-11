import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post, setUnauthorizedHandler } from './api';

const AuthCtx = createContext(null);

export const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', editor: 'Editor', user: 'User' };

export function AuthProvider({ children }) {
    const [state, setState] = useState({ loading: true, user: null, modules: [], roles: {}, roleLabel: '', community: '', employee: null });

    const apply = (r) => {
        setState({ loading: false, user: r.user, modules: r.modules, roles: r.roles, roleLabel: r.role_label, community: r.community, employee: r.employee });
        if (r.community) window.APP = { ...(window.APP || {}), name: r.community };
        if (r.user?.theme) applyTheme(r.user.theme);
    };
    const refresh = useCallback(() => get('me').then(apply).catch(() => setState((s) => ({ ...s, loading: false, user: null }))), []);

    useEffect(() => {
        setUnauthorizedHandler(() => setState((s) => ({ ...s, user: null })));
        refresh();
    }, [refresh]);

    const login = async (email, password, remember) => apply(await post('login', { email, password, remember }));
    const logout = async () => { await post('logout'); setState((s) => ({ ...s, user: null })); };

    const level = (module) => state.modules.find((m) => m.key === module)?.level || 0;
    // can(module) = can open it · can(module, true) = can create/edit · approve(module) = can approve/delete
    const can = (module, manage = false) => level(module) >= (manage ? 2 : 1);
    const approve = (module) => level(module) >= 3;
    const role = state.user?.role;

    return (
        <AuthCtx.Provider value={{ ...state, login, logout, refresh, apply, can, approve, level,
            isSuper: role === 'super_admin', isAdmin: role === 'super_admin' || role === 'admin', isResident: role === 'user', isStaff: role === 'editor' }}>
            {children}
        </AuthCtx.Provider>
    );
}

export const useAuth = () => useContext(AuthCtx);

/** light | dark | system — stored per device, synced to the profile. */
export function applyTheme(mode) {
    const m = mode || localStorageGet('theme') || 'system';
    const dark = m === 'dark' || (m === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', !!dark);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1022' : '#101833');
    try { localStorage.setItem('theme', m); } catch { /* private mode */ }
    return m;
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
applyTheme();
