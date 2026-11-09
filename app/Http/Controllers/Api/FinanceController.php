<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExpenseRequest;
use App\Models\House;
use App\Models\Transaction;
use App\Support\Activity;
use App\Support\Uploads;
use Illuminate\Http\Request;

class FinanceController extends Controller
{
    public const CATEGORIES = [
        'revenue' => ['maintenance', 'subscription', 'event', 'penalty', 'dues', 'fine', 'other'],
        'expense' => ['utilities', 'repair', 'security', 'cleaning', 'gardening', 'events', 'office', 'allowance', 'other'],
        'salary' => ['salary'],
    ];

    public function transactions(Request $request)
    {
        $this->authorizeManage($request, 'finance');
        $q = Transaction::with(['house', 'staff:id,name', 'recorder:id,name'])->latest('date')->latest('id');
        foreach (['type', 'category', 'house_id', 'period', 'status'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }
        if ($m = $request->query('month')) { // YYYY-MM
            $q->where('date', 'like', $m.'%');
        }

        return $this->paginate($q, $request, ['party', 'reference', 'description']);
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'finance');
        $data = $request->validate([
            'type' => 'required|in:revenue,expense,salary',
            'category' => 'required|string|max:40',
            'amount' => 'required|numeric|min:1',
            'house_id' => 'nullable|exists:houses,id',
            'staff_id' => 'nullable|exists:users,id',
            'party' => 'nullable|string|max:150',
            'reference' => 'nullable|string|max:60',
            'period' => 'nullable|string|max:7',
            'status' => 'nullable|in:paid,pending',
            'date' => 'required|date',
            'description' => 'nullable|string|max:1000',
            'receipt' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:10240',
        ]);
        $data['receipt_path'] = Uploads::store($request->file('receipt'), 'receipts');
        unset($data['receipt']);
        $t = Transaction::create($data + ['recorded_by' => $request->user()->id, 'status' => $data['status'] ?? 'paid']);
        $t->load('house', 'staff');
        $who = $t->house?->label ?? $t->staff?->name ?? $t->party;
        Activity::log('finance', $t->type, ucfirst($t->type).' Rs '.number_format($t->amount).' — '.$t->category.($who ? " ({$who})" : ''), $t);
        if ($t->type === 'revenue' && $t->house_id) {
            foreach ($t->house->residents as $r) {
                Activity::alertUser($r->id, 'finance', 'Payment received', 'Rs '.number_format($t->amount).' for '.$t->category.($t->period ? ' ('.$t->period.')' : ''), 'success');
            }
        }

        return $t;
    }

    public function destroy(Request $request, Transaction $transaction)
    {
        abort_unless($request->user()->canApprove('finance'), 403, 'You need Manage access on Finance to delete entries.');
        Activity::log('finance', 'delete', 'Deleted '.$transaction->type.' entry Rs '.number_format($transaction->amount));
        $transaction->delete();

        return response()->noContent();
    }

    public function summary(Request $request)
    {
        $this->authorizeManage($request, 'finance');
        $from = $request->query('from', now()->startOfMonth()->toDateString());
        $to = $request->query('to', now()->toDateString());
        $base = Transaction::whereBetween('date', [$from, $to]);

        return [
            'from' => $from, 'to' => $to,
            'revenue' => (float) (clone $base)->where('type', 'revenue')->sum('amount'),
            'expense' => (float) (clone $base)->where('type', 'expense')->sum('amount'),
            'salary' => (float) (clone $base)->where('type', 'salary')->sum('amount'),
            'by_category' => (clone $base)->selectRaw('type, category, sum(amount) total')->groupBy('type', 'category')->orderByDesc('total')->get(),
            'categories' => self::CATEGORIES,
        ];
    }

    /** Monthly maintenance: which houses have paid for a month and which are outstanding. */
    public function maintenance(Request $request)
    {
        $this->authorizeManage($request, 'finance');
        $period = $request->query('period', now()->format('Y-m'));
        $paid = Transaction::where('category', 'maintenance')->where('period', $period)->get()->keyBy('house_id');

        return House::orderBy('block')->orderBy('house_no')->get()->map(fn (House $h) => [
            'house' => $h,
            'due' => (float) $h->monthly_maintenance,
            'paid' => isset($paid[$h->id]) ? (float) $paid[$h->id]->amount : 0,
            'paid_on' => isset($paid[$h->id]) ? $paid[$h->id]->date->toDateString() : null,
        ]);
    }

    /** Salaries: staff list with this month's payment status. */
    public function salaries(Request $request)
    {
        $this->authorizeManage($request, 'finance');
        $period = $request->query('period', now()->format('Y-m'));
        $paid = Transaction::where('type', 'salary')->where('period', $period)->get()->keyBy('staff_id');

        return \App\Models\User::where('role', '!=', 'user')->orderBy('name')->get(['id', 'name', 'role'])->map(fn ($s) => [
            'staff' => $s,
            'paid' => isset($paid[$s->id]) ? (float) $paid[$s->id]->amount : 0,
            'paid_on' => isset($paid[$s->id]) ? $paid[$s->id]->date->toDateString() : null,
            'last_amount' => (float) Transaction::where('type', 'salary')->where('staff_id', $s->id)->latest('date')->value('amount'),
        ]);
    }

