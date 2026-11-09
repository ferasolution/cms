<?php
/**
 * One-time web installer for shared hosting (Bluehost / cPanel) where there is no SSH.
 * Writes .env, creates the database tables, the ADH admin account and (optionally) demo data.
 * Locks itself after a successful run (storage/installed.lock).
 */
declare(strict_types=1);

$base = dirname(__DIR__);
$lock = $base.'/storage/installed.lock';
$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

function page(string $body): never
{
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Install · Community Portal</title><style>
    body{font-family:system-ui,sans-serif;background:#fbf7f0;color:#10201f;margin:0;padding:24px}main{max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 8px 30px -12px #0002}
    h1{margin:0 0 4px;font-size:22px}p{color:#555}label{display:block;font-size:12px;font-weight:600;color:#666;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:10px;font-size:14px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:15px;margin:22px 0 0;padding-top:16px;border-top:1px solid #eee}button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:12px;background:#17635e;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
    .ok{color:#15803d}.bad{color:#b91c1c}.err{background:#fef2f2;color:#991b1b;padding:12px;border-radius:10px;white-space:pre-wrap}.box{background:#eef7f6;padding:14px;border-radius:12px;word-break:break-all}code{background:#0001;padding:2px 6px;border-radius:6px}li{margin:4px 0}
    </style></head><body><main>'.$body.'</main></body></html>';
    exit;
}

if (is_file($lock)) {
    page('<h1>Already installed ✅</h1><p>The portal is installed. <a href="/">Open the portal</a>.</p><p style="font-size:12px">To reinstall, delete <code>storage/installed.lock</code> via cPanel File Manager.</p>');
}

// ---- Requirement checks ----
$checks = [
    'PHP 8.3 or newer (now '.PHP_VERSION.')' => version_compare(PHP_VERSION, '8.3.0', '>='),
    'pdo_mysql extension' => extension_loaded('pdo_mysql'),
    'mbstring extension' => extension_loaded('mbstring'),
    'openssl extension' => extension_loaded('openssl'),
    'fileinfo extension (file uploads)' => extension_loaded('fileinfo'),
    'App files uploaded (vendor folder)' => is_file($base.'/vendor/autoload.php'),
    'storage/ is writable' => is_writable($base.'/storage'),
    'bootstrap/cache is writable' => is_writable($base.'/bootstrap/cache'),
    'Project folder is writable (to create .env)' => is_writable($base) || is_writable($base.'/.env'),
];
$allOk = ! in_array(false, $checks, true);
$list = '<ul>'.implode('', array_map(fn ($k, $v) => '<li class="'.($v ? 'ok' : 'bad').'">'.($v ? '✓' : '✗').' '.$h($k).'</li>', array_keys($checks), $checks)).'</ul>';

$error = '';
$v = array_map('strval', $_POST) + ['app_name' => 'Community Portal', 'app_url' => 'https://'.($_SERVER['HTTP_HOST'] ?? 'cms.ferasolution.com'), 'db_host' => 'localhost', 'db_port' => '3306', 'db_name' => '', 'db_user' => '', 'db_pass' => '', 'admin_name' => 'Super Admin', 'admin_email' => '', 'admin_pass' => '', 'demo' => '1'];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $v['demo'] = isset($_POST['demo']) ? '1' : '';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $allOk) {
    try {
        if (strlen($v['admin_pass']) < 8) {
            throw new RuntimeException('Admin password must be at least 8 characters.');
        }
        if (! filter_var($v['admin_email'], FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Please enter a valid admin email.');
        }
        // 1. Test database connection
        new PDO("mysql:host={$v['db_host']};port={$v['db_port']};dbname={$v['db_name']};charset=utf8mb4", $v['db_user'], $v['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]);

        // 2. Write .env
        $q = fn ($s) => '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], (string) $s).'"';
        $deployToken = bin2hex(random_bytes(24));
        $env = implode("\n", [
            'APP_NAME='.$q($v['app_name']),
            'APP_ENV=production',
            'APP_KEY=base64:'.base64_encode(random_bytes(32)),
            'APP_DEBUG=false',
            'APP_URL='.rtrim($v['app_url'], '/'),
            'APP_TIMEZONE=Asia/Karachi',
            '',
            'LOG_CHANNEL=daily',
            'LOG_LEVEL=error',
            '',
            'DB_CONNECTION=mysql',
            'DB_HOST='.$q($v['db_host']),
            'DB_PORT='.$q($v['db_port']),
            'DB_DATABASE='.$q($v['db_name']),
            'DB_USERNAME='.$q($v['db_user']),
            'DB_PASSWORD='.$q($v['db_pass']),
            '',
            'SESSION_DRIVER=database',
            'SESSION_LIFETIME=720',
            'SESSION_SECURE_COOKIE='.(str_starts_with($v['app_url'], 'https') ? 'true' : 'false'),
            'CACHE_STORE=database',
            'QUEUE_CONNECTION=sync',
            'FILESYSTEM_DISK=local',
            'MAIL_MAILER=log',
            '',
            'DEPLOY_TOKEN='.$deployToken,
            '',
        ]);
        if (file_put_contents($base.'/.env', $env) === false) {
            throw new RuntimeException('Could not write .env file — check folder permissions.');
        }
        @chmod($base.'/.env', 0640);

        // 3. Boot Laravel and run migrations / seed / admin
        @unlink($base.'/bootstrap/cache/config.php');
        require $base.'/vendor/autoload.php';
        $app = require $base.'/bootstrap/app.php';
        $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
        $kernel->bootstrap();
        $kernel->call('migrate', ['--force' => true]);
        $log = $kernel->output();
        if (! empty($v['demo'])) {
            $kernel->call('db:seed', ['--class' => 'Database\\Seeders\\DemoSeeder', '--force' => true]);
            $log .= $kernel->output();
        }
        App\Models\User::updateOrCreate(['email' => strtolower($v['admin_email'])], ['name' => $v['admin_name'], 'role' => 'super_admin', 'password' => $v['admin_pass'], 'active' => true]);
        file_put_contents($lock, date('c'));

        page('<h1>Installed successfully 🎉</h1><p>Your portal is ready at <a href="/">'.$h($v['app_url']).'</a>. Sign in with the admin email and password you just set.</p>'
            .(! empty($v['demo']) ? '<p>Demo logins (password <code>password</code>): admin@demo.local (Admin), manager@ / security@ / guard@ / finance@ / hr@ / gym@ / inventory@ / librarian@demo.local (Editors), resident@demo.local (User) — remove or change them before going live.</p>' : '')
            .'<h2>One last step — automatic deploys</h2><p>Add this as a GitHub secret named <code>DEPLOY_TOKEN</code> (repo → Settings → Secrets and variables → Actions) so every update also runs database changes automatically:</p><div class="box"><code>'.$deployToken.'</code></div>'
            .'<p style="font-size:12px">This page is now locked. Copy the token now — it is also saved in the .env file.</p>');
    } catch (Throwable $e) {
        $error = $e->getMessage();
        if (isset($env) && ! is_file($lock)) {
            @unlink($base.'/.env'); // let the user retry cleanly
        }
    }
}

$f = fn ($name, $label, $type = 'text', $extra = '') => '<div><label>'.$label.'</label><input type="'.$type.'" name="'.$name.'" value="'.($type === 'password' ? '' : $h($v[$name])).'" '.$extra.'></div>';
page('<h1>Community Portal — Setup</h1><p>Runs once. You need the MySQL database details from cPanel → <b>MySQL Databases</b> (create a database and a user, and add the user to the database with ALL PRIVILEGES).</p>'
    .'<h2>Server check</h2>'.$list
    .($allOk ? '' : '<p class="bad">Fix the items marked ✗ first (PHP version: cPanel → MultiPHP Manager → PHP 8.3).</p>')
    .($error ? '<div class="err">'.$h($error).'</div>' : '')
    .'<form method="post">'
    .'<h2>Portal</h2><div class="row">'.$f('app_name', 'Community / portal name', 'text', 'required').$f('app_url', 'Website URL', 'url', 'required').'</div>'
    .'<h2>Database</h2><div class="row">'.$f('db_host', 'Host', 'text', 'required').$f('db_port', 'Port', 'text', 'required').'</div><div class="row">'.$f('db_name', 'Database name', 'text', 'required placeholder="cpaneluser_cms"').$f('db_user', 'Database user', 'text', 'required').'</div>'.$f('db_pass', 'Database password', 'password')
    .'<h2>Super Admin account</h2><div class="row">'.$f('admin_name', 'Name', 'text', 'required').$f('admin_email', 'Email', 'email', 'required').'</div>'.$f('admin_pass', 'Password (min 8 characters)', 'password', 'required minlength="8"')
    .'<label style="display:flex;gap:8px;align-items:center;font-size:14px;color:#333;margin-top:16px"><input type="checkbox" name="demo" value="1" style="width:auto" '.(! empty($v['demo']) ? 'checked' : '').'> Load demo data (72 houses, sample records in every module)</label>'
    .'<button '.($allOk ? '' : 'disabled').'>Install portal</button></form>');
