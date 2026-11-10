<?php

use App\Http\Controllers\Api;
use App\Http\Controllers\SystemController;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\Route;

/*
| JSON API for the React portal. Uses the normal web session (cookie) auth, so it works on
| shared hosting with no extra services. All routes live under /api.
*/
Route::prefix('api')->group(function () {
    Route::post('login', [Api\AuthController::class, 'login'])->name('login.attempt');
    Route::post('logout', [Api\AuthController::class, 'logout']);

    Route::middleware('auth')->group(function () {
        Route::get('me', [Api\AuthController::class, 'me']);
        Route::put('profile', [Api\AuthController::class, 'updateProfile']);
        Route::get('dashboard', [Api\DashboardController::class, 'index']);
        Route::get('activity', [Api\DashboardController::class, 'activity']);

        Route::get('alerts', [Api\AlertController::class, 'index']);
        Route::post('alerts/read-all', [Api\AlertController::class, 'readAll']);
        Route::post('alerts/{alert}/read', [Api\AlertController::class, 'read']);

        Route::get('search', Api\SearchController::class);
        Route::get('settings', [Api\SettingsController::class, 'show']);
        Route::put('settings', [Api\SettingsController::class, 'update']);
        Route::post('settings/site-plan', [Api\SettingsController::class, 'applySitePlan']);
        Route::put('settings/geo', [Api\SettingsController::class, 'saveGeo']);
        Route::get('automations', [Api\SettingsController::class, 'automations']);
        Route::post('automations/run', [Api\SettingsController::class, 'runAutomations']);

        Route::get('map', [Api\HouseController::class, 'map']);
        Route::apiResource('houses', Api\HouseController::class);
        Route::get('users/meta', [Api\UserController::class, 'meta']);
        Route::get('users/{user}/history', [Api\UserController::class, 'history']);
        Route::apiResource('users', Api\UserController::class)->except('show');

        // Communication & emergency
        Route::get('announcements', [Api\CommsController::class, 'announcements']);
        Route::post('announcements', [Api\CommsController::class, 'storeAnnouncement']);
        Route::put('announcements/{announcement}', [Api\CommsController::class, 'updateAnnouncement']);
        Route::post('announcements/{announcement}/read', [Api\CommsController::class, 'readAnnouncement']);
        Route::delete('announcements/{announcement}', [Api\CommsController::class, 'destroyAnnouncement']);
        Route::get('sos', [Api\CommsController::class, 'sosList']);
        Route::post('sos', [Api\CommsController::class, 'sos'])->middleware('throttle:10,1');
        Route::post('sos/{sos}', [Api\CommsController::class, 'sosUpdate']);

        // 1. Security
        Route::get('visitors/stats', [Api\VisitorController::class, 'stats']);
        Route::post('visitors/{visitor}/respond', [Api\VisitorController::class, 'respond']);
        Route::post('visitors/{visitor}/admit', [Api\VisitorController::class, 'admit']);
        Route::get('gate/passes', [Api\GateController::class, 'passes']);
        Route::post('gate/passes', [Api\GateController::class, 'storePass']);
        Route::post('gate/passes/{pass}/cancel', [Api\GateController::class, 'cancelPass']);
        Route::post('gate/scan', [Api\GateController::class, 'scan']);
        Route::get('gate/watchlist', [Api\GateController::class, 'watchlist']);
        Route::post('gate/watchlist', [Api\GateController::class, 'storeWatch']);
        Route::delete('gate/watchlist/{watch}', [Api\GateController::class, 'destroyWatch']);
        Route::get('gate/vehicles', [Api\GateController::class, 'vehicles']);
        Route::post('gate/vehicles', [Api\GateController::class, 'storeVehicle']);
        Route::put('gate/vehicles/{vehicle}', [Api\GateController::class, 'updateVehicle']);
        Route::delete('gate/vehicles/{vehicle}', [Api\GateController::class, 'destroyVehicle']);
        Route::get('gate/incidents', [Api\GateController::class, 'incidents']);
        Route::post('gate/incidents', [Api\GateController::class, 'storeIncident']);
        Route::put('gate/incidents/{incident}', [Api\GateController::class, 'updateIncident']);
        Route::post('visitors/{visitor}/checkout', [Api\VisitorController::class, 'checkout']);
        Route::post('visitors/{visitor}', [Api\VisitorController::class, 'update']); // multipart update
        Route::apiResource('visitors', Api\VisitorController::class)->except(['show', 'update']);

        // 2. Inventory
        Route::get('inventory/issues', [Api\InventoryController::class, 'issues']);
        Route::post('inventory/issues', [Api\InventoryController::class, 'issue']);
        Route::post('inventory/issues/{issue}/return', [Api\InventoryController::class, 'returnIssue']);
        Route::get('inventory', [Api\InventoryController::class, 'index']);
        Route::post('inventory', [Api\InventoryController::class, 'store']);
        Route::put('inventory/{item}', [Api\InventoryController::class, 'update']);
        Route::delete('inventory/{item}', [Api\InventoryController::class, 'destroy']);

        // 3. Library
        Route::get('library/books', [Api\LibraryController::class, 'books']);
        Route::get('library/categories', [Api\LibraryController::class, 'categories']);
        Route::post('library/books', [Api\LibraryController::class, 'storeBook']);
        Route::post('library/books/{book}', [Api\LibraryController::class, 'updateBook']);
        Route::delete('library/books/{book}', [Api\LibraryController::class, 'destroyBook']);
        Route::post('library/books/{book}/request', [Api\LibraryController::class, 'requestBook']);
        Route::get('library/issues', [Api\LibraryController::class, 'issues']);
        Route::post('library/issues', [Api\LibraryController::class, 'issue']);
        Route::post('library/issues/{issue}/reject', [Api\LibraryController::class, 'reject']);
        Route::post('library/issues/{issue}/return', [Api\LibraryController::class, 'returnBook']);

        // 4. Finance
        Route::get('finance/my', [Api\FinanceController::class, 'my']);
        Route::get('finance/transactions', [Api\FinanceController::class, 'transactions']);
        Route::post('finance/transactions', [Api\FinanceController::class, 'store']);
        Route::delete('finance/transactions/{transaction}', [Api\FinanceController::class, 'destroy']);
        Route::get('finance/summary', [Api\FinanceController::class, 'summary']);
        Route::get('finance/maintenance', [Api\FinanceController::class, 'maintenance']);
        Route::get('finance/salaries', [Api\FinanceController::class, 'salaries']);
        Route::get('finance/expense-requests', [Api\FinanceController::class, 'expenseRequests']);
        Route::post('finance/expense-requests', [Api\FinanceController::class, 'storeExpenseRequest']);
        Route::post('finance/expense-requests/{expenseRequest}/review', [Api\FinanceController::class, 'reviewExpenseRequest']);
        Route::post('finance/expense-requests/{expenseRequest}/pay', [Api\FinanceController::class, 'payExpenseRequest']);

        // 5. Events
        Route::get('events/rates', [Api\EventController::class, 'getRates']);
        Route::put('events/rates', [Api\EventController::class, 'saveRates']);
        Route::post('events/quote', [Api\EventController::class, 'quote']);
        Route::get('events/verify/{code}', [Api\EventController::class, 'verify']);
        Route::post('events/{event}/status', [Api\EventController::class, 'setStatus']);
        Route::apiResource('events', Api\EventController::class)->except('show');

        // 6. Complaints
        Route::get('complaints/report', [Api\ComplaintController::class, 'report']);
        Route::post('complaints/{complaint}/assign', [Api\ComplaintController::class, 'assign']);
        Route::post('complaints/{complaint}/status', [Api\ComplaintController::class, 'setStatus']);
        Route::post('complaints/{complaint}/rate', [Api\ComplaintController::class, 'rate']);
        Route::get('complaints', [Api\ComplaintController::class, 'index']);
        Route::post('complaints', [Api\ComplaintController::class, 'store']);

        // 7. NOC
        Route::get('noc/checklists', [Api\NocController::class, 'checklists']);
        Route::get('noc', [Api\NocController::class, 'index']);
        Route::post('noc', [Api\NocController::class, 'store']);
        Route::get('noc/{noc}', [Api\NocController::class, 'show']);
        Route::post('noc/{noc}/documents', [Api\NocController::class, 'uploadDocs']);
        Route::post('noc/{noc}/status', [Api\NocController::class, 'setStatus']);

        // 9. Staff CRM
        Route::get('crm/workspace', [Api\CrmController::class, 'workspace']);
        Route::post('crm/punch', [Api\CrmController::class, 'myPunch']);
        Route::post('crm/punch-for', [Api\CrmController::class, 'punchFor']);
        Route::get('crm/employees', [Api\CrmController::class, 'employees']);
        Route::post('crm/employees', [Api\CrmController::class, 'storeEmployee']);
        Route::put('crm/employees/{employee}', [Api\CrmController::class, 'updateEmployee']);
        Route::delete('crm/employees/{employee}', [Api\CrmController::class, 'destroyEmployee']);
        Route::get('crm/attendance', [Api\CrmController::class, 'attendance']);
        Route::get('crm/report', [Api\CrmController::class, 'report']);
        Route::get('crm/leaves', [Api\CrmController::class, 'leaves']);
        Route::post('crm/leaves', [Api\CrmController::class, 'storeLeave']);
        Route::post('crm/leaves/{leave}/review', [Api\CrmController::class, 'reviewLeave']);
        Route::get('crm/tasks', [Api\CrmController::class, 'tasks']);
        Route::post('crm/tasks', [Api\CrmController::class, 'storeTask']);
        Route::post('crm/tasks/{task}', [Api\CrmController::class, 'updateTask']);

        // 10. Gym & Club
        Route::get('gym/stats', [Api\GymController::class, 'stats']);
        Route::get('gym/plans', [Api\GymController::class, 'plans']);
        Route::post('gym/plans', [Api\GymController::class, 'savePlan']);
        Route::put('gym/plans/{plan}', [Api\GymController::class, 'savePlan']);
        Route::get('gym/members', [Api\GymController::class, 'members']);
        Route::post('gym/members', [Api\GymController::class, 'storeMember']);
        Route::put('gym/members/{member}', [Api\GymController::class, 'updateMember']);
        Route::post('gym/members/{member}/pay', [Api\GymController::class, 'createPayment']);
        Route::post('gym/members/{member}/cash', [Api\GymController::class, 'cashPayment']);
        Route::post('gym/scan', [Api\GymController::class, 'scan']);
        Route::get('gym/checkins', [Api\GymController::class, 'checkins']);
        Route::get('gym/payments', [Api\GymController::class, 'payments']);
        Route::post('gym/payments/{payment}/proof', [Api\GymController::class, 'uploadProof']);
        Route::post('gym/payments/{payment}/confirm', [Api\GymController::class, 'confirmPayment']);

        // 8. Record room
        Route::get('records', [Api\RecordController::class, 'index']);
        Route::post('records', [Api\RecordController::class, 'store']);
        Route::delete('records/{record}', [Api\RecordController::class, 'destroy']);
    });

    Route::any('{any}', fn () => response()->json(['message' => 'Not found.'], 404))->where('any', '.*');
});

Route::match(['get', 'post'], 'system/deploy', [SystemController::class, 'deploy'])->withoutMiddleware(ValidateCsrfToken::class)->middleware('throttle:10,1');

Route::get('files/{path}', [Api\FileController::class, 'show'])->where('path', '.*')->middleware('auth');

// Everything else is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api|files|build|up|system).*$')->name('login');
