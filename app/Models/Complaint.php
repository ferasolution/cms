<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Complaint extends Model
{
    protected $table = 'complaints';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function assigner() { return $this->belongsTo(User::class, 'assigned_by'); }
}
