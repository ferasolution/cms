<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Visitor;
use App\Support\Activity;
use App\Support\Uploads;
use Illuminate\Http\Request;

class VisitorController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeView($request, 'security');
        $q = Visitor::with(['house', 'logger:id,name'])->latest('entry_at');
        match ($request->query('status')) {
            'inside' => $q->whereNull('exit_at'),
            'exited' => $q->whereNotNull('exit_at'),
            default => null,
        };
        if ($c = $request->query('category')) {
            $q->where('category', $c);
        }
        if ($h = $request->query('house_id')) {
            $q->where('house_id', $h);
        }

        return $this->paginate($q, $request, ['name', 'cnic', 'phone', 'vehicle_no', 'purpose']);
    }

    private function rules(): array
    {
        return [
            'house_id' => 'nullable|exists:houses,id',
            'name' => 'required|string|max:120',
            'cnic' => 'nullable|string|max:20',
            'phone' => 'nullable|string|max:30',
            'category' => 'required|in:visitor,guest,worker,relative,friend,delivery,other',
            'purpose' => 'required|string|max:255',
            'vehicle_no' => 'nullable|string|max:30',
            'persons' => 'nullable|integer|min:1|max:500',
            'gate' => 'nullable|string|max:50',
            'remarks' => 'nullable|string|max:1000',
            'photo' => 'nullable|image|max:5120',
            'video' => 'nullable|file|mimetypes:video/mp4,video/webm,video/quicktime,video/3gpp|max:51200',
        ];
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate($this->rules());
        $data['photo_path'] = Uploads::store($request->file('photo'), 'visitors');
        $data['video_path'] = Uploads::store($request->file('video'), 'visitors');
        unset($data['photo'], $data['video']);
        $visitor = Visitor::create($data + ['entry_at' => now(), 'logged_by' => $request->user()->id, 'persons' => $data['persons'] ?? 1]);
        $visitor->load('house');
        $where = $visitor->house ? ' for '.$visitor->house->label : '';
        Activity::log('security', 'entry', ucfirst($visitor->category)." {$visitor->name} entered{$where} — {$visitor->purpose}", $visitor);
        // Let the household know someone has arrived for them
        foreach ($visitor->house?->residents ?? [] as $resident) {
            Activity::alertUser($resident->id, 'security', 'Visitor at gate: '.$visitor->name, ucfirst($visitor->category).' · '.$visitor->purpose, 'info');
        }

        return $visitor;
    }

    public function update(Request $request, Visitor $visitor)
    {
        $this->authorizeManage($request, 'security');
        $data = $request->validate($this->rules());
        if ($request->hasFile('photo')) {
            $data['photo_path'] = Uploads::store($request->file('photo'), 'visitors');
        }
        if ($request->hasFile('video')) {
            $data['video_path'] = Uploads::store($request->file('video'), 'visitors');
        }
        unset($data['photo'], $data['video']);
        $visitor->update($data);
        Activity::log('security', 'update', "Updated visitor record of {$visitor->name}", $visitor);

        return $visitor->load('house');
    }

    public function checkout(Request $request, Visitor $visitor)
    {
        $this->authorizeManage($request, 'security');
        abort_if($visitor->exit_at, 422, 'Visitor has already exited.');
        $visitor->update(['exit_at' => now()]);
        $mins = $visitor->entry_at->diffInMinutes($visitor->exit_at);
        Activity::log('security', 'exit', "{$visitor->name} exited after ".intdiv((int) $mins, 60).'h '.((int) $mins % 60).'m', $visitor);

        return $visitor->load('house');
    }

    public function destroy(Request $request, Visitor $visitor)
    {
        abort_unless($request->user()->isAdmin(), 403, 'Only ADH can delete visitor records.');
        Activity::log('security', 'delete', "Deleted visitor record of {$visitor->name}");
        $visitor->delete();

        return response()->noContent();
    }

    public function stats(Request $request)
    {
        $this->authorizeView($request, 'security');
        $today = now()->toDateString();

        return [
            'inside' => Visitor::whereNull('exit_at')->count(),
            'today' => Visitor::whereDate('entry_at', $today)->count(),
            'by_category' => Visitor::whereDate('entry_at', '>=', now()->subDays(30))->selectRaw('category, count(*) c')->groupBy('category')->pluck('c', 'category'),
            'avg_stay_minutes' => (int) round(Visitor::whereNotNull('exit_at')->where('entry_at', '>=', now()->subDays(30))->get()->avg(fn ($v) => $v->entry_at->diffInMinutes($v->exit_at)) ?? 0),
        ];
    }
}
