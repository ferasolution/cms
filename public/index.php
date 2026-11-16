<?php

// Links that carry the server's folder name (cms.ferasolution.com/public/demo) -> the real address.
if (preg_match('#^/public(/[^?]*)?(\?.*)?$#', $_SERVER['REQUEST_URI'] ?? '', $m)) {
    header('Location: '.(($m[1] ?? '') !== '' ? $m[1] : '/').($m[2] ?? ''), true, 301);
    exit;
}

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// First run on the server: send the visitor to the web installer.
if (! file_exists(__DIR__.'/../.env') && ! file_exists(__DIR__.'/../storage/installed.lock')) {
    header('Location: /install.php');
    exit;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
