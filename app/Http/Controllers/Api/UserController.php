<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Access;
use App\Support\Activity;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        if ($request->boolean('staff')) { // simple list for dropdowns (any official)
            abort_if($request->user()->isResident(), 403);

            return User::where('role', '!=', 'resident')->orderBy('name')->get(['id', 'name', 'role']);
        }
        if ($request->boolean('residents')) {
            abort_if($request->user()->isResident(), 403);

            return User::where('role', 'resident')->orderBy('name')->get(['id', 'name', 'house_id']);
        }
        $this->authorizeManage($request, 'users');
        $q = User::with('house')->orderBy('name');
        if ($r = $request->query('role')) {
            $q->where('role', $r);
        }

        return $this->paginate($q, $request, ['name', 'email', 'phone'], 30);
    }

    private function rules(?User $user = null): array
    {
        return [
            'name' => 'required|string|max:120',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user?->id)],
            'role' => ['required', Rule::in(array_keys(Access::ROLES))],
            'phone' => 'nullable|string|max:30',
            'house_id' => 'nullable|exists:houses,id',
            'active' => 'boolean',
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
        ];
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'users');
        $user = User::create($request->validate($this->rules()));
        Activity::log('users', 'create', "Created {$user->role} account for {$user->name}", $user);

        return $user;
    }

    public function update(Request $request, User $user)
    {
        $this->authorizeManage($request, 'users');
        $data = $request->validate($this->rules($user));
        if (empty($data['password'])) {
            unset($data['password']);
        }
        if ($user->id === $request->user()->id) {
            unset($data['role'], $data['active']); // can't lock yourself out
        }
        $user->update($data);
        Activity::log('users', 'update', "Updated account of {$user->name}", $user);

        return $user;
    }

    public function destroy(Request $request, User $user)
    {
        $this->authorizeManage($request, 'users');
        abort_if($user->id === $request->user()->id, 422, 'You cannot delete your own account.');
        Activity::log('users', 'delete', "Deleted account of {$user->name}");
        $user->delete();

        return response()->noContent();
    }
}
