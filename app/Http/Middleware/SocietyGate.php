<?php

namespace App\Http\Middleware;

use App\Http\Controllers\SpaController;
use App\Models\Society;
use Illuminate\Http\Request;

/** Responses for unknown or paused societies. */
class SocietyGate
{
    public static function missing(Request $request, string $slug)
    {
        // old bookmarks like /security or /map → the first society
        if ($request->isMethod('GET') && in_array(strtolower($slug), SpaController::APP_ROUTES, true)) {
            return redirect('/'.config('saas.default').'/'.ltrim($request->path(), '/').($request->getQueryString() ? '?'.$request->getQueryString() : ''));
        }
        if ($request->expectsJson() || str_contains($request->path(), '/api')) {
            return response()->json(['message' => 'Society not found.'], 404);
        }

        return response()->view('app', SpaController::platformData(['missing' => $slug]), 404);
    }

    public static function closed(Request $request, Society $soc)
    {
        $msg = $soc->status === 'suspended' ? 'This society\'s account is paused. Please contact the platform team.' : 'The free trial of this society has ended. Please choose a plan to continue.';
        if ($request->expectsJson() || str_contains($request->path(), '/api')) {
            return response()->json(['message' => $msg, 'code' => 'society_closed'], 402);
        }

        return response()->view('app', SpaController::tenantData($soc), 200);
    }
}
