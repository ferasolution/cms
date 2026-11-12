<?php

return [
    // society opened by links without a /{slug} prefix (old bookmarks, old app installs)
    'default' => env('SAAS_DEFAULT_SOCIETY', 'block19'),
    'trial_days' => 14,
    // first path segments that can never be a society address
    'reserved' => ['api', '_p', 'files', 'build', 'up', 'system', 'platform', 'register', 'login', 'logout', 'storage', 'admin', 'www', 'app', 'help', 'support', 'pricing', 'about', 'terms', 'privacy', 'sw.js', 'icon.svg', 'manifest.webmanifest', 'favicon.ico', 'install.php'],
];
