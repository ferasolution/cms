<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PatrolScan extends Model
{
    protected $table = 'patrol_scans';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['scanned_at' => 'datetime'];
    }

    public function checkpoint() { return $this->belongsTo(PatrolCheckpoint::class, 'patrol_checkpoint_id'); }
    public function round() { return $this->belongsTo(PatrolRound::class, 'patrol_round_id'); }
    public function user() { return $this->belongsTo(User::class); }
}
