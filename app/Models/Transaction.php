<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use BelongsToSociety;

    protected $table = 'transactions';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'amount' => 'decimal:2',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function staff() { return $this->belongsTo(User::class, 'staff_id'); }
    public function recorder() { return $this->belongsTo(User::class, 'recorded_by'); }
}
