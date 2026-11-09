<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Services\Watchers;
use App\Support\Access;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The live "pulse". The portal calls this every few seconds; it returns new alerts, which modules
 * changed since the last call (so open pages refresh themselves) and active SOS calls.
 * Each call also runs the time-based watchers, so no cron job is needed on shared hosting.
 */
class AlertController extends Controller
{
    private function visible(Request $request)
    {
        $user = $request->user();
        $levels = Access::levels($user);

        return Alert::query()
            ->where(function ($q) use ($user, $levels) {
                $q->where('user_id', $user->id);
                foreach ($levels as $module => $level) {
                    $q->orWhere(fn ($w) => $w->where('audience_module', $module)->where('audience_level', '<=', $level));
                }
            })
            ->where('created_at', '>=', $user->created_at?->copy()->subDay() ?? now()->subYear());
    }

    public function index(Request $request)
    {
        Watchers::run();
        $user = $request->user();
        $uid = $user->id;
        $since = (int) $request->query('since', 0);

        $alerts = $this->visible($request)
            ->select('alerts.*', DB::raw("(select count(*) from alert_reads where alert_reads.alert_id = alerts.id and alert_reads.user_id = {$uid}) as is_read"))
            ->latest('id')->limit(30)->get();

        // Live change feed: which modules had activity since the client's cursor.
        $cursor = (int) $request->query('cursor', 0);
        $latest = (int) ActivityLog::max('id');
        $changed = [];
        if ($cursor && $latest > $cursor) {
            $changed = ActivityLog::where('id', '>', $cursor)->distinct()->pluck('module')->values();
        }

        $sos = [];
        if (Access::canView($user, 'emergency') && ! $user->isResident()) {
            $sos = SosAlert::with(['house', 'user:id,name,phone'])->whereIn('status', ['active', 'responding'])->latest()->get();
        } elseif ($user->isResident()) {
            $sos = SosAlert::where('user_id', $uid)->whereIn('status', ['active', 'responding'])->latest()->get();
        }

        return response()->json([
            'alerts' => $alerts,
            'unread' => $this->visible($request)->whereDoesntHave('readers', fn ($q) => $q->where('users.id', $uid))->count(),
            'new' => $since ? $alerts->where('id', '>', $since)->values() : [],
            'latest_id' => $alerts->max('id') ?? $since,
            'cursor' => $latest,
            'changed' => $changed,
            'sos' => $sos,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    public function read(Request $request, Alert $alert)
    {
        $alert->readers()->syncWithoutDetaching([$request->user()->id]);

        return response()->json(['ok' => true]);
    }

    public function readAll(Request $request)
    {
        $uid = $request->user()->id;
        $ids = $this->visible($request)->whereDoesntHave('readers', fn ($q) => $q->where('users.id', $uid))->pluck('id');
        foreach ($ids as $id) {
            DB::table('alert_reads')->insertOrIgnore(['alert_id' => $id, 'user_id' => $uid]);
        }

        return response()->json(['ok' => true]);
    }
}
