<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

/**
 * Called by GitHub Actions right after each FTP deploy (shared hosting has no SSH step):
 * runs new migrations and refreshes caches. Protected by DEPLOY_TOKEN from .env.
 */
class SystemController extends Controller
{
    public function deploy(Request $request)
    {
        $token = (string) config('app.deploy_token');
        abort_if($token === '' || ! hash_equals($token, (string) $request->header('X-Deploy-Token')), 403);

        $out = [];
        foreach ([['migrate', ['--force' => true]], ['optimize:clear', []], ['config:cache', []], ['route:cache', []], ['view:cache', []]] as [$cmd, $args]) {
            try {
                Artisan::call($cmd, $args);
                $out[$cmd] = trim(Artisan::output());
            } catch (\Throwable $e) {
                $out[$cmd] = 'ERROR: '.$e->getMessage();
            }
        }

        return response()->json(['ok' => true, 'version' => @file_get_contents(base_path('VERSION')) ?: null, 'steps' => $out]);
    }
}
