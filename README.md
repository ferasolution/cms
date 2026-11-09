# Community Management System

Web portal (installable on Android / iOS as an app) for running a housing community. Built by **Fera Solution**.

**Stack:** Laravel 13 (PHP 8.3, MySQL) · React 19 · Three.js (3D community map) · Tailwind CSS
**Hosting:** Bluehost cPanel shared hosting, auto-deployed from GitHub on every push to `main`.

## Modules

| # | Module | Who uses it |
|---|--------|-------------|
| 1 | **Security** — visitors, guests, workers, relatives & friends per household; photo + video at entry; purpose; duration of stay; exit record | Security (officials only) |
| 2 | **Inventory** — stock, issuance form (who issued, who took it, purpose), returns, low-stock alerts | Inventory handler |
| 3 | **Library** — catalogue, e-books (digital library), issue requests, issuance record, fines | Librarian, residents |
| 4 | **Finance** — salaries, revenue (events, subscriptions, penalties, dues, fines), monthly maintenance, expenses, receipts, expense requests approved by ADH | Finance; all officials can request expenses |
| 5 | **Events** — applications, calculator, event codes, allowance report, gate verification, **alarm at security when the time is over** | Manager, residents, security |
| 6 | **Complaints** — online complaints, manager aligns workers, resolution report, ratings | Manager, residents |
| 7 | **NOC** — document upload with checklist, every status change logged & notified, certificate | Manager, residents |
| 8 | **Record room** — every household's files in e-format; owners see only their own | Manager, residents |

The **ADH (admin) account** is the parental account: it sees every module, the live activity log, all alerts, and approves expense requests.

**Live updates:** the portal polls for alerts every 8 seconds (works on shared hosting with no extra services). Event time checks run on that poll, so no cron job is needed. Danger alerts ring an alarm sound.

## Roles

`admin` (ADH) · `manager` · `security` · `inventory` · `librarian` · `finance` · `resident` — see `app/Support/Access.php`.

## Deploy pipeline

Push to `main` → GitHub Actions runs the tests → builds (`composer install --no-dev`, `npm run build`) → uploads by FTP → calls `/system/deploy` to run new migrations.

GitHub secrets (repo → Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FTP_SERVER` | e.g. `ftp.ferasolution.com` |
| `FTP_USERNAME` / `FTP_PASSWORD` | the FTP account for the subdomain folder |
| `DEPLOY_TOKEN` | shown by the installer after first setup |
| optional `FTP_DIR` | server folder if the FTP account's home is not the app folder (default `./`) |
| optional `FTP_PROTOCOL` | `ftps` (default) or `ftp` if FTPS fails |
| optional `APP_URL` | default `https://cms.ferasolution.com` |

### First-time server setup

1. cPanel → **Domains**: `cms.ferasolution.com` document root = the folder the FTP account uploads to (the root `.htaccess` forwards into `/public`; pointing it at `/public` directly also works).
2. cPanel → **MultiPHP Manager**: PHP **8.3** for the subdomain.
3. cPanel → **MySQL Databases**: create a database + user, give the user ALL PRIVILEGES.
4. After the first successful deploy, open `https://cms.ferasolution.com/install.php`, enter the DB details and the ADH account. Copy the `DEPLOY_TOKEN` it shows into GitHub secrets.
5. cPanel → **SSL/TLS Status**: make sure the subdomain has a certificate (needed for the installable mobile app).

## Local development

```bash
composer install && npm install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed      # demo data, every demo password is "password"
npm run dev & php artisan serve
php artisan test
```
