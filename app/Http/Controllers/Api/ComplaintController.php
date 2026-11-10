<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Support\Activity;
use App\Support\Uploads;
use Illuminate\Http\Request;

class ComplaintController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeView($request, 'complaints');
        $q = Complaint::with(['house', 'user:id,name,phone', 'assigner:id,name'])
            ->orderByRaw("case status when 'open' then 0 when 'assigned' then 1 when 'in_progress' then 2 else 3 end")
            ->orderByRaw("case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end")
            ->latest('id');
        if ($request->user()->isResident()) {
            $q->where('user_id', $request->user()->id);
        }
        foreach (['status', 'category', 'priority'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }

        return $this->paginate($q, $request, ['title', 'ticket_no', 'assigned_worker']);
    }

    public function store(Request $request)
    {
        $this->authorizeView($request, 'complaints');
        $data = $request->validate([
            'category' => 'required|in:plumbing,electrical,cleaning,security,gardening,construction,noise,parking,other',
            'title' => 'required|string|max:150',
            'description' => 'nullable|string|max:3000',
            'priority' => 'nullable|in:low,normal,high,urgent',
            'house_id' => 'nullable|exists:houses,id',
            'photo' => 'nullable|image|max:8192',
        ]);
        $u = $request->user();
        $data['photo_path'] = Uploads::store($request->file('photo'), 'complaints');
        unset($data['photo']);
        if ($u->isResident()) {
            $data['house_id'] = $u->house_id;
        }
        $c = Complaint::create($data + ['user_id' => $u->id, 'priority' => $data['priority'] ?? 'normal', 'status' => 'open']);
        $c->update(['ticket_no' => 'CMP-'.str_pad((string) $c->id, 5, '0', STR_PAD_LEFT)]);
        Activity::log('complaints', 'create', "New complaint {$c->ticket_no}: {$c->title}", $c);
        \App\Services\Automations::onComplaintCreated($c);
        Activity::alertModule('complaints', 3, ($c->priority === 'urgent' ? '🚨 Urgent complaint: ' : 'New complaint: ').$c->title, $c->ticket_no.' · '.ucfirst($c->category), $c->priority === 'urgent' ? 'danger' : 'info', '/complaints', $c->house_id);

        return $c->load('house');
    }

    /** Manager aligns a worker / labour to the complaint. */
    public function assign(Request $request, Complaint $complaint)
    {
        $this->authorizeManage($request, 'complaints');
        $data = $request->validate(['assigned_worker' => 'required|string|max:120', 'worker_phone' => 'nullable|string|max:30', 'priority' => 'nullable|in:low,normal,high,urgent']);
        $complaint->update($data + ['assigned_by' => $request->user()->id, 'assigned_at' => now(), 'status' => 'assigned']);
        Activity::log('complaints', 'assign', "Assigned {$complaint->ticket_no} to {$complaint->assigned_worker}", $complaint);
        Activity::alertUser($complaint->user_id, 'complaints', 'Worker assigned: '.$complaint->ticket_no, $complaint->assigned_worker.' will attend to "'.$complaint->title.'"', 'info', '/complaints');

        return $complaint->load('house', 'user', 'assigner');
    }

    public function setStatus(Request $request, Complaint $complaint)
    {
        $this->authorizeManage($request, 'complaints');
        $data = $request->validate(['status' => 'required|in:open,assigned,in_progress,resolved,closed', 'resolution' => 'required_if:status,resolved|nullable|string|max:3000']);
        if ($data['status'] === 'resolved') {
            $data['resolved_at'] = now();
        }
        $complaint->update($data);
        Activity::log('complaints', $data['status'], "{$complaint->ticket_no} marked ".str_replace('_', ' ', $data['status']), $complaint);
        Activity::alertUser($complaint->user_id, 'complaints', $complaint->ticket_no.' '.str_replace('_', ' ', $data['status']), $complaint->resolution ?: $complaint->title, $data['status'] === 'resolved' ? 'success' : 'info', '/complaints');

        return $complaint->load('house', 'user', 'assigner');
    }

    public function rate(Request $request, Complaint $complaint)
    {
        abort_unless($complaint->user_id === $request->user()->id, 403);
        $data = $request->validate(['rating' => 'required|integer|min:1|max:5']);
        $complaint->update($data + ['status' => 'closed']);
        Activity::log('complaints', 'rate', "{$complaint->ticket_no} rated {$data['rating']}/5 by resident", $complaint);

        return $complaint;
    }

    /** Resolution report: per-category counts, average resolution time. */
    public function report(Request $request)
    {
        $this->authorizeManage($request, 'complaints');
        $from = $request->query('from', now()->subDays(30)->toDateString());
        $rows = Complaint::whereDate('created_at', '>=', $from)->get();
        $resolved = $rows->whereNotNull('resolved_at');

        return [
            'from' => $from,
            'total' => $rows->count(),
            'resolved' => $resolved->count(),
            'pending' => $rows->whereIn('status', ['open', 'assigned', 'in_progress'])->count(),
            'avg_hours' => $resolved->count() ? round($resolved->avg(fn ($c) => $c->created_at->diffInMinutes($c->resolved_at)) / 60, 1) : null,
            'avg_rating' => $rows->whereNotNull('rating')->avg('rating'),
            'by_category' => $rows->groupBy('category')->map(fn ($g, $k) => ['category' => $k, 'total' => $g->count(), 'resolved' => $g->whereNotNull('resolved_at')->count()])->values(),
        ];
    }
}
