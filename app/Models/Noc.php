<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Noc extends Model
{
    protected $table = 'nocs';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function documents() { return $this->hasMany(NocDocument::class); }
    public function logs() { return $this->hasMany(NocStatusLog::class)->latest('id'); }
}
