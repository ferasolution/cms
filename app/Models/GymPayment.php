<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GymPayment extends Model
{
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
