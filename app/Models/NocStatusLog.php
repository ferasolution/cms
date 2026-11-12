<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class NocStatusLog extends Model
{
    use BelongsToSociety;

    protected $table = 'noc_status_logs';

    protected $guarded = ['id'];

    public function noc() { return $this->belongsTo(Noc::class); }
    public function user() { return $this->belongsTo(User::class); }
}
