<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class GymMember extends Model
{
    use BelongsToSociety;

    protected $table = 'gym_members';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'card_blocked' => 'boolean',
            'due_alerted_at' => 'datetime',
        ];
    }

    public function plan() { return $this->belongsTo(GymPlan::class, 'gym_plan_id'); }
    public function house() { return $this->belongsTo(House::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function payments() { return $this->hasMany(GymPayment::class); }
}
