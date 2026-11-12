<?php

namespace App\Http\Middleware;

use App\Support\Tenant;
use Closure;
use Illuminate\Http\Request;

/** Platform console: no society context, and only the platform owner gets in. */
class PlatformOwner
{
    public function handle(Request $request, Closure $next, string $mode = 'owner')
    {
        Tenant::set(null);
        if ($mode === 'owner') {
            $u = $request->user();
            abort_unless($u && $u->role === 'platform_owner' && ! $u->society_id, 401, 'Sign in to the platform console.');
        }

        return $next($request);
    }
}
