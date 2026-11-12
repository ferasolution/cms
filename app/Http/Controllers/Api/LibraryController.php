<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookIssue;
use App\Support\Activity;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LibraryController extends Controller
{
    private array $rules = [
        'title' => 'required|string|max:200',
        'author' => 'nullable|string|max:150',
        'isbn' => 'nullable|string|max:30',
        'category' => 'nullable|string|max:60',
        'shelf' => 'nullable|string|max:30',
        'copies' => 'required|integer|min:0|max:1000',
        'description' => 'nullable|string|max:2000',
        'ebook' => 'nullable|file|mimes:pdf,epub|max:51200',
    ];

    public function books(Request $request)
    {
        $this->authorizeView($request, 'library');
        $q = Book::orderBy('title');
        if ($c = $request->query('category')) {
            $q->where('category', $c);
        }
        if ($request->boolean('digital')) {
            $q->whereNotNull('ebook_path');
        }

        return $this->paginate($q, $request, ['title', 'author', 'isbn', 'category'], 24);
    }

    public function categories(Request $request)
    {
        $this->authorizeView($request, 'library');

        return Book::whereNotNull('category')->distinct()->orderBy('category')->pluck('category');
    }

    public function storeBook(Request $request)
    {
        $this->authorizeManage($request, 'library');
        $data = $request->validate($this->rules);
        $data['ebook_path'] = Uploads::store($request->file('ebook'), 'ebooks');
        unset($data['ebook']);
        $book = Book::create($data + ['available' => $data['copies']]);
        Activity::log('library', 'create', "Added book \"{$book->title}\" ({$book->copies} copies".($book->ebook_path ? ', e-book' : '').')', $book);

        return $book;
    }

    public function updateBook(Request $request, Book $book)
    {
        $this->authorizeManage($request, 'library');
        $data = $request->validate($this->rules);
        if ($request->hasFile('ebook')) {
            $data['ebook_path'] = Uploads::store($request->file('ebook'), 'ebooks');
        }
        unset($data['ebook']);
        $out = $book->copies - $book->available;
        $data['available'] = max(0, $data['copies'] - $out);
        $book->update($data);
        Activity::log('library', 'update', "Updated book \"{$book->title}\"", $book);

        return $book;
    }

    public function destroyBook(Request $request, Book $book)
    {
        $this->authorizeManage($request, 'library');
        Activity::log('library', 'delete', "Removed book \"{$book->title}\"");
        $book->delete();

        return response()->noContent();
    }

    public function issues(Request $request)
    {
        $this->authorizeView($request, 'library');
        $q = BookIssue::with(['book:id,title,author', 'user:id,name,house_id', 'user.house', 'issuer:id,name'])->latest('id');
        if (! $request->user()->canManage('library')) {
            $q->where('user_id', $request->user()->id);
        }
        if ($s = $request->query('status')) {
            $s === 'overdue' ? $q->where('status', 'issued')->whereDate('due_at', '<', now()) : $q->where('status', $s);
        }

        return $this->paginate($q, $request, [], 25);
    }

    /** Book issue request — any library user (residents and officials). */
    public function requestBook(Request $request, Book $book)
    {
        $this->authorizeView($request, 'library');
        $uid = $request->user()->id;
        abort_if(BookIssue::where('book_id', $book->id)->where('user_id', $uid)->whereIn('status', ['requested', 'issued'])->exists(), 422, 'You already have this book or a pending request for it.');
        $issue = BookIssue::create(['book_id' => $book->id, 'user_id' => $uid, 'status' => 'requested', 'note' => $request->input('note')]);
        Activity::log('library', 'request', "{$request->user()->name} requested \"{$book->title}\"", $issue);
        Activity::alertModule('library', 2, 'New book request', "{$request->user()->name} requested \"{$book->title}\"", 'info', '/library', $request->user()->house_id);

        return $issue->load('book');
    }

    /** Librarian issues a book — either approving a request or directly to a member. */
    public function issue(Request $request)
    {
        $this->authorizeManage($request, 'library');
        $data = $request->validate([
            'issue_id' => 'nullable|exists:book_issues,id',
            'book_id' => 'required_without:issue_id|exists:books,id',
            'user_id' => 'required_without:issue_id|exists:users,id',
            'days' => 'nullable|integer|min:1|max:90',
        ]);

        return DB::transaction(function () use ($data, $request) {
            $issue = isset($data['issue_id']) ? BookIssue::findOrFail($data['issue_id']) : new BookIssue(['book_id' => $data['book_id'], 'user_id' => $data['user_id']]);
            abort_if($issue->exists && $issue->status !== 'requested', 422, 'This request is already processed.');
            $book = Book::lockForUpdate()->findOrFail($issue->book_id);
            abort_if($book->available < 1, 422, 'No copies of this book are available right now.');
            $book->decrement('available');
            $issue->fill(['status' => 'issued', 'issued_at' => now(), 'due_at' => now()->addDays($data['days'] ?? 14), 'issued_by' => $request->user()->id])->save();
            $issue->load('book', 'user');
            Activity::log('library', 'issue', "Issued \"{$book->title}\" to {$issue->user->name} (due ".$issue->due_at->format('d M').')', $issue);
            Activity::alertUser($issue->user_id, 'library', 'Book issued: '.$book->title, 'Please return by '.$issue->due_at->format('d M Y'), 'success', '/library');

            return $issue;
        });
    }

    public function reject(Request $request, BookIssue $issue)
    {
        $this->authorizeManage($request, 'library');
        abort_if($issue->status !== 'requested', 422, 'Only pending requests can be rejected.');
        $issue->update(['status' => 'rejected', 'note' => $request->input('note')]);
        Activity::log('library', 'reject', "Rejected request for \"{$issue->book->title}\" by {$issue->user->name}", $issue);
        Activity::alertUser($issue->user_id, 'library', 'Book request declined', $issue->book->title.($issue->note ? ' — '.$issue->note : ''), 'warning', '/library');

        return $issue;
    }

    public function returnBook(Request $request, BookIssue $issue)
    {
        $this->authorizeManage($request, 'library');
        abort_if($issue->status !== 'issued', 422, 'This book is not currently issued.');
        $lateDays = $issue->due_at && now()->startOfDay()->greaterThan($issue->due_at) ? (int) $issue->due_at->diffInDays(now()->startOfDay()) : 0;
        $issue->update(['status' => 'returned', 'returned_at' => now(), 'fine' => $lateDays * (float) $request->input('fine_per_day', 20)]);
        $issue->book->increment('available');
        Activity::log('library', 'return', "{$issue->user->name} returned \"{$issue->book->title}\"".($lateDays ? " ({$lateDays} days late, fine ".\App\Support\Settings::money($issue->fine).")" : ''), $issue);

        return $issue->load('book', 'user');
    }
}
