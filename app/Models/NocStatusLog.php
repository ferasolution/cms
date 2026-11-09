<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NocStatusLog extends Model
{
    protected $table = 'noc_status_logs';

    protected $guarded = ['id'];

    public function noc() { return $this->belongsTo(Noc::class); }
    public function user() { return $this->belongsTo(User::class); }
}
