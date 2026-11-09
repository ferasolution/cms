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
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const Profile = lazy(() => import('./pages/Profile'));

const Loading = () => <div className="grid h-full place-items-center"><Spinner /></div>;

function Guard({ module, children }) {
    const { can } = useAuth();
    return can(module) ? children : <Navigate to="/" replace />;
}

function App() {
    const { loading, user, isAdmin } = useAuth();
    if (loading) return <Loading />;
    if (!user) return <Login />;
    return (
        <AlertProvider>
            <Suspense fallback={<Loading />}>
                <Routes>
                    <Route element={<Layout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="map" element={<MapPage />} />
                        <Route path="security" element={<Guard module="security"><Security /></Guard>} />
                        <Route path="inventory" element={<Guard module="inventory"><Inventory /></Guard>} />
                        <Route path="library" element={<Guard module="library"><Library /></Guard>} />
                        <Route path="finance" element={<Guard module="finance"><Finance /></Guard>} />
                        <Route path="events" element={<Guard module="events"><Events /></Guard>} />
                        <Route path="complaints" element={<Guard module="complaints"><Complaints /></Guard>} />
                        <Route path="noc" element={<Guard module="noc"><Noc /></Guard>} />
                        <Route path="records" element={<Guard module="records"><Records /></Guard>} />
                        <Route path="users" element={<Guard module="users"><Users /></Guard>} />
                        {isAdmin && <Route path="activity" element={<ActivityPage />} />}
                        <Route path="profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        </AlertProvider>
    );
}

createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <ToastProvider>
            <AuthProvider>
                <App />
            </AuthProvider>
        </ToastProvider>
    </BrowserRouter>,
);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
