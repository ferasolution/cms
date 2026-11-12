<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\House;
use App\Models\Society;
use App\Models\User;
use App\Support\Plans;
use App\Support\Settings;
use App\Support\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** The SaaS layer: public society finder & sign-up, and the platform owner's console. */
class PlatformController extends Controller
{
    private function slugRules(?int $ignore = null): array
    {
        return ['required', 'string', 'min:3', 'max:40', 'regex:/^[a-z0-9][a-z0-9-]*[a-z0-9]$/', Rule::notIn(array_merge(config('saas.reserved'), SpaController::APP_ROUTES)),
            Rule::unique('societies', 'slug')->ignore($ignore)];
    }

    // ------------------------------------------------------------------ public

    public function plans()
    {
        return collect(Plans::PLANS)->map(fn ($p, $k) => ['key' => $k] + $p)->values();
    }

    /** "Find your society" on the landing page. */
    public function lookup(Request $request)
    {
        $q = trim((string) $request->query('q'));
        if (mb_strlen($q) < 2) {
            return [];
        }

        return Society::where('status', '!=', 'suspended')->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('slug', 'like', "%{$q}%")->orWhere('city', 'like', "%{$q}%"))
            ->orderBy('name')->limit(8)->get(['slug', 'name', 'city']);
    }

    public function slugCheck(Request $request)
    {
        $v = validator(['slug' => strtolower((string) $request->query('slug'))], ['slug' => $this->slugRules()]);

        return ['ok' => ! $v->fails(), 'message' => $v->errors()->first('slug')];
    }

    /** A new society signs up: trial society + its Super Admin, signed in straight away. */
    public function register(Request $request)
    {
        abort_if(filled($request->input('website')), 422, 'Invalid request.');   // honeypot
        $key = 'register:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['email' => 'Too many sign-ups from this network. Try again later.']);
        }
        $request->merge(['slug' => strtolower((string) $request->input('slug'))]);
        $d = $request->validate([
            'name' => 'required|string|max:120', 'slug' => $this->slugRules(), 'city' => 'required|string|max:80', 'address' => 'nullable|string|max:255',
            'houses' => 'nullable|integer|min:1|max:20000', 'admin_name' => 'required|string|max:120', 'email' => 'required|email|max:190', 'phone' => 'required|string|max:30',
            'password' => 'required|string|min:8|max:100', 'plan' => ['nullable', Rule::in(array_keys(Plans::PLANS))],
        ]);
        RateLimiter::hit($key, 3600);

        $soc = DB::transaction(function () use ($d) {
            $soc = Society::create([
                'slug' => $d['slug'], 'name' => $d['name'], 'city' => $d['city'], 'address' => $d['address'] ?? null, 'status' => 'trial', 'plan' => $d['plan'] ?? 'pro',
                'trial_ends_at' => now()->addDays(config('saas.trial_days')), 'contact_name' => $d['admin_name'], 'contact_email' => $d['email'], 'contact_phone' => $d['phone'],
                'notes' => isset($d['houses']) ? "About {$d['houses']} houses (from sign-up)" : null,
            ]);
            Tenant::run($soc, function () use ($soc, $d) {
                Settings::save(['community_name' => $soc->name]);
                User::create(['name' => $d['admin_name'], 'email' => strtolower($d['email']), 'phone' => $d['phone'], 'password' => Hash::make($d['password']), 'role' => 'super_admin', 'active' => true]);
                ActivityLog::create(['module' => 'system', 'action' => 'created', 'description' => "{$soc->name} joined the platform (trial)"]);
            });

            return $soc;
        });
        $user = Tenant::run($soc, fn () => User::where('email', strtolower($d['email']))->first());
        Auth::login($user, true);
        $request->session()->regenerate();

        return ['redirect' => '/'.$soc->slug.'/', 'society' => $soc->publicInfo()];
    }

    // ------------------------------------------------------------------ platform owner auth

    public function status()
    {
        $u = Auth::user();

        return ['needs_setup' => ! User::withoutGlobalScopes()->where('role', 'platform_owner')->exists(),
            'user' => $u && $u->role === 'platform_owner' && ! $u->society_id ? $u->only(['id', 'name', 'email']) : null];
    }

    /** One-time: create the platform owner. Protected by the server's deploy token. */
    public function setup(Request $request)
    {
        abort_if(User::withoutGlobalScopes()->where('role', 'platform_owner')->exists(), 403, 'The platform owner already exists.');
        $d = $request->validate(['token' => 'required|string', 'name' => 'required|string|max:120', 'email' => 'required|email', 'password' => 'required|string|min:10']);
        $token = (string) config('app.deploy_token');
        abort_if($token === '' || ! hash_equals($token, $d['token']), 403, 'Wrong setup key.');
        $u = User::create(['name' => $d['name'], 'email' => strtolower($d['email']), 'password' => Hash::make($d['password']), 'role' => 'platform_owner', 'active' => true]);
        Auth::login($u, true);
        $request->session()->regenerate();

        return $this->status();
    }

    public function login(Request $request)
    {
        $d = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'plogin:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['email' => 'Too many attempts. Try again in '.RateLimiter::availableIn($key).' seconds.']);
        }
        $u = User::withoutGlobalScopes()->whereNull('society_id')->where('role', 'platform_owner')->where('email', strtolower($d['email']))->where('active', true)->first();
        if (! $u || ! Hash::check($d['password'], $u->password)) {
            RateLimiter::hit($key, 300);
            throw ValidationException::withMessages(['email' => 'Invalid email or password.']);
        }
        RateLimiter::clear($key);
        Auth::login($u, true);
        $request->session()->regenerate();

        return $this->status();
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return ['ok' => true];
    }

    // ------------------------------------------------------------------ console

    private function row(Society $s): array
    {
        $count = fn ($model) => $model::withoutGlobalScopes()->where('society_id', $s->id);

        return $s->publicInfo() + [
            'open' => $s->isOpen(), 'address' => $s->address, 'paid_until' => $s->paid_until?->toDateString(), 'max_houses' => $s->max_houses, 'plan_max_houses' => $s->plan()['max_houses'],
            'modules' => $s->modules ?? [], 'allowed' => $s->allowedModules(), 'contact_name' => $s->contact_name, 'contact_email' => $s->contact_email, 'contact_phone' => $s->contact_phone,
            'notes' => $s->notes, 'created_at' => $s->created_at,
            'houses' => $count(House::class)->count(), 'users' => $count(User::class)->count(),
            'last_activity' => $count(ActivityLog::class)->max('created_at'),
            'price' => $s->plan()['price'],
        ];
    }

    public function overview()
    {
        $all = Society::orderByDesc('id')->get();
        $rows = $all->map(fn ($s) => $this->row($s));

        return [
            'societies' => $rows,
            'stats' => [
                'societies' => $all->count(), 'active' => $all->where('status', 'active')->count(), 'trial' => $all->where('status', 'trial')->count(),
                'suspended' => $all->where('status', 'suspended')->count(), 'houses' => $rows->sum('houses'), 'users' => $rows->sum('users'),
                'mrr' => $all->where('status', 'active')->sum(fn ($s) => $s->plan()['price']),
                'trials_ending' => $all->where('status', 'trial')->filter(fn ($s) => $s->trial_ends_at && $s->trial_ends_at->between(now(), now()->addDays(5)))->count(),
            ],
            'plans' => $this->plans(),
            'modules' => \App\Support\Access::MODULES,
        ];
    }

    public function store(Request $request)
    {
        $request->merge(['slug' => strtolower((string) $request->input('slug'))]);
        $d = $request->validate(['name' => 'required|string|max:120', 'slug' => $this->slugRules(), 'city' => 'nullable|string|max:80', 'plan' => ['required', Rule::in(array_keys(Plans::PLANS))],
            'status' => 'required|in:trial,active,suspended', 'admin_name' => 'required|string|max:120', 'email' => 'required|email', 'password' => 'required|string|min:8', 'phone' => 'nullable|string|max:30']);
        $soc = Society::create(['name' => $d['name'], 'slug' => $d['slug'], 'city' => $d['city'] ?? null, 'plan' => $d['plan'], 'status' => $d['status'],
            'trial_ends_at' => $d['status'] === 'trial' ? now()->addDays(config('saas.trial_days')) : null, 'contact_name' => $d['admin_name'], 'contact_email' => $d['email'], 'contact_phone' => $d['phone'] ?? null]);
        Tenant::run($soc, function () use ($soc, $d) {
            Settings::save(['community_name' => $soc->name]);
            User::create(['name' => $d['admin_name'], 'email' => strtolower($d['email']), 'phone' => $d['phone'] ?? null, 'password' => Hash::make($d['password']), 'role' => 'super_admin', 'active' => true]);
        });

        return $this->row($soc);
    }

    public function update(Request $request, Society $society)
    {
        $request->merge(['slug' => strtolower((string) $request->input('slug', $society->slug))]);
        $d = $request->validate([
            'name' => 'required|string|max:120', 'slug' => $this->slugRules($society->id), 'city' => 'nullable|string|max:80', 'address' => 'nullable|string|max:255',
            'status' => 'required|in:trial,active,suspended', 'plan' => ['required', Rule::in(array_keys(Plans::PLANS))], 'trial_ends_at' => 'nullable|date', 'paid_until' => 'nullable|date',
            'max_houses' => 'nullable|integer|min:1', 'modules' => 'nullable|array', 'modules.*' => Rule::in(array_keys(\App\Support\Access::MODULES)),
            'contact_name' => 'nullable|string|max:120', 'contact_email' => 'nullable|email', 'contact_phone' => 'nullable|string|max:30', 'notes' => 'nullable|string|max:2000',
        ]);
        $society->update($d);

        return $this->row($society->fresh());
    }

    /** Upload a digitised site plan JSON (plots + site) for a society. */
    public function sitePlan(Request $request, Society $society)
    {
        $request->validate(['file' => 'required|file|max:10240']);
        $json = json_decode(file_get_contents($request->file('file')->getRealPath()), true);
        abort_unless(is_array($json) && isset($json['plots'], $json['site']['boundary']), 422, 'Not a site plan file (needs "plots" and "site.boundary").');
        $society->update(['site_plan' => $json]);
        $r = Tenant::run($society->fresh(), fn () => \App\Services\SitePlan::apply(adoptExisting: true));

        return $this->row($society->fresh()) + ['applied' => $r];
    }

    /** Support: open a society as its Super Admin (logged in its activity log). */
    public function impersonate(Request $request, Society $society)
    {
        $owner = $request->user();
        $admin = User::withoutGlobalScopes()->where('society_id', $society->id)->where('role', 'super_admin')->where('active', true)->orderBy('id')->first();
        abort_unless($admin, 422, 'This society has no active Super Admin.');
        Tenant::run($society, fn () => ActivityLog::create(['module' => 'system', 'action' => 'support_login', 'description' => "Platform support ({$owner->name}) opened the portal as {$admin->name}"]));
        Auth::login($admin);
        $request->session()->regenerate();

        return ['redirect' => '/'.$society->slug.'/'];
    }
}
