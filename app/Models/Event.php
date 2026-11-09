<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Event extends Model
{
    protected $table = 'events';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'last_hour_alerted_at' => 'datetime',
            'end_alerted_at' => 'datetime',
            'organizer_alerted_at' => 'datetime',
            'closed_at' => 'datetime',
            'charge_breakdown' => 'array',
            'charges' => 'decimal:2',
        ];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function requester() { return $this->belongsTo(User::class, 'requested_by'); }
    public function approver() { return $this->belongsTo(User::class, 'approved_by'); }
}
