<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RecordFile;
use App\Support\Activity;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** Record room: every household's files in e-format. Owners see only their own house's files. */
class RecordController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeView($request, 'records');
        $u = $request->user();
        $q = RecordFile::with(['house', 'uploader:id,name'])->latest('id');
        if ($u->isResident()) {
            $q->where('house_id', $u->house_id ?? 0);
        } elseif ($h = $request->query('house_id')) {
            $q->where('house_id', $h);
        }
        if ($c = $request->query('category')) {
            $q->where('category', $c);
        }

        return $this->paginate($q, $request, ['title', 'original_name']);
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'records');
        $data = $request->validate([
            'house_id' => 'required|exists:houses,id',
            'title' => 'required|string|max:200',
            'category' => 'required|in:ownership,allotment,transfer,map,utility,legal,noc,general',
            'files' => 'required|array|max:20',
            'files.*' => 'file|max:51200',
        ]);
        $saved = [];
        foreach ($request->file('files') as $i => $file) {
            $saved[] = RecordFile::create([
                'house_id' => $data['house_id'],
                'title' => count($request->file('files')) > 1 ? $data['title'].' ('.($i + 1).')' : $data['title'],
                'category' => $data['category'],
                'path' => Uploads::store($file, 'records/'.$data['house_id']),
                'original_name' => $file->getClientOriginalName(),
                'size' => $file->getSize(),
                'uploaded_by' => $request->user()->id,
            ]);
        }
        $house = $saved[0]->house;
        Activity::log('records', 'upload', count($saved)." file(s) uploaded to {$house->label} — {$data['title']}", $saved[0]);
        foreach ($house->residents as $r) {
            Activity::alertUser($r->id, 'records', 'New file in your record', $data['title'], 'info', '/records');
        }

        return $saved;
    }

    public function destroy(Request $request, RecordFile $record)
    {
        abort_unless($request->user()->canApprove('records'), 403, 'You need Manage access on Record Room to delete files.');
        Storage::disk('local')->delete($record->path);
        Activity::log('records', 'delete', "Deleted file \"{$record->title}\" from {$record->house->label}");
        $record->delete();

        return response()->noContent();
    }
}
