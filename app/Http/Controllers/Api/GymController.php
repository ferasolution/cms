<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GymCheckin;
use App\Models\GymMember;
use App\Models\GymPayment;
use App\Models\GymPlan;
use App\Models\Transaction;
use App\Support\Activity;
use App\Support\Settings;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Gym & community club: plans, members, RFID / QR check-in with live validity checks,
 * subscription payments (members pay by scanning the payment QR, staff confirm) and dues alerts.
 */
class GymController extends Controller
{
    public function plans(Request $request)
    {
        $this->authorizeView($request, 'gym');

        return GymPlan::withCount(['members' => fn ($q) => $q->where('status', 'active')])->orderBy('price')->get();
    }

    public function savePlan(Request $request, ?GymPlan $plan = null)
    {
        $this->authorizeManage($request, 'gym');
        $data = $request->validate(['name' => 'required|string|max:80', 'type' => 'required|in:individual,family,trial,guest', 'duration_days' => 'required|integer|min:1|max:730',
            'price' => 'required|numeric|min:0', 'facilities' => 'nullable|string|max:200', 'active' => 'boolean']);
        $plan = $plan?->exists ? tap($plan)->update($data) : GymPlan::create($data);
        Activity::log('gym', 'plan', "Saved plan {$plan->name} (Rs ".number_format($plan->price).')', $plan);

        return $plan;
    }

    /** Status a scanner / screen should show for a member. */
    public static function state(GymMember $m): array
    {
        $today = now()->startOfDay();
        $pending = $m->relationLoaded('payments') ? $m->payments->where('status', 'pending')->count() : $m->payments()->where('status', 'pending')->count();
        $daysLeft = (int) $today->diffInDays($m->end_date, false);
        [$ok, $reason] = match (true) {
            $m->card_blocked => [false, 'Card blocked'],
            $m->status === 'frozen' => [false, 'Membership frozen'],
            $m->status === 'cancelled' => [false, 'Membership cancelled'],
            $m->end_date->lt($today) => [false, 'Subscription expired on '.$m->end_date->format('d M Y').' — payment overdue'],
            default => [true, $daysLeft <= 3 ? "Valid · renew within {$daysLeft} day(s)" : 'Valid until '.$m->end_date->format('d M Y')],
        };

        return ['allowed' => $ok, 'reason' => $reason, 'days_left' => $daysLeft, 'pending_payments' => $pending];
    }

    public function members(Request $request)
    {
        $this->authorizeView($request, 'gym');
        $u = $request->user();
        $q = GymMember::with(['plan', 'house'])->orderBy('name');
        if (! $u->canManage('gym')) {
            $q->where(fn ($w) => $w->where('user_id', $u->id)->orWhere(fn ($x) => $x->whereNotNull('house_id')->where('house_id', $u->house_id ?? 0)));
        }
        match ($request->query('status')) {
            'active' => $q->where('status', 'active')->whereDate('end_date', '>=', now()),
            'due' => $q->where('status', 'active')->whereDate('end_date', '<=', now()->addDays((int) Settings::get('gym_due_reminder_days'))),
            'expired' => $q->whereDate('end_date', '<', now()),
            'frozen' => $q->where('status', 'frozen'),
            default => null,
        };
        $page = $this->paginate($q, $request, ['name', 'member_no', 'phone', 'rfid_card'], 40);
        $page->getCollection()->transform(fn ($m) => $m->setAttribute('state', self::state($m)));

        return $page;
    }

    public function storeMember(Request $request)
    {
        $this->authorizeManage($request, 'gym');
        $data = $request->validate(['name' => 'required|string|max:120', 'phone' => 'nullable|string|max:30', 'gym_plan_id' => 'required|exists:gym_plans,id',
            'user_id' => 'nullable|exists:users,id', 'house_id' => 'nullable|exists:houses,id', 'rfid_card' => 'nullable|string|max:40|unique:gym_members,rfid_card',
            'start_date' => 'required|date', 'paid' => 'boolean']);
        $plan = GymPlan::find($data['gym_plan_id']);
        $member = GymMember::create([
            'member_no' => 'GYM-'.str_pad((string) ((int) GymMember::max('id') + 1), 4, '0', STR_PAD_LEFT),
            'end_date' => \Illuminate\Support\Carbon::parse($data['start_date'])->addDays($plan->duration_days - 1),
        ] + collect($data)->except('paid')->all());
        if ($data['paid'] ?? false) {
            $this->recordPaid($member, (float) $plan->price, $plan->duration_days, 'cash', $request->user()->id, false);
        }
        Activity::log('gym', 'member', "New member {$member->name} ({$member->member_no}) on {$plan->name}", $member);
        Activity::alertUser($member->user_id, 'gym', 'Welcome to the club!', "Membership {$member->member_no} · valid till ".$member->end_date->format('d M Y'), 'success', '/gym');

        return $member->load('plan');
    }

