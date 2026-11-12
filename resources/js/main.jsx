import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AlertProvider } from './lib/alerts';
import { Spinner, ToastProvider } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

const MapPage = lazy(() => import('./pages/MapPage'));
const Security = lazy(() => import('./pages/Security'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Library = lazy(() => import('./pages/Library'));
const Finance = lazy(() => import('./pages/Finance'));
const Events = lazy(() => import('./pages/Events'));
const Complaints = lazy(() => import('./pages/Complaints'));
const Noc = lazy(() => import('./pages/Noc'));
const Records = lazy(() => import('./pages/Records'));
const Users = lazy(() => import('./pages/Users'));
const Crm = lazy(() => import('./pages/Crm'));
const Gym = lazy(() => import('./pages/Gym'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Emergency = lazy(() => import('./pages/Emergency'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Workspace = lazy(() => import('./pages/Workspace'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const Profile = lazy(() => import('./pages/Profile'));

const Loading = () => <div className="grid h-full place-items-center"><Spinner /></div>;

function Guard({ module, children }) {
    const { can } = useAuth();
    return can(module) ? children : <Navigate to="/" replace />;
}

const MODULE_PAGES = { security: Security, inventory: Inventory, library: Library, finance: Finance, events: Events, complaints: Complaints, noc: Noc,
    records: Records, users: Users, crm: Crm, gym: Gym, announcements: Announcements, emergency: Emergency, settings: SettingsPage };

function App() {
    const { loading, user, isAdmin, employee } = useAuth();
    if (loading) return <Loading />;
    if (!user) return <Login />;
    return (
        <AlertProvider>
            <Suspense fallback={<Loading />}>
                <Routes>
                    <Route element={<Layout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="map" element={<MapPage />} />
                        {Object.entries(MODULE_PAGES).map(([m, Page]) => <Route key={m} path={m} element={<Guard module={m}><Page /></Guard>} />)}
                        {employee && <Route path="workspace" element={<Workspace />} />}
                        {isAdmin && <Route path="activity" element={<ActivityPage />} />}
                        {isAdmin && <Route path="automations" element={<AutomationsPage />} />}
                        <Route path="profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        </AlertProvider>
    );
}

const PlatformApp = lazy(() => import('./platform/PlatformApp'));
const SocietyClosed = lazy(() => import('./platform/SocietyClosed'));
const mode = window.APP?.mode || 'tenant';

createRoot(document.getElementById('root')).render(
    mode === 'platform' ? (
        <BrowserRouter>
            <ToastProvider><Suspense fallback={<Loading />}><PlatformApp /></Suspense></ToastProvider>
        </BrowserRouter>
    ) : window.APP?.society?.open === false ? (
        <Suspense fallback={<Loading />}><SocietyClosed /></Suspense>
    ) : (
        <BrowserRouter basename={window.APP?.base || '/'}>
            <ToastProvider>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    ),
);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