    // ---- Expense request portal (staff request, Admin approves, finance pays) ----

    /** A household's own billing: monthly maintenance status for the last 12 months and all payments. */
    public function my(Request $request)
    {
        $u = $request->user();
        abort_unless($u->house_id, 404, 'Your account is not linked to a house.');
        $house = House::findOrFail($u->house_id);
        $paid = Transaction::where('house_id', $house->id)->where('category', 'maintenance')->get()->keyBy('period');
        $months = collect(range(0, 11))->map(function ($i) use ($paid, $house) {
            $p = now()->startOfMonth()->subMonths($i)->format('Y-m');

            return ['period' => $p, 'due' => (float) $house->monthly_maintenance, 'paid' => isset($paid[$p]) ? (float) $paid[$p]->amount : 0, 'paid_on' => isset($paid[$p]) ? $paid[$p]->date->toDateString() : null];
        });

        return [
            'house' => $house,
            'months' => $months,
            'outstanding' => $months->where('paid', 0)->sum('due'),
            'payments' => Transaction::where('house_id', $house->id)->where('type', 'revenue')->latest('date')->limit(50)->get(),
            'pay_to' => array_intersect_key(\App\Support\Settings::all(), array_flip(['payment_title', 'payment_bank', 'payment_account', 'payment_iban', 'payment_wallet'])),
        ];
    }

    public function expenseRequests(Request $request)
    {
        abort_if($request->user()->isResident(), 403);
        $q = ExpenseRequest::with(['requester:id,name,role', 'reviewer:id,name'])->latest('id');
        if (! $request->user()->canManage('finance')) {
            $q->where('requested_by', $request->user()->id);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, ['title', 'purpose']);
    }

    public function storeExpenseRequest(Request $request)
    {
        abort_if($request->user()->isResident(), 403, 'Expense requests are for staff.');
        $data = $request->validate([
            'title' => 'required|string|max:150',
            'amount' => 'required|numeric|min:1',
            'category' => 'required|string|max:40',
            'purpose' => 'nullable|string|max:2000',
            'receipt' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:10240',
        ]);
        $data['receipt_path'] = Uploads::store($request->file('receipt'), 'receipts');
        unset($data['receipt']);
        $er = ExpenseRequest::create($data + ['requested_by' => $request->user()->id]);
        Activity::log('finance', 'request', "{$request->user()->name} requested Rs ".number_format($er->amount)." — {$er->title}", $er);
        Activity::alertAdmins('finance', 'Expense approval needed', "{$er->title} · Rs ".number_format($er->amount)." by {$request->user()->name}", 'warning', '/finance');

        return $er;
    }

    public function reviewExpenseRequest(Request $request, ExpenseRequest $expenseRequest)
    {
        abort_unless($request->user()->isAdmin(), 403, 'Only an Admin can approve expense requests.');
        $data = $request->validate(['status' => 'required|in:approved,rejected', 'review_note' => 'nullable|string|max:1000']);
        abort_if($expenseRequest->status !== 'pending', 422, 'Already reviewed.');
        $expenseRequest->update($data + ['reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
        Activity::log('finance', $data['status'], ucfirst($data['status'])." expense request \"{$expenseRequest->title}\" (Rs ".number_format($expenseRequest->amount).')', $expenseRequest);
        Activity::alertUser($expenseRequest->requested_by, 'finance', 'Expense request '.$data['status'], $expenseRequest->title, $data['status'] === 'approved' ? 'success' : 'danger', '/finance');
        if ($data['status'] === 'approved') {
            Activity::alertModule('finance', 2, 'Approved expense to pay', $expenseRequest->title.' · Rs '.number_format($expenseRequest->amount), 'info', '/finance');
        }

        return $expenseRequest->load('requester', 'reviewer');
    }

    /** Finance releases an approved request — creates the expense entry (allowance receipt). */
    public function payExpenseRequest(Request $request, ExpenseRequest $expenseRequest)
    {
        $this->authorizeManage($request, 'finance');
        abort_if($expenseRequest->status !== 'approved', 422, 'Only approved requests can be paid.');
        $expenseRequest->update(['status' => 'paid']);
        Transaction::create([
            'type' => 'expense', 'category' => $expenseRequest->category, 'amount' => $expenseRequest->amount,
            'party' => $expenseRequest->requester->name, 'reference' => 'EXR-'.$expenseRequest->id, 'date' => now()->toDateString(),
            'description' => $expenseRequest->title, 'receipt_path' => $expenseRequest->receipt_path, 'recorded_by' => $request->user()->id,
        ]);
        Activity::log('finance', 'paid', "Paid expense request \"{$expenseRequest->title}\" Rs ".number_format($expenseRequest->amount), $expenseRequest);
        Activity::alertUser($expenseRequest->requested_by, 'finance', 'Expense paid', $expenseRequest->title.' · Rs '.number_format($expenseRequest->amount), 'success');

        return $expenseRequest->load('requester', 'reviewer');
    }
}
