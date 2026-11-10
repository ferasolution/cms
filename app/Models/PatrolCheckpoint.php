<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PatrolCheckpoint extends Model
{
    protected $table = 'patrol_checkpoints';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'map_x' => 'float', 'map_y' => 'float'];
    }

    public function scans() { return $this->hasMany(PatrolScan::class); }
    public function lastScan() { return $this->hasOne(PatrolScan::class)->latestOfMany('scanned_at'); }
}
