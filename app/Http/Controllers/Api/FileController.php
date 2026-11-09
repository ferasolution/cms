<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Complaint;
use App\Models\ExpenseRequest;
use App\Models\Noc;
use App\Models\NocDocument;
use App\Models\RecordFile;
use App\Models\Transaction;
use App\Models\Visitor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** Serves private uploads after checking the viewer is allowed to see that particular file. */
class FileController extends Controller
{
    public function show(Request $request, string $path)
    {
        $u = $request->user();
        $path = ltrim(str_replace(['..', '\\'], '', $path), '/');
        $folder = explode('/', $path)[0];

        $allowed = match ($folder) {
            'visitors' => $u->canView('security') && Visitor::where('photo_path', $path)->orWhere('video_path', $path)->exists(),
            'ebooks' => $u->canView('library') && Book::where('ebook_path', $path)->exists(),
            'receipts' => ($u->canManage('finance') && (Transaction::where('receipt_path', $path)->exists() || ExpenseRequest::where('receipt_path', $path)->exists()))
                || ExpenseRequest::where('receipt_path', $path)->where('requested_by', $u->id)->exists(),
            'complaints' => ($c = Complaint::where('photo_path', $path)->first()) && ($u->canManage('complaints') || $c->user_id === $u->id),
            'noc' => ($n = NocDocument::where('path', $path)->first()?->noc ?? Noc::where('certificate_path', $path)->first())
                && ($u->canManage('noc') || $n->user_id === $u->id),
            'records' => ($r = RecordFile::where('path', $path)->first()) && ($u->canManage('records') || ($u->house_id && $r->house_id === $u->house_id)),
            default => false,
        };
        abort_unless($allowed, 403);
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, ['Cache-Control' => 'private, max-age=3600'],
            $request->boolean('download') ? 'attachment' : 'inline');
    }
}