    public function updateMember(Request $request, GymMember $member)
    {
        $this->authorizeManage($request, 'gym');
        $data = $request->validate(['name' => 'required|string|max:120', 'phone' => 'nullable|string|max:30', 'gym_plan_id' => 'required|exists:gym_plans,id',
            'user_id' => 'nullable|exists:users,id', 'house_id' => 'nullable|exists:houses,id', 'rfid_card' => 'nullable|string|max:40|unique:gym_members,rfid_card,'.$member->id,
            'status' => 'required|in:active,frozen,cancelled', 'card_blocked' => 'boolean', 'end_date' => 'required|date']);
        $member->update($data);
        Activity::log('gym', 'member', "Updated member {$member->name}".($member->card_blocked ? ' (card blocked)' : ''), $member);

        return $member->load('plan');
    }

    /** RFID / QR scan at the gym door: active? paid? card blocked? allowed? — logged every time. */
    public function scan(Request $request)
    {
        $this->authorizeManage($request, 'gym');
        $card = trim((string) $request->validate(['card' => 'required|string|max:60'])['card']);
        $member = GymMember::with('plan')->where('rfid_card', $card)->orWhere('member_no', strtoupper($card))->first();
        if (! $member) {
            GymCheckin::create(['card' => $card, 'method' => 'rfid', 'allowed' => false, 'reason' => 'Unknown card']);
            Activity::log('gym', 'denied', "Unknown card {$card} at gym door");

            return ['allowed' => false, 'reason' => 'Unknown card — not registered', 'member' => null];
        }
        $st = self::state($member);
        GymCheckin::create(['gym_member_id' => $member->id, 'card' => $card, 'method' => $request->input('method', 'rfid'), 'allowed' => $st['allowed'], 'reason' => $st['reason']]);
        Activity::log('gym', $st['allowed'] ? 'checkin' : 'denied', "{$member->name} ".($st['allowed'] ? 'checked in' : 'DENIED — '.$st['reason']), $member);

        return $st + ['member' => $member];
    }

    public function checkins(Request $request)
    {
        $this->authorizeManage($request, 'gym');

        return [
            'today' => GymCheckin::whereDate('created_at', now()->toDateString())->where('allowed', true)->count(),
            'inside_estimate' => GymCheckin::where('created_at', '>=', now()->subMinutes(90))->where('allowed', true)->distinct('gym_member_id')->count('gym_member_id'),
            'recent' => GymCheckin::with('member:id,name,member_no')->latest('id')->limit(30)->get(),
        ];
    }

    // ---------- Payments ----------

