<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GymPlan extends Model
{
    protected $table = 'gym_plans';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'active' => 'boolean',
        ];
    }

    public function members() { return $this->hasMany(GymMember::class); }
}
