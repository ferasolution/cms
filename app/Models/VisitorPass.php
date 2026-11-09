<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VisitorPass extends Model
{
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
