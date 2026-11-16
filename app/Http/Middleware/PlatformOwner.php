<?php

namespace App\Http\Middleware;

use App\Support\Tenant;
use Closure;
use Illuminate\Http\Request;

/**
 * Platform console: no society context. "owner" lets in the whole platform team (owner and
 * support staff); "admin" is for the owner role only (billing keys, plans, team, deleting).
 */
class PlatformOwner
{
    public const ROLES = ['platform_owner', 'platform_support'];

    public function handle(Request $request, Closure $next, string $mode = 'owner')
    {
        Tenant::set(null);
        if ($mode !== 'public') {
            $u = $request->user();
            abort_unless($u && in_array($u->role, self::ROLES, true) && ! $u->society_id && $u->active, 401, 'Sign in to the platform console.');
            abort_if($mode === 'admin' && $u->role !== 'platform_owner', 403, 'Only the platform owner can do this.');
        }

        return $next($request);
    }
}
