<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SosAlert extends Model
{
    protected $table = 'sos_alerts';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'responded_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function user() { return $this->belongsTo(User::class); }
    public function house() { return $this->belongsTo(House::class); }
    public function responder() { return $this->belongsTo(User::class, 'responder_id'); }
}
