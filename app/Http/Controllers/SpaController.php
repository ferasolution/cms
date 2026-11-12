<?php

namespace App\Http\Controllers;

use App\Models\Society;
use App\Support\Settings;
use App\Support\Tenant;

/** Serves the React app: society portal at /{slug}/…, platform site (landing, sign-up, console) at the root. */
class SpaController extends Controller
{
    /** First path segments of the portal pages — old links using them are redirected into the default society. */
    public const APP_ROUTES = ['security', 'map', 'events', 'complaints', 'announcements', 'emergency', 'inventory', 'finance', 'noc', 'records', 'crm', 'library',
        'gym', 'users', 'settings', 'automations', 'profile', 'dashboard', 'houses', 'workspace', 'activity'];

    public static function tenantData(Society $soc): array
    {
        $name = Tenant::run($soc, fn () => Settings::get('community_name')) ?: $soc->name;

        return ['app' => ['mode' => 'tenant', 'name' => $name, 'base' => '/'.$soc->slug, 'society' => $soc->publicInfo() + ['open' => $soc->isOpen(), 'display_name' => $name]],
            'title' => $name, 'manifest' => '/'.$soc->slug.'/manifest.webmanifest'];
    }

    public static function platformData(array $extra = []): array
    {
        return ['app' => ['mode' => 'platform', 'name' => 'Fera Community Cloud', 'base' => ''] + $extra, 'title' => 'Fera Community Cloud — society management platform', 'manifest' => '/manifest.webmanifest'];
    }

    public function tenant()
    {
        return view('app', self::tenantData(Tenant::get()));
    }

    public function platform(\Illuminate\Http\Request $request)
    {
        // phones that installed the portal before it became multi-society open "/": send signed-in people to their own society
        if ($request->path() === '/' && ($u = $request->user()) && $u->society_id && ($soc = Society::find($u->society_id))) {
            return redirect('/'.$soc->slug.'/');
        }

        return view('app', self::platformData());
    }

    /** Each society installs as its own app on phones. */
    public function manifest()
    {
        $soc = Tenant::get();
        $name = Settings::get('community_name') ?: $soc->name;

        return response()->json([
            'name' => $name, 'short_name' => mb_strimwidth($name, 0, 14, ''), 'start_url' => '/'.$soc->slug.'/', 'scope' => '/'.$soc->slug.'/', 'id' => '/'.$soc->slug.'/',
            'display' => 'standalone', 'background_color' => '#f2f4f8', 'theme_color' => '#101833',
            'icons' => [['src' => '/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png'], ['src' => '/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png'], ['src' => '/icon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml']],
        ], 200, ['Content-Type' => 'application/manifest+json']);
    }
}
