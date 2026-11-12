<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class VisitorPass extends Model
{
    use BelongsToSociety;

    protected $table = 'visitor_passes';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'valid_from' => 'datetime',
            'valid_until' => 'datetime',
            'used_at' => 'datetime',
            'multi_use' => 'boolean',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
