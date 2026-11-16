import { Settings2 } from 'lucide-react';
import { Form, PageHeader, useToast } from '../../components/ui';
import { papi } from '../../lib/api';
import { COUNTRIES, Loading, Panel, usePlatform } from './kit';

function PlatformSettings() {
    const [s, , err] = usePlatform('settings');
    const toast = useToast();
    if (err) return null;
    if (!s) return <Loading />;
    return (
        <Panel title="Platform">
            <Form initial={s} submitLabel="Save settings" onSubmit={async (v) => { await papi.put('settings', { ...v, trial_days: Number(v.trial_days) }); toast('Settings saved', 'success'); }}
                fields={[
                    { name: 'brand_name', label: 'Platform name', required: true, half: true },
                    { name: 'support_email', label: 'Support email', type: 'email', half: true, hint: 'Shown to communities when they need help or a plan.' },
                    { name: 'trial_days', label: 'Free trial length (days)', type: 'number', min: 0, max: 90, required: true, half: true, hint: '0 = no trial; new communities must pay first.' },
                    { name: 'default_country', label: 'Default country on sign-up', type: 'select', required: true, half: true, options: COUNTRIES },
                    { name: 'registration_open', label: 'Accept new sign-ups on the website', type: 'checkbox' },
                    { name: 'require_card_after_trial', label: 'Close the portal when a trial ends without a plan', type: 'checkbox' },
                ]} />
        </Panel>
    );
}

export default function Settings({ owner, me, onMe }) {
    const toast = useToast();
    return (
        <div>
            <PageHeader icon={Settings2} title="Settings" subtitle="How the platform behaves, and your own account." />
            <div className="grid gap-5 lg:grid-cols-2">
                {owner && <PlatformSettings />}
                <Panel title="My account">
                    <Form initial={{ name: me.name }} submitLabel="Save my account" onSubmit={async (v) => { await papi.put('account', v); toast('Account saved', 'success'); onMe(); }}
                        fields={[
                            { name: 'name', label: 'Name', required: true },
                            { name: 'current_password', label: 'Current password', type: 'password', half: true, hint: 'Only needed to change the password.' },
                            { name: 'password', label: 'New password (10+ characters)', type: 'password', half: true },
                            { name: 'password_confirmation', label: 'New password again', type: 'password', half: true },
                        ]} />
                    <p className="mt-3 text-xs text-ink/45">Signed in as {me.email}.</p>
                </Panel>
            </div>
        </div>
    );
}
