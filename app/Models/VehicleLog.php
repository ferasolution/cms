<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class VehicleLog extends Model
{
    use BelongsToSociety;

    protected $table = 'vehicle_logs';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['entry_at' => 'datetime', 'exit_at' => 'datetime', 'watchlist_hit' => 'boolean'];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function vehicle() { return $this->belongsTo(Vehicle::class); }
    public function visitor() { return $this->belongsTo(Visitor::class); }
    public function logger() { return $this->belongsTo(User::class, 'logged_by'); }
}
