import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post, setUnauthorizedHandler } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [state, setState] = useState({ loading: true, user: null, modules: [], roles: {}, roleLabel: '' });

    const apply = (r) => setState({ loading: false, user: r.user, modules: r.modules, roles: r.roles, roleLabel: r.role_label });
    const refresh = useCallback(() => get('me').then(apply).catch(() => setState((s) => ({ ...s, loading: false, user: null }))), []);

    useEffect(() => {
        setUnauthorizedHandler(() => setState((s) => ({ ...s, user: null })));
        refresh();
    }, [refresh]);

    const login = async (email, password, remember) => apply(await post('login', { email, password, remember }));
    const logout = async () => { await post('logout'); setState((s) => ({ ...s, user: null })); };

    const can = (module, manage = false) => state.user?.role === 'admin' || state.modules.some((m) => m.key === module && (!manage || m.manage));

    return <AuthCtx.Provider value={{ ...state, login, logout, refresh, apply, can, isAdmin: state.user?.role === 'admin', isResident: state.user?.role === 'resident' }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
