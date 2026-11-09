import { UserCircle, Smartphone } from 'lucide-react';
import { PageHeader, Form, useToast } from '../components/ui';
import { put } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Profile() {
    const { user, roleLabel, apply } = useAuth();
    const toast = useToast();
    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader icon={UserCircle} title="My profile" subtitle={`${roleLabel} · ${user.email}`} />
            <div className="card p-5">
                <Form initial={{ name: user.name, phone: user.phone }} submitLabel="Save changes" onSubmit={async (v) => { apply(await put('profile', v)); toast('Profile updated'); }} fields={[
                    { name: 'name', label: 'Name', required: true, half: true },
                    { name: 'phone', label: 'Phone', half: true },
                    { name: 'current_password', label: 'Current password', type: 'password', hint: 'Only needed to change your password' },
                    { name: 'password', label: 'New password', type: 'password', half: true },
                    { name: 'password_confirmation', label: 'Confirm new password', type: 'password', half: true },
                ]} />
            </div>
            <div className="card mt-4 flex gap-3 p-5 text-sm">
                <Smartphone className="shrink-0 text-brand-600" />
                <div>
                    <div className="font-semibold">Install as a mobile app</div>
                    <p className="mt-1 text-black/60"><b>Android (Chrome):</b> menu ⋮ → “Install app”. <b>iPhone (Safari):</b> Share → “Add to Home Screen”. Alerts arrive while the app is open; allow notifications when asked.</p>
                </div>
            </div>
        </div>
    );
}
