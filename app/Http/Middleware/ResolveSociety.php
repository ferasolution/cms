<?php

namespace App\Http\Middleware;

use App\Models\Society;
use App\Support\Tenant;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\URL;

/**
 * Works out which society a request belongs to:
 *  /{slug}/…            → that society (a signed-in user of another society is treated as a guest)
 *  /api/… (no prefix)   → the signed-in user's society, else the default one (older app links)
 */
class ResolveSociety
{
    public function handle(Request $request, Closure $next)
    {
        Tenant::set(null);
        $slug = $request->route('society');
        if ($slug !== null) {
            $soc = Society::where('slug', strtolower($slug))->first();
            if (! $soc) {
                return SocietyGate::missing($request, $slug);
            }
            $request->route()->forgetParameter('society');
            URL::defaults(['society' => $soc->slug]);
        } else {
            $u = Auth::user();   // resolved before a tenant is set → finds the user in any society
            $soc = ($u && $u->society_id ? Society::find($u->society_id) : null)
                ?? Society::where('slug', config('saas.default'))->first()
                ?? Society::orderBy('id')->first();
        }
        Tenant::set($soc);
        $request->attributes->set('society', $soc);
        // dates and times in the society's own timezone
        Tenant::applyTimezone();
        // a signed-in user of another society (or the platform owner) is a guest here — checked
        // explicitly so a user already resolved earlier in the request can never leak across
        $u = Auth::user();
        if ($u && (int) $u->society_id !== (int) $soc?->id) {
            Auth::forgetUser();
        }

        if ($soc && ! $soc->isOpen() && ! $request->is('*api/login', '*api/logout', '*api/me', '*api/billing', '*api/billing/*', 'api/login', 'api/logout', 'api/me')) {
            return SocietyGate::closed($request, $soc);
        }

        return $next($request);
    }
}
