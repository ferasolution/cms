<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationRun;
use App\Models\Setting;
use App\Services\Automations;
use App\Services\SitePlan;
use App\Support\Activity;
use App\Support\Settings;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    private const RULES = [
        'community_name' => 'required|string|max:120', 'address' => 'nullable|string|max:255', 'helpline' => 'nullable|string|max:60',
        'visitor_max_stay_minutes' => 'required|integer|min:15|max:4320', 'visitor_approval_required' => 'boolean', 'visitor_approval_timeout_minutes' => 'required|integer|min:1|max:120',
        'event_warning_minutes' => 'required|integer|min:5|max:240', 'event_grace_minutes' => 'required|integer|min:0|max:240',
        'late_fee_percent' => 'required|numeric|min:0|max:100', 'library_loan_days' => 'required|integer|min:1|max:90', 'library_fine_per_day' => 'required|numeric|min:0',
        'gym_due_reminder_days' => 'required|integer|min:0|max:30', 'payment_title' => 'nullable|string|max:120', 'payment_bank' => 'nullable|string|max:120',
        'payment_account' => 'nullable|string|max:60', 'payment_iban' => 'nullable|string|max:40', 'payment_wallet' => 'nullable|string|max:120',
        'work_day_minutes' => 'required|integer|min:60|max:960', 'late_grace_minutes' => 'required|integer|min:0|max:120', 'emergency_contacts' => 'nullable|string|max:2000',
        // automations
        'auto_complaint_assign' => 'boolean', 'complaint_workers' => 'nullable|string|max:3000', 'complaint_escalate_hours' => 'integer|min:0|max:240',
        'visitor_auto_reject' => 'boolean', 'event_auto_close' => 'boolean', 'maintenance_reminders' => 'boolean', 'maintenance_due_day' => 'integer|min:1|max:28',
        'library_reminders' => 'boolean', 'inventory_reminders' => 'boolean', 'gym_auto_block_days' => 'integer|min:0|max:90', 'staff_absent_alert' => 'boolean',
        'staff_auto_checkout_hours' => 'integer|min:0|max:24', 'noc_sla_days' => 'integer|min:0|max:60', 'daily_digest' => 'boolean', 'leave_auto_status' => 'boolean',
        // security suite
        'gate_names' => 'nullable|string|max:500', 'gate_receipt_footer' => 'nullable|string|max:255', 'shift_slots' => 'nullable|string|max:500', 'shift_posts' => 'nullable|string|max:500',
        'shift_late_minutes' => 'integer|min:0|max:240', 'shift_alerts' => 'boolean', 'patrol_interval_minutes' => 'integer|min:0|max:1440', 'patrol_alerts' => 'boolean',
        'staff_schedule_alerts' => 'boolean', 'staff_notify_household' => 'boolean',
    ];

    public function show(Request $request)
    {
        $this->authorizeView($request, 'settings');

        return Settings::all() + ['map_geo' => SitePlan::site()['geo'] ?? null];
    }

    public function update(Request $request)
    {
        $this->authorizeManage($request, 'settings');
        $rules = collect(self::RULES)->map(fn ($r) => str_starts_with($r, 'required') ? 'sometimes|'.$r : 'sometimes|'.$r)->all();
        $all = Settings::save($request->validate($rules));
        Activity::log('settings', 'update', 'Updated system settings');

        return $all;
    }

    /** Load the Block 19 site plan: re-matches houses already on the map and creates the missing plots. */
    public function applySitePlan(Request $request)
    {
        abort_unless($request->user()->isSuperAdmin(), 403, 'Only a Super Admin can load a site plan.');
        $r = SitePlan::apply();
        Activity::log('settings', 'site_plan', "Loaded Block 19 site plan — {$r['plots']} plots ({$r['created']} new, {$r['renumbered']} renumbered)");

        return $r;
    }

    /** Two known points on the plan (plot centres) with their real GPS position → used for "Navigate" links. */
    public function saveGeo(Request $request)
    {
        $this->authorizeManage($request, 'settings');
        $d = $request->validate(['p1.x' => 'required|numeric', 'p1.y' => 'required|numeric', 'p1.lat' => 'required|numeric|between:-90,90', 'p1.lng' => 'required|numeric|between:-180,180',
            'p2.x' => 'required|numeric', 'p2.y' => 'required|numeric', 'p2.lat' => 'required|numeric|between:-90,90', 'p2.lng' => 'required|numeric|between:-180,180']);
        abort_if(abs($d['p1']['x'] - $d['p2']['x']) + abs($d['p1']['y'] - $d['p2']['y']) < 50, 422, 'Pick two plots that are far apart.');
        Setting::put('map_geo', ['p1' => $d['p1'], 'p2' => $d['p2']]);
        Activity::log('settings', 'update', 'Updated the map GPS reference points');

        return SitePlan::site()['geo'];
    }

    public function automations(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);

        return [
            'rules' => Automations::overview(),
            'recent' => AutomationRun::latest('id')->limit(40)->get(),
            'workers' => Automations::workers(),
            'can_edit' => $request->user()->canManage('settings'),
        ];
    }

    public function runAutomations(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        foreach (array_keys(Automations::RULES) as $r) {
            \Illuminate\Support\Facades\Cache::forget('auto:'.$r);
        }
        \Illuminate\Support\Facades\Cache::forget('watchers-lock');
        \App\Services\Watchers::run();
        Activity::log('settings', 'automation', 'Ran all automations manually');

        return $this->automations($request);
    }
}
