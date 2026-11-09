<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\SosAlert;
use App\Support\Activity;
use App\Support\Settings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Announcements / notice board and the SOS emergency system. */
class CommsController extends Controller
{
    private function audienceFor($u): array
    {
        $a = ['all', $u->isResident() ? 'residents' : 'staff'];
        if ($u->house?->block) {
            $a[] = 'block:'.$u->house->block;
        }

        return $a;
    }

    public function announcements(Request $request)
    {
        $this->authorizeView($request, 'announcements');
        $u = $request->user();
        $q = Announcement::with('author:id,name')
            ->withCount('readers')
            ->addSelect(['is_read' => DB::table('announcement_reads')->selectRaw('count(*)')->whereColumn('announcement_id', 'announcements.id')->where('user_id', $u->id)])
            ->orderByDesc('pinned')->latest('id');
        if (! $u->canManage('announcements')) {
            $q->whereIn('audience', $this->audienceFor($u))->where(fn ($w) => $w->whereNull('expires_at')->orWhere('expires_at', '>', now()));
        }
        if ($c = $request->query('category')) {
            $q->where('category', $c);
        }

        return $this->paginate($q, $request, ['title', 'body'], 20);
    }

    public function storeAnnouncement(Request $request)
    {
        $this->authorizeManage($request, 'announcements');
        $data = $request->validate(['title' => 'required|string|max:200', 'body' => 'required|string|max:10000',
            'category' => 'required|in:general,maintenance,utility,event,security,emergency', 'priority' => 'required|in:normal,important,emergency',
            'audience' => 'required|string|max:30', 'pinned' => 'boolean', 'expires_at' => 'nullable|date']);
        $a = Announcement::create($data + ['created_by' => $request->user()->id]);
        Activity::log('announcements', 'create', "Announcement: {$a->title} → ".$a->audience, $a);
        $level = ['normal' => 'info', 'important' => 'warning', 'emergency' => 'danger'][$a->priority];
        // Deliver as a live alert to everyone in the audience.
        $users = \App\Models\User::where('active', true)->with('house:id,block')->get(['id', 'role', 'house_id']);
        foreach ($users as $user) {
            if (in_array($a->audience, $this->audienceFor($user), true)) {
                Activity::alertUser($user->id, 'announcements', '📢 '.$a->title, mb_strimwidth($a->body, 0, 140, '…'), $level, '/announcements');
            }
        }

        return $a;
    }

    public function updateAnnouncement(Request $request, Announcement $announcement)
    {
        $this->authorizeManage($request, 'announcements');
        $announcement->update($request->validate(['title' => 'required|string|max:200', 'body' => 'required|string|max:10000',
            'category' => 'required|string', 'priority' => 'required|in:normal,important,emergency', 'audience' => 'required|string|max:30', 'pinned' => 'boolean', 'expires_at' => 'nullable|date']));
        Activity::log('announcements', 'update', "Updated announcement: {$announcement->title}", $announcement);

        return $announcement;
    }

    public function readAnnouncement(Request $request, Announcement $announcement)
    {
        DB::table('announcement_reads')->insertOrIgnore(['announcement_id' => $announcement->id, 'user_id' => $request->user()->id, 'read_at' => now()]);

        return ['ok' => true];
    }

    public function destroyAnnouncement(Request $request, Announcement $announcement)
    {
        abort_unless($request->user()->canApprove('announcements'), 403);
        Activity::log('announcements', 'delete', "Deleted announcement: {$announcement->title}");
        $announcement->delete();

        return response()->noContent();
    }

    // ---------- SOS ----------

    /** Anyone signed in can raise an SOS. Responders get a danger alert with the house location. */
    public function sos(Request $request)
    {
        $u = $request->user();
        $data = $request->validate(['type' => 'required|in:medical,fire,security,other', 'message' => 'nullable|string|max:255', 'lat' => 'nullable|numeric', 'lng' => 'nullable|numeric']);
        abort_if(SosAlert::where('user_id', $u->id)->where('status', 'active')->where('created_at', '>', now()->subMinutes(2))->exists(), 429, 'Your SOS is already active — help has been notified.');
        $sos = SosAlert::create($data + ['user_id' => $u->id, 'house_id' => $u->house_id]);
        $sos->load('house');
        $where = $sos->house ? 'House '.$sos->house->label.($sos->house->street ? ', '.$sos->house->street : '') : 'Location not linked';
        $title = '🆘 SOS '.strtoupper($sos->type).' — '.$u->name;
        $body = $where.' · '.($u->phone ?: 'no phone').($sos->message ? ' · '.$sos->message : '');
        Activity::alertModule('emergency', 2, $title, $body, 'danger', '/emergency');
        Activity::alertModule('security', 2, $title, $body, 'danger', '/emergency');
        Activity::alertAdmins('emergency', $title, $body, 'danger', '/emergency');
        Activity::log('emergency', 'sos', "SOS ({$sos->type}) raised by {$u->name} — {$where}", $sos);

        return $sos->load('user:id,name,phone');
    }

    public function sosList(Request $request)
    {
        $u = $request->user();
        $q = SosAlert::with(['house', 'user:id,name,phone', 'responder:id,name'])->latest('id');
        if ($u->isResident() || ! $u->canView('emergency')) {
            $q->where('user_id', $u->id);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, ['message'], 30)->toArray() + ['contacts' => array_values(array_filter(array_map('trim', explode("\n", (string) Settings::get('emergency_contacts')))))];
    }

    public function sosUpdate(Request $request, SosAlert $sos)
    {
        $u = $request->user();
        $own = $sos->user_id === $u->id;
        abort_unless($u->canManage('emergency') || $u->canManage('security') || $own, 403);
        $data = $request->validate(['status' => 'required|in:responding,resolved', 'resolution' => 'nullable|string|max:2000']);
        if ($own && ! $u->canManage('emergency') && $data['status'] !== 'resolved') {
            abort(403);
        }
        $patch = ['status' => $data['status']];
        if ($data['status'] === 'responding') {
            $patch += ['responder_id' => $u->id, 'responded_at' => now()];
        } else {
            $patch += ['resolved_at' => now(), 'resolution' => $data['resolution'] ?? ($own ? 'Cancelled by caller' : null)];
        }
        $sos->update($patch);
        Activity::log('emergency', $data['status'], 'SOS #'.$sos->id.' '.$data['status'].' by '.$u->name, $sos);
        if (! $own) {
            Activity::alertUser($sos->user_id, 'emergency', $data['status'] === 'responding' ? '🚑 Help is on the way' : 'SOS resolved', $data['status'] === 'responding' ? $u->name.' is responding to your SOS.' : ($sos->resolution ?? ''), 'success', '/emergency');
        }

        return $sos->load('house', 'user:id,name,phone', 'responder:id,name');
    }
}
