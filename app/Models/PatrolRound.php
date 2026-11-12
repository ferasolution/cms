<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class PatrolRound extends Model
{
    use BelongsToSociety;

    protected $table = 'patrol_rounds';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime'];
    }

    public function user() { return $this->belongsTo(User::class); }
    public function scans() { return $this->hasMany(PatrolScan::class); }
}
