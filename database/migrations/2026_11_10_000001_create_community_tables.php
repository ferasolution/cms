<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Households (HH) — also drives the 3D community map
        Schema::create('houses', function (Blueprint $table) {
            $table->id();
            $table->string('house_no');
            $table->string('block')->nullable();
            $table->string('street')->nullable();
            $table->string('owner_name')->nullable();
            $table->string('owner_phone')->nullable();
            $table->string('type')->default('house'); // house, flat, commercial, plot
            $table->integer('grid_x')->default(0);
            $table->integer('grid_y')->default(0);
            $table->integer('floors')->default(1);
            $table->decimal('monthly_maintenance', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('resident')->after('email');
            $table->string('phone')->nullable()->after('role');
            $table->foreignId('house_id')->nullable()->after('phone')->constrained()->nullOnDelete();
            $table->boolean('active')->default(true)->after('house_id');
        });

        // 1. Security
        Schema::create('visitors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('cnic')->nullable();
            $table->string('phone')->nullable();
            $table->string('category')->default('visitor'); // visitor, guest, worker, relative, friend, delivery, other
            $table->string('purpose')->nullable();
            $table->string('vehicle_no')->nullable();
            $table->unsignedInteger('persons')->default(1);
            $table->string('photo_path')->nullable();
            $table->string('video_path')->nullable();
            $table->timestamp('entry_at')->nullable();
            $table->timestamp('exit_at')->nullable();
            $table->string('gate')->nullable();
            $table->text('remarks')->nullable();
            $table->foreignId('logged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // 2. Inventory
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('sku')->nullable();
            $table->string('category')->nullable();
            $table->integer('quantity')->default(0);
            $table->integer('min_quantity')->default(0);
            $table->string('unit')->default('pcs');
            $table->string('location')->nullable();
            $table->decimal('unit_cost', 12, 2)->default(0);
            $table->timestamps();
        });
        Schema::create('inventory_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity');
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('issued_to');
            $table->string('issued_to_contact')->nullable();
            $table->string('purpose');
            $table->timestamp('issued_at')->nullable();
            $table->date('expected_return')->nullable();
            $table->timestamp('returned_at')->nullable();
            $table->integer('returned_quantity')->default(0);
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        // 3. Library
        Schema::create('books', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('author')->nullable();
            $table->string('isbn')->nullable();
            $table->string('category')->nullable();
            $table->string('shelf')->nullable();
            $table->unsignedInteger('copies')->default(1);
            $table->unsignedInteger('available')->default(1);
            $table->string('ebook_path')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });
        Schema::create('book_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('requested'); // requested, issued, returned, rejected
            $table->timestamp('issued_at')->nullable();
            $table->date('due_at')->nullable();
            $table->timestamp('returned_at')->nullable();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('fine', 10, 2)->default(0);
            $table->text('note')->nullable();
            $table->timestamps();
        });

        // 4. Finance
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->string('type'); // revenue, expense, salary
            $table->string('category'); // event, subscription, penalty, dues, fine, maintenance, salary, utilities, repair, other
            $table->decimal('amount', 14, 2);
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('staff_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('party')->nullable();
            $table->string('reference')->nullable();
            $table->string('period')->nullable(); // e.g. 2026-11 for maintenance / salary month
            $table->string('status')->default('paid'); // paid, pending
            $table->date('date');
            $table->string('receipt_path')->nullable();
            $table->text('description')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('expense_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->decimal('amount', 14, 2);
            $table->string('category')->default('other');
            $table->text('purpose')->nullable();
            $table->string('status')->default('pending'); // pending, approved, rejected, paid
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->string('receipt_path')->nullable();
            $table->timestamps();
        });

        // 5. Events
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique()->nullable();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->string('type')->default('private'); // private, wedding, birthday, religious, community, sports, other
            $table->string('venue');
            $table->date('date');
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedInteger('guests')->default(0);
            $table->unsignedInteger('vehicles')->default(0);
            $table->text('details')->nullable();
            $table->decimal('charges', 12, 2)->default(0);
            $table->json('charge_breakdown')->nullable();
            $table->string('status')->default('pending'); // pending, approved, rejected, completed
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_hour_alerted_at')->nullable();
            $table->timestamp('end_alerted_at')->nullable();
            $table->timestamps();
        });

        // 6. Complaints
        Schema::create('complaints', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_no')->unique()->nullable();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('category'); // plumbing, electrical, cleaning, security, gardening, construction, other
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('priority')->default('normal'); // low, normal, high, urgent
            $table->string('status')->default('open'); // open, assigned, in_progress, resolved, closed
            $table->string('assigned_worker')->nullable();
            $table->string('worker_phone')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->text('resolution')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedTinyInteger('rating')->nullable();
            $table->string('photo_path')->nullable();
            $table->timestamps();
        });

        // 7. NOC
        Schema::create('nocs', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique()->nullable();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // sale_transfer, construction, renovation, utility_connection, rental, other
            $table->text('details')->nullable();
            $table->string('status')->default('submitted'); // submitted, under_review, documents_required, approved, completed, rejected
            $table->text('remarks')->nullable();
            $table->string('certificate_path')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
        Schema::create('noc_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('noc_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('path');
            $table->timestamps();
        });
        Schema::create('noc_status_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('noc_id')->constrained()->cascadeOnDelete();
            $table->string('status');
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        // 8. Record room
        Schema::create('record_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('house_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('category')->default('general'); // ownership, allotment, transfer, map, utility, legal, general
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Cross-cutting: activity / audit feed + realtime alerts
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('module');
            $table->string('action');
            $table->string('description');
            $table->nullableMorphs('subject');
            $table->timestamps();
            $table->index(['module', 'created_at']);
        });
        Schema::create('alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete(); // direct
            $table->string('role')->nullable(); // or broadcast to a role
            $table->string('module');
            $table->string('level')->default('info'); // info, success, warning, danger
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('link')->nullable();
            $table->timestamps();
        });
        Schema::create('alert_reads', function (Blueprint $table) {
            $table->foreignId('alert_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['alert_id', 'user_id']);
        });
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->text('value')->nullable();
        });
    }

    public function down(): void
    {
        foreach (['settings', 'alert_reads', 'alerts', 'activity_logs', 'record_files', 'noc_status_logs', 'noc_documents', 'nocs',
            'complaints', 'events', 'expense_requests', 'transactions', 'book_issues', 'books', 'inventory_issues',
            'inventory_items', 'visitors'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('house_id');
            $table->dropColumn(['role', 'phone', 'active']);
        });
        Schema::dropIfExists('houses');
    }
};
