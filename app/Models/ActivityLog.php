<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    use BelongsToSociety;

    protected $table = 'activity_logs';

    protected $guarded = ['id'];

    public function user() { return $this->belongsTo(User::class); }
}
