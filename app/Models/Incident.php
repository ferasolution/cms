<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Incident extends Model
{
    protected $table = 'incidents';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function reporter() { return $this->belongsTo(User::class, 'reported_by'); }
}