    /** Member (or staff) creates a payment: returns the reference + data for the payment QR code. */
    public function createPayment(Request $request, GymMember $member)
    {
        $u = $request->user();
        abort_unless($u->canManage('gym') || $member->user_id === $u->id || ($member->house_id && $member->house_id === $u->house_id), 403);
        $plan = $member->plan;
        $data = $request->validate(['proof' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:8192', 'method' => 'nullable|in:qr,bank,cash,online']);
        $p = GymPayment::create([
            'gym_member_id' => $member->id, 'amount' => $plan?->price ?? 0, 'days' => $plan?->duration_days ?? 30,
            'reference' => 'GP-'.strtoupper(Str::random(8)), 'method' => $data['method'] ?? 'qr', 'status' => 'pending',
            'proof_path' => Uploads::store($request->file('proof'), 'gym'),
        ]);
        Activity::log('gym', 'payment', "{$member->name} started payment {$p->reference} (Rs ".number_format($p->amount).')', $p);
        if ($p->proof_path) {
            Activity::alertModule('gym', 2, 'Payment proof received', "{$member->name} · Rs ".number_format($p->amount)." · {$p->reference}", 'info', '/gym?tab=payments');
        }

        return $p->toArray() + ['qr' => $this->qrPayload($p, $member)];
    }

    private function qrPayload(GymPayment $p, GymMember $m): array
    {
        $s = Settings::all();
        $text = implode("\n", array_filter([
            'PAY TO: '.$s['payment_title'], $s['payment_bank'] ? 'BANK: '.$s['payment_bank'] : null, $s['payment_account'] ? 'ACCOUNT: '.$s['payment_account'] : null,
            $s['payment_iban'] ? 'IBAN: '.$s['payment_iban'] : null, $s['payment_wallet'] ? 'WALLET: '.$s['payment_wallet'] : null,
            'AMOUNT: PKR '.number_format((float) $p->amount, 0, '.', ''), 'REFERENCE: '.$p->reference, 'MEMBER: '.$m->member_no.' '.$m->name,
        ]));

        return ['text' => $text, 'account' => array_intersect_key($s, array_flip(['payment_title', 'payment_bank', 'payment_account', 'payment_iban', 'payment_wallet']))];
    }

    public function uploadProof(Request $request, GymPayment $payment)
    {
        $u = $request->user();
        $m = $payment->member;
        abort_unless($u->canManage('gym') || $m->user_id === $u->id || ($m->house_id && $m->house_id === $u->house_id), 403);
        $request->validate(['proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:8192']);
        $payment->update(['proof_path' => Uploads::store($request->file('proof'), 'gym')]);
        Activity::alertModule('gym', 2, 'Payment proof received', "{$m->name} · Rs ".number_format($payment->amount)." · {$payment->reference}", 'info', '/gym?tab=payments');
        Activity::log('gym', 'payment', "Proof uploaded for {$payment->reference}", $payment);

        return $payment;
    }

    public function payments(Request $request)
    {
        $this->authorizeView($request, 'gym');
        $u = $request->user();
        $q = GymPayment::with(['member:id,name,member_no,user_id,house_id', 'confirmer:id,name'])->latest('id');
        if (! $u->canManage('gym')) {
            $q->whereHas('member', fn ($w) => $w->where('user_id', $u->id)->orWhere(fn ($x) => $x->whereNotNull('house_id')->where('house_id', $u->house_id ?? 0)));
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, ['reference'], 30);
    }

    private function recordPaid(GymMember $m, float $amount, int $days, string $method, int $by, bool $extend = true): GymPayment
    {
        $p = GymPayment::create(['gym_member_id' => $m->id, 'amount' => $amount, 'days' => $days, 'reference' => 'GP-'.strtoupper(Str::random(8)), 'method' => $method, 'status' => 'paid', 'paid_at' => now(), 'confirmed_by' => $by]);
        if ($extend) {
            $this->extend($m, $days);
        }
        Transaction::create(['type' => 'revenue', 'category' => 'subscription', 'amount' => $amount, 'house_id' => $m->house_id, 'party' => $m->name, 'reference' => $p->reference, 'description' => 'Gym subscription '.$m->member_no, 'date' => now()->toDateString(), 'recorded_by' => $by]);

        return $p;
    }

    private function extend(GymMember $m, int $days): void
    {
        $from = $m->end_date->isPast() ? now()->startOfDay() : $m->end_date->copy()->addDay();
        $m->update(['end_date' => $from->addDays($days - 1), 'status' => $m->status === 'cancelled' ? 'active' : $m->status, 'due_alerted_at' => null]);
    }

    /** Staff confirms a pending payment (money received) → membership extended + finance revenue entry. */
    public function confirmPayment(Request $request, GymPayment $payment)
    {
        $this->authorizeManage($request, 'gym');
        $data = $request->validate(['status' => 'required|in:paid,rejected']);
        abort_if($payment->status !== 'pending', 422, 'Already processed.');
        $m = $payment->member;
        $payment->update(['status' => $data['status'], 'paid_at' => $data['status'] === 'paid' ? now() : null, 'confirmed_by' => $request->user()->id]);
        if ($data['status'] === 'paid') {
            $this->extend($m, $payment->days);
            Transaction::create(['type' => 'revenue', 'category' => 'subscription', 'amount' => $payment->amount, 'house_id' => $m->house_id, 'party' => $m->name, 'reference' => $payment->reference, 'description' => 'Gym subscription '.$m->member_no, 'date' => now()->toDateString(), 'recorded_by' => $request->user()->id]);
        }
        Activity::log('gym', $data['status'], "Payment {$payment->reference} {$data['status']} — {$m->name}", $payment);
        Activity::alertUser($m->user_id, 'gym', $data['status'] === 'paid' ? 'Payment confirmed ✅' : 'Payment not verified', $data['status'] === 'paid' ? 'Valid till '.$m->fresh()->end_date->format('d M Y') : 'Please contact the club office · '.$payment->reference, $data['status'] === 'paid' ? 'success' : 'danger', '/gym');

        return $payment->load('member');
    }

    /** Cash at the counter: one step. */
    public function cashPayment(Request $request, GymMember $member)
    {
        $this->authorizeManage($request, 'gym');
        $p = $this->recordPaid($member, (float) ($member->plan?->price ?? 0), $member->plan?->duration_days ?? 30, 'cash', $request->user()->id);
        Activity::log('gym', 'paid', "Cash Rs ".number_format($p->amount)." received from {$member->name}", $p);
        Activity::alertUser($member->user_id, 'gym', 'Payment received ✅', 'Valid till '.$member->fresh()->end_date->format('d M Y'), 'success', '/gym');

        return $p->load('member');
    }

    public function stats(Request $request)
    {
        $this->authorizeManage($request, 'gym');

        return [
            'active' => GymMember::where('status', 'active')->whereDate('end_date', '>=', now())->count(),
            'due' => GymMember::where('status', 'active')->whereDate('end_date', '>=', now())->whereDate('end_date', '<=', now()->addDays((int) Settings::get('gym_due_reminder_days')))->count(),
            'expired' => GymMember::where('status', 'active')->whereDate('end_date', '<', now())->count(),
            'pending_payments' => GymPayment::where('status', 'pending')->count(),
            'month_revenue' => (float) GymPayment::where('status', 'paid')->where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
            'today_checkins' => GymCheckin::whereDate('created_at', now()->toDateString())->where('allowed', true)->count(),
        ];
    }
}
