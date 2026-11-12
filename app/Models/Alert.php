<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class Alert extends Model
{
    use BelongsToSociety;

    protected $table = 'alerts';

    protected $guarded = ['id'];

    public function readers() { return $this->belongsToMany(User::class, 'alert_reads'); }
}
