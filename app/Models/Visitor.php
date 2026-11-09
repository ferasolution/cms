<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Visitor extends Model
{
    protected $table = 'visitors';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'entry_at' => 'datetime',
            'exit_at' => 'datetime',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function logger() { return $this->belongsTo(User::class, 'logged_by'); }
}
