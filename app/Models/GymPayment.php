<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class GymPayment extends Model
{
    use BelongsToSociety;

    protected $table = 'gym_payments';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    public function member() { return $this->belongsTo(GymMember::class, 'gym_member_id'); }
    public function confirmer() { return $this->belongsTo(User::class, 'confirmed_by'); }
}
