<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Complaint;
use App\Models\House;
use App\Models\Platform\BillingEvent;
use App\Models\Platform\Notice;
use App\Models\Society;
use App\Models\User;
use App\Models\Visitor;
use App\Support\Access;
use App\Support\Plans;
use App\Support\Platform;
use App\Support\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The platform team's console: revenue and growth, every community in detail, payments ledger,
 * plans, notices to communities, the team, the audit trail, platform settings and system health.
 */
class PlatformConsoleController extends Controller
{
    private function scoped(string $model, int $sid)
    {
        return $model::withoutGlobalScopes()->where('society_id', $sid);
    }

    /** Monthly recurring revenue right now: paying communities × plan price. */
    private function mrr($all): float
    {
        $plans = Plans::all();

        return (float) $all->filter(fn ($s) => $s->status === 'active' && ($s->billing_subscription_id || ($s->paid_until && $s->paid_until->gte(today()))))
            ->sum(fn ($s) => $plans[$s->plan]['price'] ?? 0);
    }

    // ------------------------------------------------------------------ dashboard

    public function dashboard()
    {
        $all = Society::all();
        $plans = Plans::all();
        $months = collect(range(11, 0))->map(fn ($i) => now()->startOfMonth()->subMonths($i));
        $paid = BillingEvent::whereIn('type', ['payment', 'refund'])->where('occurred_at', '>=', $months->first())->get();
        $houses = House::withoutGlobalScopes()->selectRaw('society_id, count(*) c')->groupBy('society_id')->pluck('c', 'society_id');
        $mrr = $this->mrr($all);
        $paying = $all->filter(fn ($s) => $s->status === 'active' && ($s->billing_subscription_id || ($s->paid_until && $s->paid_until->gte(today()))));
        $endedTrials = $all->filter(fn ($s) => $s->trial_ends_at && $s->trial_ends_at->isPast());

        $attention = [];
        foreach ($all as $s) {
            $reason = match (true) {
                $s->billing_status === 'past_due' => ['Payment failed — card needs updating', 'red'],
                $s->status === 'expired' => ['Subscription ended', 'red'],
                $s->status === 'trial' && $s->trial_ends_at?->isPast() => ['Trial ended, no plan chosen', 'amber'],
                $s->status === 'trial' && $s->trial_ends_at && $s->trial_ends_at->lte(now()->addDays(3)) => ['Trial ends '.$s->trial_ends_at->diffForHumans(), 'amber'],
                ! $s->site_plan && $s->created_at->lte(now()->subDays(3)) && $s->status !== 'suspended' => ['No map uploaded yet', 'blue'],
                default => null,
            };
            if ($reason) {
                $attention[] = ['id' => $s->id, 'name' => $s->name, 'slug' => $s->slug, 'reason' => $reason[0], 'tone' => $reason[1]];
            }
        }

        return [
            'kpis' => [
                'mrr' => $mrr, 'arr' => $mrr * 12, 'paying' => $paying->count(), 'arpa' => $paying->count() ? round($mrr / $paying->count(), 2) : 0,
                'societies' => $all->count(), 'trial' => $all->where('status', 'trial')->count(), 'closed' => $all->whereIn('status', ['suspended', 'expired'])->count(),
                'houses' => (int) $houses->sum(), 'users' => User::withoutGlobalScopes()->whereNotNull('society_id')->count(),
                'conversion' => $endedTrials->count() ? round(100 * $endedTrials->where('status', 'active')->count() / $endedTrials->count()) : null,
                'new_30' => $all->filter(fn ($s) => $s->created_at->gte(now()->subDays(30)))->count(),
                'collected_30' => (float) BillingEvent::whereIn('type', ['payment', 'refund'])->where('occurred_at', '>=', now()->subDays(30))->sum('amount'),
            ],
            'revenue' => $months->map(fn ($m) => ['month' => $m->format('M y'), 'amount' => round((float) $paid->filter(fn ($e) => $e->occurred_at->isSameMonth($m))->sum('amount'), 2)])->values(),
            'signups' => $months->map(fn ($m) => ['month' => $m->format('M y'), 'count' => $all->filter(fn ($s) => $s->created_at->isSameMonth($m))->count()])->values(),
            'plan_mix' => collect($plans)->map(fn ($p, $k) => ['key' => $k, 'name' => $p['name'], 'count' => $all->where('plan', $k)->whereNotIn('status', ['suspended', 'expired'])->count(), 'mrr' => $paying->where('plan', $k)->count() * $p['price']])->values(),
            'status_mix' => collect(['active', 'trial', 'expired', 'suspended'])->map(fn ($k) => ['status' => $k, 'count' => $all->where('status', $k)->count()]),
            'countries' => $all->groupBy(fn ($s) => $s->country ?: '—')->map->count()->sortDesc()->take(8),
            'attention' => array_slice($attention, 0, 12),
            'recent_payments' => BillingEvent::with('society:id,name,slug')->whereIn('type', ['payment', 'refund'])->latest('occurred_at')->limit(6)->get(),
            'recent_signups' => $all->sortByDesc('created_at')->take(6)->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'slug' => $s->slug, 'city' => $s->city, 'country' => $s->country, 'plan' => $s->plan, 'status' => $s->status, 'created_at' => $s->created_at])->values(),
            'audit' => DB::table('platform_audit')->latest('id')->limit(8)->get(),
        ];
    }

    // ------------------------------------------------------------------ communities

    public function societies(Request $request)
    {
        $houses = House::withoutGlobalScopes()->selectRaw('society_id, count(*) c')->groupBy('society_id')->pluck('c', 'society_id');
        $users = User::withoutGlobalScopes()->whereNotNull('society_id')->selectRaw('society_id, count(*) c')->groupBy('society_id')->pluck('c', 'society_id');
        $seen = ActivityLog::withoutGlobalScopes()->selectRaw('society_id, max(created_at) m')->groupBy('society_id')->pluck('m', 'society_id');
        $paid = BillingEvent::whereIn('type', ['payment', 'refund'])->selectRaw('society_id, sum(amount) s')->groupBy('society_id')->pluck('s', 'society_id');
        $plans = Plans::all();

        return Society::orderByDesc('id')->get()->map(fn ($s) => $s->publicInfo() + [
            'country' => $s->country, 'address' => $s->address, 'open' => $s->isOpen(), 'paid_until' => $s->paid_until?->toDateString(),
            'price' => $plans[$s->plan]['price'] ?? 0, 'houses' => (int) ($houses[$s->id] ?? 0), 'max_houses' => $s->maxHouses(), 'users' => (int) ($users[$s->id] ?? 0),
            'last_activity' => $seen[$s->id] ?? null, 'lifetime' => round((float) ($paid[$s->id] ?? 0), 2), 'created_at' => $s->created_at,
            'contact_name' => $s->contact_name, 'contact_email' => $s->contact_email, 'billing_provider' => $s->billing_provider, 'billing_status' => $s->billing_status,
        ]);
    }

    public function society(Society $society)
    {
        $id = $society->id;
        $since = now()->subDays(30);
        $dir = storage_path('app/private');
        $bytes = 0;
        foreach (File::isDirectory($dir) ? File::directories($dir) : [] as $folder) {
            $sub = $folder.'/s'.$id;
            if (File::isDirectory($sub)) {
                foreach (File::allFiles($sub) as $f) {
                    $bytes += $f->getSize();
                }
            }
        }
        $daily = ActivityLog::withoutGlobalScopes()->where('society_id', $id)->where('created_at', '>=', now()->subDays(13)->startOfDay())->get(['created_at'])
            ->groupBy(fn ($r) => $r->created_at->format('Y-m-d'))->map->count();

        return [
            'society' => $society->publicInfo() + $society->only(['country', 'address', 'contact_name', 'contact_email', 'contact_phone', 'notes', 'modules', 'max_houses', 'billing_provider', 'billing_status', 'billing_customer_id', 'billing_subscription_id'])
                + ['open' => $society->isOpen(), 'paid_until' => $society->paid_until?->toDateString(), 'renews_at' => $society->billing_renews_at, 'created_at' => $society->created_at,
                    'allowed' => $society->allowedModules(), 'plan_max_houses' => $society->plan()['max_houses'], 'price' => $society->plan()['price'], 'region' => Tenant::run($society, fn () => \App\Support\Settings::get('currency').' · '.\App\Support\Settings::get('timezone'))],
            'usage' => [
                'houses' => $this->scoped(House::class, $id)->count(), 'occupied' => $this->scoped(House::class, $id)->whereNotNull('owner_name')->count(),
                'users' => $this->scoped(User::class, $id)->count(), 'residents' => $this->scoped(User::class, $id)->where('role', 'user')->count(),
                'staff' => $this->scoped(User::class, $id)->where('role', '!=', 'user')->count(),
                'active_30' => $this->scoped(User::class, $id)->where('last_login_at', '>=', $since)->count(),
                'visitors_30' => $this->scoped(Visitor::class, $id)->where('created_at', '>=', $since)->count(),
                'complaints_open' => $this->scoped(Complaint::class, $id)->whereNotIn('status', ['resolved', 'closed'])->count(),
                'storage_mb' => round($bytes / 1048576, 1),
                'activity' => collect(range(13, 0))->map(fn ($i) => ['day' => now()->subDays($i)->format('d M'), 'count' => (int) ($daily[now()->subDays($i)->format('Y-m-d')] ?? 0)])->values(),
            ],
            'admins' => $this->scoped(User::class, $id)->whereIn('role', ['super_admin', 'admin'])->orderBy('id')->get(['id', 'name', 'email', 'phone', 'role', 'active', 'last_login_at']),
            'payments' => BillingEvent::where('society_id', $id)->latest('occurred_at')->limit(50)->get(),
            'activity' => ActivityLog::withoutGlobalScopes()->where('society_id', $id)->latest('id')->limit(40)->get(['id', 'module', 'action', 'description', 'user_id', 'created_at']),
            'audit' => DB::table('platform_audit')->where('society_id', $id)->latest('id')->limit(30)->get(),
            'plans' => Plans::all(),
            'modules' => Access::MODULES,
        ];
    }

    public function extendTrial(Request $request, Society $society)
    {
        $d = $request->validate(['days' => 'required|integer|min:1|max:90']);
        $from = $society->trial_ends_at && $society->trial_ends_at->isFuture() ? $society->trial_ends_at : now();
        $society->update(['trial_ends_at' => $from->copy()->addDays($d['days']), 'status' => $society->status === 'expired' ? 'trial' : $society->status]);
        Platform::audit('society.trial', "Extended {$society->name}'s trial by {$d['days']} days (to {$society->trial_ends_at->toDateString()})", $society->id);

        return ['ok' => true];
    }

    /** Bank transfer / invoice paid outside the card checkout. */
    public function recordPayment(Request $request, Society $society)
    {
        $d = $request->validate(['amount' => 'required|numeric|min:0.01|max:1000000', 'months' => 'required|integer|min:1|max:36', 'method' => 'required|string|max:40',
            'reference' => 'nullable|string|max:120', 'note' => 'nullable|string|max:300', 'plan' => ['nullable', Rule::in(Plans::keys())]]);
        $start = $society->paid_until && $society->paid_until->isFuture() ? $society->paid_until : today();
        $until = $start->copy()->addMonthsNoOverflow($d['months']);
        $society->update(['paid_until' => $until, 'status' => $society->status === 'suspended' ? 'suspended' : 'active', 'plan' => $d['plan'] ?? $society->plan, 'billing_provider' => $society->billing_provider ?: 'manual']);
        BillingEvent::create(['society_id' => $society->id, 'provider' => 'manual', 'type' => 'payment', 'amount' => $d['amount'], 'currency' => 'USD', 'status' => 'paid', 'plan' => $society->plan,
            'reference' => $d['reference'] ?? null, 'description' => trim($d['method'].' · '.$d['months'].' month(s)'.(! empty($d['note']) ? ' · '.$d['note'] : '')), 'occurred_at' => now()]);
        Platform::audit('billing.manual', "Recorded \${$d['amount']} from {$society->name} ({$d['method']}), paid until {$until->toDateString()}", $society->id);

        return ['ok' => true, 'paid_until' => $until->toDateString()];
    }

    public function setStatus(Request $request, Society $society)
    {
        $d = $request->validate(['status' => 'required|in:active,suspended,trial', 'reason' => 'nullable|string|max:300']);
        $society->update(['status' => $d['status']]);
        Platform::audit('society.status', ($d['status'] === 'suspended' ? 'Paused ' : 'Set to '.$d['status'].': ').$society->name.(! empty($d['reason']) ? " — {$d['reason']}" : ''), $society->id);

        return ['ok' => true];
    }

    public function addAdmin(Request $request, Society $society)
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'email' => 'required|email|max:190', 'phone' => 'nullable|string|max:30']);
        $password = Str::password(12, symbols: false);
        $u = Tenant::run($society, function () use ($d, $password) {
            abort_if(User::where('email', strtolower($d['email']))->exists(), 422, 'That email already has an account in this community.');

            return User::create(['name' => $d['name'], 'email' => strtolower($d['email']), 'phone' => $d['phone'] ?? null, 'password' => Hash::make($password), 'role' => 'super_admin', 'active' => true]);
        });
        Platform::audit('society.admin', "Added Super Admin {$u->name} <{$u->email}> to {$society->name}", $society->id);

        return ['password' => $password, 'email' => $u->email];
    }

    public function resetAdmin(Society $society, int $user)
    {
        $u = User::withoutGlobalScopes()->where('society_id', $society->id)->whereIn('role', ['super_admin', 'admin'])->findOrFail($user);
        $password = Str::password(12, symbols: false);
        $u->forceFill(['password' => Hash::make($password), 'active' => true])->save();
        Platform::audit('society.reset', "Reset the password of {$u->name} <{$u->email}> in {$society->name}", $society->id);

        return ['password' => $password, 'email' => $u->email];
    }

    /** Deletes a community and everything in it. The slug must be typed to confirm. */
    public function destroy(Request $request, Society $society)
    {
        $request->validate(['confirm' => ['required', Rule::in([$society->slug])]], ['confirm.in' => 'Type the address exactly to confirm.']);
        abort_if($society->slug === config('saas.default'), 422, 'The default community cannot be deleted.');
        $name = $society->name;
        DB::transaction(function () use ($society) {
            foreach (Tenant::TABLES as $t) {
                if (\Schema::hasTable($t) && \Schema::hasColumn($t, 'society_id')) {
                    DB::table($t)->where('society_id', $society->id)->delete();
                }
            }
            BillingEvent::where('society_id', $society->id)->get()->each(fn ($e) => $e->update(['society_id' => null, 'description' => trim(($e->description ?? '').' · '.$society->name.' (deleted)')]));
            $society->delete();
        });
        foreach (File::directories(storage_path('app/private')) as $folder) {
            File::deleteDirectory($folder.'/s'.$society->id);
        }
        Platform::audit('society.delete', "Deleted {$name} (/{$society->slug}) and all its data", null, ['society_id' => $society->id]);

        return ['ok' => true];
    }

    // ------------------------------------------------------------------ billing ledger

    public function payments(Request $request)
    {
        $q = BillingEvent::with('society:id,name,slug')->latest('occurred_at');
        if ($t = $request->query('type')) {
            $t === 'money' ? $q->whereIn('type', ['payment', 'refund']) : $q->where('type', $t);
        }
        if ($p = $request->query('provider')) {
            $q->where('provider', $p);
        }
        if ($sid = $request->query('society_id')) {
            $q->where('society_id', $sid);
        }

        return ['data' => $q->limit(500)->get(), 'totals' => [
            'all_time' => (float) BillingEvent::whereIn('type', ['payment', 'refund'])->sum('amount'),
            'this_month' => (float) BillingEvent::whereIn('type', ['payment', 'refund'])->where('occurred_at', '>=', now()->startOfMonth())->sum('amount'),
            'refunds' => (float) BillingEvent::where('type', 'refund')->sum('amount'),
        ]];
    }

    // ------------------------------------------------------------------ plans

    public function plans()
    {
        return ['plans' => collect(Plans::all())->map(fn ($p, $k) => ['key' => $k] + $p + ['communities' => Society::where('plan', $k)->count()])->values(), 'modules' => Access::MODULES];
    }

    public function savePlans(Request $request)
    {
        $d = $request->validate(['plans' => 'required|array', 'plans.*.key' => ['required', Rule::in(Plans::keys())], 'plans.*.name' => 'required|string|max:40',
            'plans.*.price' => 'required|numeric|min:0|max:100000', 'plans.*.max_houses' => 'nullable|integer|min:1', 'plans.*.tagline' => 'nullable|string|max:160',
            'plans.*.modules' => 'required', 'plans.*.modules.*' => Rule::in(array_keys(Access::MODULES))]);
        $out = [];
        foreach ($d['plans'] as $p) {
            $mods = $p['modules'] === '*' || (is_array($p['modules']) && count(array_diff(array_keys(Access::MODULES), $p['modules'])) === 0) ? '*' : array_values((array) $p['modules']);
            $out[$p['key']] = ['name' => $p['name'], 'price' => (float) $p['price'], 'max_houses' => $p['max_houses'] ?: null, 'tagline' => $p['tagline'] ?? '', 'modules' => $mods];
        }
        Platform::put('plans', $out);
        Platform::audit('plans.update', 'Updated plans: '.collect($out)->map(fn ($p) => "{$p['name']} \${$p['price']}")->implode(', '));

        return $this->plans();
    }

    // ------------------------------------------------------------------ notices

    public function notices()
    {
        return Notice::latest('id')->get();
    }

    public function saveNotice(Request $request, ?Notice $notice = null)
    {
        $d = $request->validate(['title' => 'required|string|max:160', 'body' => 'nullable|string|max:2000', 'level' => 'required|in:info,warning,critical',
            'audience' => 'required|in:all,plans,societies', 'plans' => 'nullable|array', 'plans.*' => Rule::in(Plans::keys()), 'society_ids' => 'nullable|array', 'society_ids.*' => 'integer',
            'admins_only' => 'boolean', 'starts_at' => 'nullable|date', 'ends_at' => 'nullable|date|after_or_equal:starts_at', 'active' => 'boolean']);
        $notice ??= new Notice(['created_by' => $request->user()->id]);
        $notice->fill($d)->save();
        Platform::audit('notice.save', ($notice->wasRecentlyCreated ? 'Posted' : 'Edited')." notice “{$notice->title}”");

        return $notice;
    }

    public function deleteNotice(Notice $notice)
    {
        Platform::audit('notice.delete', "Deleted notice “{$notice->title}”");
        $notice->delete();

        return ['ok' => true];
    }

    // ------------------------------------------------------------------ team

    private function team()
    {
        return User::withoutGlobalScopes()->whereNull('society_id')->whereIn('role', \App\Http\Middleware\PlatformOwner::ROLES)->orderBy('id')->get(['id', 'name', 'email', 'role', 'active', 'last_login_at', 'created_at']);
    }

    public function teamIndex()
    {
        return $this->team();
    }

    public function teamStore(Request $request)
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'email' => 'required|email|max:190', 'role' => 'required|in:platform_owner,platform_support', 'password' => 'required|string|min:10|max:100']);
        abort_if(User::withoutGlobalScopes()->whereNull('society_id')->where('email', strtolower($d['email']))->exists(), 422, 'Someone on the team already uses that email.');
        $u = User::create(['name' => $d['name'], 'email' => strtolower($d['email']), 'role' => $d['role'], 'password' => Hash::make($d['password']), 'active' => true]);
        Platform::audit('team.add', "Added {$u->name} <{$u->email}> as ".($u->role === 'platform_owner' ? 'owner' : 'support'));

        return $this->team();
    }

    public function teamUpdate(Request $request, int $user)
    {
        $u = User::withoutGlobalScopes()->whereNull('society_id')->whereIn('role', \App\Http\Middleware\PlatformOwner::ROLES)->findOrFail($user);
        $d = $request->validate(['role' => 'sometimes|in:platform_owner,platform_support', 'active' => 'sometimes|boolean', 'password' => 'nullable|string|min:10|max:100']);
        abort_if($u->id === $request->user()->id && ((isset($d['active']) && ! $d['active']) || (($d['role'] ?? 'platform_owner') !== 'platform_owner')), 422, 'You cannot lock yourself out.');
        if (! empty($d['password'])) {
            $u->password = Hash::make($d['password']);
        }
        $u->fill(array_intersect_key($d, array_flip(['role', 'active'])))->save();
        abort_unless(User::withoutGlobalScopes()->whereNull('society_id')->where('role', 'platform_owner')->where('active', true)->exists(), 422, 'At least one active owner is needed.');
        Platform::audit('team.update', "Changed {$u->name}: ".collect($d)->except('password')->map(fn ($v, $k) => "$k=".json_encode($v))->implode(', ').(! empty($d['password']) ? ' (new password)' : ''));

        return $this->team();
    }

    // ------------------------------------------------------------------ audit, settings, account, system

    public function audit(Request $request)
    {
        $q = DB::table('platform_audit')->latest('id');
        if ($a = $request->query('action')) {
            $q->where('action', 'like', $a.'%');
        }
        if ($s = $request->query('q')) {
            $q->where(fn ($w) => $w->where('description', 'like', "%{$s}%")->orWhere('user_name', 'like', "%{$s}%"));
        }

        return $q->limit(500)->get();
    }

    public function settings()
    {
        return Platform::settings();
    }

    public function saveSettings(Request $request)
    {
        $d = $request->validate(['brand_name' => 'required|string|max:80', 'support_email' => 'nullable|email', 'trial_days' => 'required|integer|min:0|max:90',
            'registration_open' => 'boolean', 'default_country' => 'required|string|size:2', 'require_card_after_trial' => 'boolean']);
        $d['default_country'] = strtoupper($d['default_country']);
        Platform::put('platform', array_replace(Platform::settings(), $d));
        Platform::audit('settings', 'Changed platform settings');

        return Platform::settings();
    }

    public function account(Request $request)
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'current_password' => 'required_with:password|nullable|string', 'password' => 'nullable|string|min:10|max:100|confirmed']);
        $u = $request->user();
        if (! empty($d['password'])) {
            abort_unless(Hash::check($d['current_password'], $u->password), 422, 'Your current password is not right.');
            $u->password = Hash::make($d['password']);
        }
        $u->name = $d['name'];
        $u->save();
        Platform::audit('account', "{$u->name} updated their account".(! empty($d['password']) ? ' (new password)' : ''));

        return $u->only(['id', 'name', 'email', 'role']);
    }

    public function system()
    {
        $driver = DB::connection()->getDriverName();
        $dbSize = null;
        try {
            $dbSize = $driver === 'mysql' ? (float) DB::selectOne('select sum(data_length + index_length) s from information_schema.tables where table_schema = database()')->s
                : ($driver === 'sqlite' ? @filesize(DB::connection()->getDatabaseName()) : null);
        } catch (\Throwable) {
        }
        $storage = 0;
        $dir = storage_path('app/private');
        if (File::isDirectory($dir)) {
            foreach (File::allFiles($dir) as $f) {
                $storage += $f->getSize();
            }
        }
        $ran = DB::table('migrations')->pluck('migration')->all();
        $pending = collect(File::files(database_path('migrations')))->map(fn ($f) => $f->getFilenameWithoutExtension())->diff($ran)->values();
        $hook = BillingEvent::latest('id')->first();
        $tables = [];
        foreach (['users', 'houses', 'visitors', 'complaints', 'activity_logs', 'payments'] as $t) {
            if (\Schema::hasTable($t)) {
                $tables[$t] = DB::table($t)->count();
            }
        }

        return [
            'app' => ['php' => PHP_VERSION, 'laravel' => app()->version(), 'env' => app()->environment(), 'debug' => (bool) config('app.debug'), 'url' => config('app.url'), 'timezone' => config('app.timezone')],
            'database' => ['driver' => $driver, 'size_mb' => $dbSize ? round($dbSize / 1048576, 1) : null, 'migrations' => count($ran), 'pending' => $pending, 'rows' => $tables],
            'storage' => ['uploads_mb' => round($storage / 1048576, 1), 'disk_free_gb' => @disk_free_space(base_path()) ? round(disk_free_space(base_path()) / 1073741824, 1) : null],
            'services' => [
                'mail' => config('mail.default'), 'cache' => config('cache.default'), 'session' => config('session.driver'), 'queue' => config('queue.default'),
                'payments' => \App\Services\Billing::provider().(\App\Services\Billing::ready() ? ' (ready)' : ' (not set up)'), 'last_billing_event' => $hook?->created_at,
            ],
            'checks' => [
                ['label' => 'Debug mode is off', 'ok' => ! config('app.debug')],
                ['label' => 'App key is set', 'ok' => filled(config('app.key'))],
                ['label' => 'Deploy token is set', 'ok' => filled(config('app.deploy_token'))],
                ['label' => 'All migrations have run', 'ok' => $pending->isEmpty()],
                ['label' => 'Uploads folder is writable', 'ok' => is_writable(storage_path('app'))],
                ['label' => 'Payments are switched on', 'ok' => \App\Services\Billing::ready()],
                ['label' => 'HTTPS address', 'ok' => str_starts_with((string) config('app.url'), 'https://')],
            ],
        ];
    }

    public function clearCache()
    {
        foreach (['cache:clear', 'view:clear', 'route:clear', 'config:clear'] as $c) {
            try {
                Artisan::call($c);
            } catch (\Throwable) {
            }
        }
        Platform::reset();
        Platform::audit('system.cache', 'Cleared the application caches');

        return ['ok' => true];
    }
}
