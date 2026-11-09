<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use App\Support\Settings;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function show(Request $request)
    {
        $this->authorizeView($request, 'settings');

        return Settings::all();
    }

    public function update(Request $request)
    {
        $this->authorizeManage($request, 'settings');
        $data = $request->validate([
            'community_name' => 'required|string|max:120', 'address' => 'nullable|string|max:255', 'helpline' => 'nullable|string|max:60',
            'visitor_max_stay_minutes' => 'required|integer|min:15|max:4320', 'visitor_approval_required' => 'boolean', 'visitor_approval_timeout_minutes' => 'required|integer|min:1|max:120',
            'event_warning_minutes' => 'required|integer|min:5|max:240', 'event_grace_minutes' => 'required|integer|min:0|max:240',
            'late_fee_percent' => 'required|numeric|min:0|max:100', 'library_loan_days' => 'required|integer|min:1|max:90', 'library_fine_per_day' => 'required|numeric|min:0',
            'gym_due_reminder_days' => 'required|integer|min:0|max:30', 'payment_title' => 'nullable|string|max:120', 'payment_bank' => 'nullable|string|max:120',
            'payment_account' => 'nullable|string|max:60', 'payment_iban' => 'nullable|string|max:40', 'payment_wallet' => 'nullable|string|max:120',
            'work_day_minutes' => 'required|integer|min:60|max:960', 'late_grace_minutes' => 'required|integer|min:0|max:120', 'emergency_contacts' => 'nullable|string|max:2000',
        ]);
        $all = Settings::save($data);
        Activity::log('settings', 'update', 'Updated system settings');

        return $all;
    }
}
