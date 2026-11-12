import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Landing from './Landing';

const Register = lazy(() => import('./Register'));
const Console = lazy(() => import('./Console'));

/** The SaaS site at the root: landing, sign-up and the platform owner console. */
export default function PlatformApp() {
    return (
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/register" element={<Register />} />
            <Route path="/platform/*" element={<Console />} />
            <Route path="*" element={<Landing />} />
        </Routes>
    );
}
