<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Services\EventWatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Live alerts. The portal polls this every few seconds; each poll also runs the event watcher,
 * so time-based alerts (event last hour / time over) fire without needing a cron job on shared hosting.
 */
class AlertController extends Controller
{
    private function visible(Request $request)
    {
        $user = $request->user();

        return Alert::query()
            ->where(function ($q) use ($user) {
                $q->where('user_id', $user->id)->orWhere('role', $user->role);
                if ($user->isAdmin()) {
                    $q->orWhereNotNull('role'); // ADH sees every broadcast
                }
            })
            ->where('created_at', '>=', $user->created_at?->copy()->subDay() ?? now()->subYear());
    }

    public function index(Request $request)
    {
        EventWatcher::check();
        $uid = $request->user()->id;
        $since = (int) $request->query('since', 0);

        $alerts = $this->visible($request)
            ->select('alerts.*', DB::raw("(select count(*) from alert_reads where alert_reads.alert_id = alerts.id and alert_reads.user_id = {$uid}) as is_read"))
            ->latest('id')->limit(30)->get();

        return response()->json([
            'alerts' => $alerts,
            'unread' => $this->visible($request)->whereDoesntHave('readers', fn ($q) => $q->where('users.id', $uid))->count(),
            'new' => $since ? $alerts->where('id', '>', $since)->values() : [],
            'latest_id' => $alerts->max('id') ?? $since,
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
