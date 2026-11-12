<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reference numbers (CMP-00001, INC-00001, NOC refs, pass codes…) are numbered per society,
 * so their uniqueness is per society too — otherwise the second community's first ticket collides.
 */
return new class extends Migration
{
    private const COLS = [
        'events' => 'code', 'complaints' => 'ticket_no', 'nocs' => 'reference', 'visitor_passes' => 'code', 'incidents' => 'reference',
        'gym_payments' => 'reference', 'visitors' => 'token', 'domestic_staff' => 'code', 'patrol_checkpoints' => 'code',
    ];

    public function up(): void
    {
        foreach (self::COLS as $t => $c) {
            if (! Schema::hasTable($t) || ! Schema::hasColumn($t, $c)) {
                continue;
            }
            Schema::table($t, function (Blueprint $table) use ($c) {
                $table->dropUnique([$c]);
                $table->unique(['society_id', $c]);
            });
        }
    }

    public function down(): void
    {
        foreach (self::COLS as $t => $c) {
            Schema::table($t, function (Blueprint $table) use ($c) {
                $table->dropUnique(['society_id', $c]);
                $table->unique([$c]);
            });
        }
    }
};
