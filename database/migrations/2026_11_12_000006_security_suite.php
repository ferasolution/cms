<?php

use App\Models\User;
use App\Services\SecurityDemo;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Security suite: walk-in entry with QR exit receipt, vehicle entry log, domestic staff verification
 * & attendance, emergency priority access, CCTV cameras, guard patrol checkpoints and guard shifts
 * with handover.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('visitors', function (Blueprint $table) {
            $table->string('token', 20)->nullable()->unique();      // GV-XXXXXX printed on the receipt, scanned at exit
            $table->string('vehicle_type', 20)->nullable();
            $table->string('access_type', 20)->default('normal');   // normal, temporary, emergency
            $table->string('emergency_service', 30)->nullable();    // ambulance, fire, police, rescue, utility
            $table->string('exit_gate')->nullable();
            $table->foreignId('exit_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('vehicle_logs', function (Blueprint $table) {
            $table->id();
            $table->string('plate', 30)->index();
            $table->string('vehicle_type', 20)->nullable();
            $table->string('kind', 20)->default('visitor');         // resident, visitor, staff, emergency, service
            $table->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('visitor_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->string('driver')->nullable();
            $table->string('gate')->nullable();
            $table->timestamp('entry_at')->nullable();
            $table->timestamp('exit_at')->nullable();
            $table->string('status', 20)->default('inside');        // inside, exited
            $table->boolean('watchlist_hit')->default(false);
            $table->foreignId('logged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('domestic_staff', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();                   // DS-XXXXXX on the staff card
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('type', 30);                             // maid, driver, gardener, cook, nanny, guard, cleaner, other
            $table->string('cnic')->nullable()->index();
            $table->string('phone')->nullable();
            $table->string('address')->nullable();
            $table->string('photo_path')->nullable();
            $table->string('cnic_photo_path')->nullable();
            $table->string('police_doc_path')->nullable();
            $table->string('verification', 20)->default('pending'); // pending, verified, rejected
            $table->string('verification_note')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->string('work_days')->nullable();                // e.g. Mon,Tue,Wed
            $table->time('time_from')->nullable();
            $table->time('time_to')->nullable();
            $table->date('valid_until')->nullable();
            $table->boolean('active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('staff_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('domestic_staff_id')->constrained('domestic_staff')->cascadeOnDelete();
            $table->foreignId('house_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('entry_at');
            $table->timestamp('exit_at')->nullable();
            $table->string('gate')->nullable();
            $table->boolean('off_schedule')->default(false);
            $table->foreignId('logged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('cameras', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('location')->nullable();
            $table->string('gate')->nullable();                     // linked gate → used to find footage for gate events
            $table->string('stream_type', 20)->default('mjpeg');    // hls, mjpeg, snapshot, embed, demo
            $table->text('stream_url')->nullable();
            $table->text('playback_url')->nullable();               // template with {start} {end} {start_hik} {end_hik} {date}
            $table->unsignedInteger('refresh_seconds')->default(2);
            $table->decimal('map_x', 8, 2)->nullable();
            $table->decimal('map_y', 8, 2)->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('patrol_checkpoints', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();                   // CP-XXXXXX printed and fixed at the spot
            $table->string('name');
            $table->string('location')->nullable();
            $table->decimal('map_x', 8, 2)->nullable();
            $table->decimal('map_y', 8, 2)->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('patrol_rounds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('shift_id')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->string('status', 20)->default('in_progress');   // in_progress, completed, incomplete
            $table->unsignedInteger('expected')->default(0);
            $table->unsignedInteger('scanned')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('patrol_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patrol_round_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('patrol_checkpoint_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('scanned_at');
            $table->string('status', 20)->default('ok');            // ok, issue
            $table->string('note')->nullable();
            $table->string('photo_path')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->timestamps();
        });

        Schema::create('guard_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guard_name');
            $table->string('post')->default('Main Gate');           // Main Gate, Gate 2, Patrol, Control room
            $table->date('date')->index();
            $table->string('slot', 20)->default('morning');         // morning, evening, night, custom
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->string('status', 20)->default('scheduled');     // scheduled, on_duty, completed, missed
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('checked_out_at')->nullable();
            $table->text('handover_notes')->nullable();
            $table->json('handover_items')->nullable();             // keys, radio, register, weapons …
            $table->foreignId('handover_to_shift_id')->nullable();
            $table->timestamp('handover_ack_at')->nullable();
            $table->string('handover_ack_note')->nullable();
            $table->timestamp('missed_alerted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // every existing visitor gets a slip code so old entries can be scanned out too
        \App\Models\Visitor::whereNull('token')->orderBy('id')->each(fn ($v) => $v->forceFill(['token' => \App\Services\GateLog::token('GV', \App\Models\Visitor::class, 'token'), 'access_type' => $v->category === 'emergency' ? 'emergency' : 'temporary'])->saveQuietly());

        if (! app()->runningUnitTests() && User::where('email', 'security@demo.local')->exists()) {
            SecurityDemo::seed();
        }
    }

    public function down(): void
    {
        foreach (['guard_shifts', 'patrol_scans', 'patrol_rounds', 'patrol_checkpoints', 'cameras', 'staff_entries', 'domestic_staff', 'vehicle_logs'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('visitors', function (Blueprint $table) {
            $table->dropConstrainedForeignId('exit_by');
            $table->dropConstrainedForeignId('revoked_by');
            $table->dropUnique(['token']);
            $table->dropColumn(['token', 'vehicle_type', 'access_type', 'emergency_service', 'exit_gate']);
        });
    }
};
