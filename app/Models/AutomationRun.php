<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class AutomationRun extends Model
{
    use BelongsToSociety;

    protected $guarded = ['id'];
}
