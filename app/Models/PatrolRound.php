<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PatrolRound extends Model
{
    protected $table = 'patrol_rounds';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime'];
    }

    public function user() { return $this->belongsTo(User::class); }
    public function scans() { return $this->hasMany(PatrolScan::class); }
}
