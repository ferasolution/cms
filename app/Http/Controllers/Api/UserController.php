<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use App\Support\Access;
use App\Support\Activity;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * User panel: Super Admin / Admin / Editor / User accounts with per-module access.
 * Only a Super Admin can create, edit or delete Super Admins.
 */
class UserController extends Controller
{
    public function index(Request $request)
    {
        if ($request->boolean('staff')) { // simple list for dropdowns (any staff)
            abort_if($request->user()->isResident(), 403);

            return User::where('role', '!=', 'user')->where('active', true)->orderBy('name')->get(['id', 'name', 'role', 'designation']);
        }
        if ($request->boolean('residents')) {
            abort_if($request->user()->isResident(), 403);

            return User::where('role', 'user')->orderBy('name')->get(['id', 'name', 'house_id']);
        }
        $this->authorizeManage($request, 'users');
        $q = User::with('house')->orderByRaw("case role when 'super_admin' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end")->orderBy('name');
        if ($r = $request->query('role')) {
            $q->where('role', $r);
        }
        if ($request->filled('active')) {
            $q->where('active', $request->boolean('active'));
        }
        $page = $this->paginate($q, $request, ['name', 'email', 'phone', 'designation'], 30);
        $page->getCollection()->transform(fn (User $u) => $u->setAttribute('levels', Access::levels($u)));

        return $page;
    }

    public function meta(Request $request)
    {
        $this->authorizeManage($request, 'users');

        return [
            'roles' => Access::ROLES,
            'modules' => Access::MODULES,
            'templates' => Access::TEMPLATES,
            'user_defaults' => Access::USER_DEFAULTS,
            'counts' => User::selectRaw('role, count(*) c')->groupBy('role')->pluck('c', 'role'),
            'can_super' => $request->user()->isSuperAdmin(),
        ];
    }

    private function rules(Request $request, ?User $user = null): array
    {
        $roles = $request->user()->isSuperAdmin() ? array_keys(Access::ROLES) : ['admin', 'editor', 'user'];

        return [
            'name' => 'required|string|max:120',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user?->id)],
            'role' => ['required', Rule::in($roles)],
            'designation' => 'nullable|string|max:80',
            'permissions' => 'nullable|array',
            'phone' => 'nullable|string|max:30',
            'house_id' => 'nullable|exists:houses,id',
            'household_role' => 'nullable|in:owner,family,tenant',
            'active' => 'boolean',
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
        ];
    }

    private function guardSuper(Request $request, ?User $target): void
    {
        if ($target && $target->isSuperAdmin() && ! $request->user()->isSuperAdmin()) {
            abort(403, 'Only a Super Admin can change a Super Admin account.');
        }
        if ($target && $target->role === 'admin' && ! $request->user()->isAdmin()) {
            abort(403, 'Only an Admin can change another Admin.');
        }
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'users');
        $data = $request->validate($this->rules($request));
        if ($data['role'] === 'admin' && ! $request->user()->isAdmin()) {
            abort(403, 'Only an Admin can create Admin accounts.');
        }
        $data['permissions'] = $data['role'] === 'editor' || $data['role'] === 'user' ? Access::clean($data['permissions'] ?? []) : [];
        $user = User::create($data);
        Activity::log('users', 'create', 'Created '.Access::ROLES[$user->role]." account for {$user->name}".($user->designation ? " ({$user->designation})" : ''), $user);

        return $user->setAttribute('levels', Access::levels($user));
    }

    public function update(Request $request, User $user)
    {
        $this->authorizeManage($request, 'users');
        $this->guardSuper($request, $user);
        $data = $request->validate($this->rules($request, $user));
        if (empty($data['password'])) {
            unset($data['password']);
        }
        if ($user->id === $request->user()->id) {
            unset($data['role'], $data['active'], $data['permissions']); // can't lock yourself out
        } else {
            $data['permissions'] = in_array($data['role'], ['editor', 'user'], true) ? Access::clean($data['permissions'] ?? []) : [];
        }
        $before = Access::levels($user);
        $user->update($data);
        $after = Access::levels($user->fresh());
        $changed = $before != $after ? ' · access changed' : '';
        Activity::log('users', 'update', "Updated account of {$user->name}{$changed}", $user);
        if ($changed) {
            Activity::alertUser($user->id, 'system', 'Your access was updated', 'Sign out and in again if a menu is missing.', 'info');
        }

        return $user->setAttribute('levels', $after);
    }

    public function destroy(Request $request, User $user)
    {
        $this->authorizeManage($request, 'users');
        abort_unless($request->user()->canApprove('users'), 403, 'You need Manage access on Users to delete accounts.');
        $this->guardSuper($request, $user);
        abort_if($user->id === $request->user()->id, 422, 'You cannot delete your own account.');
        Activity::log('users', 'delete', "Deleted account of {$user->name}");
        $user->delete();

        return response()->noContent();
    }

    /** Login & activity history of one account (security audit). */
    public function history(Request $request, User $user)
    {
        $this->authorizeManage($request, 'users');

        return [
            'last_login_at' => $user->last_login_at,
            'last_login_ip' => $user->last_login_ip,
            'activity' => ActivityLog::where('user_id', $user->id)->latest('id')->limit(40)->get(),
        ];
    }
}
