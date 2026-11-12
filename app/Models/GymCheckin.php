<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class GymCheckin extends Model
{
    use BelongsToSociety;

    protected $table = 'gym_checkins';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'allowed' => 'boolean',
        ];
    }

    public function member() { return $this->belongsTo(GymMember::class, 'gym_member_id'); }
}
