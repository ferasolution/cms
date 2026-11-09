<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Alert extends Model
{
    protected $table = 'alerts';

    protected $guarded = ['id'];

    public function readers() { return $this->belongsToMany(User::class, 'alert_reads'); }
}
