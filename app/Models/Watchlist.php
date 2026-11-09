<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Watchlist extends Model
{
    protected $table = 'watchlist';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'until' => 'date:Y-m-d',
        ];
    }

    public function adder() { return $this->belongsTo(User::class, 'added_by'); }
}
