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

        Route::get('map', [Api\HouseController::class, 'map']);
        Route::apiResource('houses', Api\HouseController::class);
        Route::apiResource('users', Api\UserController::class)->except('show');

        // 1. Security
        Route::get('visitors/stats', [Api\VisitorController::class, 'stats']);
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

        // 8. Record room
        Route::get('records', [Api\RecordController::class, 'index']);
        Route::post('records', [Api\RecordController::class, 'store']);
        Route::delete('records/{record}', [Api\RecordController::class, 'destroy']);
    });

    Route::any('{any}', fn () => response()->json(['message' => 'Not found.'], 404))->where('any', '.*');
});

Route::post('system/deploy', [SystemController::class, 'deploy'])->withoutMiddleware(ValidateCsrfToken::class)->middleware('throttle:10,1');

Route::get('files/{path}', [Api\FileController::class, 'show'])->where('path', '.*')->middleware('auth');

// Everything else is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api|files|build|up|system).*$')->name('login');
