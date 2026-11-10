<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GuardShift extends Model
{
    protected $table = 'guard_shifts';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'checked_in_at' => 'datetime', 'checked_out_at' => 'datetime', 'handover_ack_at' => 'datetime', 'missed_alerted_at' => 'datetime', 'handover_items' => 'array'];
    }

    public function employee() { return $this->belongsTo(Employee::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function handoverTo() { return $this->belongsTo(GuardShift::class, 'handover_to_shift_id'); }
}
