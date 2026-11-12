<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class Visitor extends Model
{
    use BelongsToSociety;

    protected $table = 'visitors';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'entry_at' => 'datetime',
            'exit_at' => 'datetime',
            'expected_exit_at' => 'datetime',
            'responded_at' => 'datetime',
            'overstay_alerted_at' => 'datetime',
            'watchlist_hit' => 'boolean',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function pass() { return $this->belongsTo(VisitorPass::class, 'pass_id'); }
    public function responder() { return $this->belongsTo(User::class, 'responded_by'); }
    public function exiter() { return $this->belongsTo(User::class, 'exit_by'); }
    public function logger() { return $this->belongsTo(User::class, 'logged_by'); }
}
