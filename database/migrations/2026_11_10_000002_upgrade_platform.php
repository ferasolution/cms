<?php

use App\Support\Access;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * v2: Super Admin / Admin / Editor / User access, security upgrades (passes, approvals, watchlist,
 * vehicles, incidents), staff CRM, gym & club, announcements, SOS and settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('permissions')->nullable()->after('role');
            $table->string('designation')->nullable()->after('permissions');
            $table->string('household_role')->nullable()->after('house_id'); // owner, family, tenant
            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();
            $table->string('theme', 10)->nullable();
        });

        // Convert the v1 roles to the new model.
        $map = [
            'admin' => ['super_admin', null, []],
            'manager' => ['editor', 'Community Manager', Access::TEMPLATES['Community Manager']],
            'security' => ['editor', 'Security Manager', Access::TEMPLATES['Security Manager']],
            'inventory' => ['editor', 'Inventory Manager', Access::TEMPLATES['Inventory Manager']],
            'librarian' => ['editor', 'Librarian', Access::TEMPLATES['Librarian']],
            'finance' => ['editor', 'Finance Manager', Access::TEMPLATES['Finance Manager']],
            'resident' => ['user', 'Household Owner', []],
        ];
        foreach ($map as $old => [$role, $designation, $perms]) {
            DB::table('users')->where('role', $old)->update(['role' => $role, 'designation' => $designation, 'permissions' => json_encode($perms)]);
        }
        DB::table('users')->where('role', 'user')->update(['household_role' => 'owner']);

        Schema::table('alerts', function (Blueprint $table) {
            $table->string('audience_module', 30)->nullable()->after('role');
            $table->unsignedTinyInteger('audience_level')->default(1)->after('audience_module');
            $table->index(['audience_module', 'audience_level']);
        });
        $roleMap = ['security' => ['security', 2], 'manager' => ['complaints', 3], 'librarian' => ['library', 2], 'inventory' => ['inventory', 2], 'finance' => ['finance', 2], 'admin' => ['users', 3]];
        foreach ($roleMap as $old => [$m, $l]) {
            DB::table('alerts')->where('role', $old)->update(['audience_module' => $m, 'audience_level' => $l]);
        }

        // ---- Security upgrades ----
        Schema::table('visitors', function (Blueprint $table) {
            $table->string('status')->default('inside')->after('category'); // awaiting, inside, exited, rejected
            $table->timestamp('expected_exit_at')->nullable()->after('exit_at');
            $table->foreignId('pass_id')->nullable()->after('house_id');
            $table->foreignId('vehicle_id')->nullable();
            $table->foreignId('responded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('responded_at')->nullable();
            $table->string('response_note')->nullable();
            $table->timestamp('overstay_alerted_at')->nullable();
            $table->boolean('watchlist_hit')->default(false);
        });
        DB::table('visitors')->whereNotNull('exit_at')->update(['status' => 'exited']);

        Schema::create('visitor_passes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('visitor_name');
            $table->string('phone')->nullable();
            $table->string('cnic')->nullable();
            $table->string('category')->default('guest');
            $table->string('purpose')->nullable();
            $table->string('vehicle_no')->nullable();
            $table->unsignedInteger('persons')->default(1);
            $table->timestamp('valid_from');
            $table->timestamp('valid_until');
            $table->unsignedInteger('max_stay_minutes')->default(240);
            $table->boolean('multi_use')->default(false);
            $table->string('status')->default('active'); // active, used, expired, cancelled
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('watchlist', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('cnic')->nullable()->index();
            $table->string('phone')->nullable()->index();
            $table->string('vehicle_no')->nullable()->index();
            $table->string('level')->default('blocked'); // blocked, watch
            $table->string('reason');
            $table->date('until')->nullable();
            $table->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->string('plate')->index();
            $table->string('type')->default('car'); // car, bike, van, truck
            $table->string('make')->nullable();
            $table->string('color')->nullable();
            $table->string('sticker_no')->nullable();
            $table->string('parking_slot')->nullable();
            $table->string('owner_name')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('incidents', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique()->nullable();
            $table->string('type'); // theft, suspicious, accident, fire, medical, vandalism, unauthorized_entry, other
            $table->string('severity')->default('medium'); // low, medium, high, critical
            $table->string('location')->nullable();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->text('description');
            $table->string('photo_path')->nullable();
            $table->string('status')->default('open'); // open, investigating, resolved
            $table->text('action_taken')->nullable();
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        // ---- Events: QR guest passes / configurable alerts ----
        Schema::table('events', function (Blueprint $table) {
            $table->unsignedInteger('grace_minutes')->default(15);
            $table->timestamp('organizer_alerted_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->unsignedInteger('checked_in')->default(0);
            $table->unsignedTinyInteger('rating')->nullable();
        });

        // ---- Communication & emergency ----
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('body');
            $table->string('category')->default('general'); // general, maintenance, utility, event, emergency
            $table->string('priority')->default('normal'); // normal, important, emergency
            $table->string('audience')->default('all'); // all, residents, staff, block:A
            $table->boolean('pinned')->default(false);
            $table->timestamp('expires_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('announcement_reads', function (Blueprint $table) {
            $table->foreignId('announcement_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('read_at')->nullable();
            $table->primary(['announcement_id', 'user_id']);
        });
        Schema::create('sos_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // medical, fire, security, other
            $table->string('message')->nullable();
            $table->string('status')->default('active'); // active, responding, resolved
            $table->foreignId('responder_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('responded_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->timestamps();
        });

        // ---- Staff CRM ----
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('department');
            $table->string('designation')->nullable();
            $table->string('phone')->nullable();
            $table->string('cnic')->nullable();
            $table->string('emergency_contact')->nullable();
            $table->date('joined_on')->nullable();
            $table->date('left_on')->nullable();
            $table->time('shift_start')->default('09:00');
            $table->time('shift_end')->default('17:00');
            $table->decimal('basic_salary', 12, 2)->default(0);
            $table->string('rfid_card')->nullable()->index();
            $table->string('status')->default('active'); // active, on_leave, terminated
            $table->timestamps();
        });
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->timestamp('check_in')->nullable();
            $table->timestamp('check_out')->nullable();
            $table->unsignedInteger('minutes_worked')->default(0);
            $table->unsignedInteger('late_minutes')->default(0);
            $table->unsignedInteger('overtime_minutes')->default(0);
            $table->string('method')->default('web'); // web, rfid, manual
            $table->string('note')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'date']);
        });
        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('casual'); // casual, sick, annual, unpaid
            $table->date('from');
            $table->date('to');
            $table->text('reason')->nullable();
            $table->string('status')->default('pending'); // pending, approved, rejected
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('department')->nullable();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('priority')->default('normal');
            $table->string('status')->default('todo'); // todo, in_progress, done
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        // ---- Gym & Club ----
        Schema::create('gym_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type')->default('individual'); // individual, family, trial, guest
            $table->unsignedInteger('duration_days')->default(30);
            $table->decimal('price', 12, 2)->default(0);
            $table->string('facilities')->nullable(); // comma list: gym, pool, courts…
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('gym_members', function (Blueprint $table) {
            $table->id();
            $table->string('member_no')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('gym_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('rfid_card')->nullable()->unique();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status')->default('active'); // active, frozen, cancelled
            $table->boolean('card_blocked')->default(false);
            $table->timestamp('due_alerted_at')->nullable();
            $table->timestamps();
        });
        Schema::create('gym_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gym_member_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('reference')->unique();
            $table->string('method')->default('cash'); // cash, qr, bank, online
            $table->string('status')->default('pending'); // pending, paid, rejected
            $table->unsignedInteger('days')->default(30);
            $table->string('proof_path')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('gym_checkins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gym_member_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('card')->nullable();
            $table->string('method')->default('rfid');
            $table->boolean('allowed');
            $table->string('reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['gym_checkins', 'gym_payments', 'gym_members', 'gym_plans', 'tasks', 'leave_requests', 'attendances', 'employees',
            'sos_alerts', 'announcement_reads', 'announcements', 'incidents', 'vehicles', 'watchlist', 'visitor_passes'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
