<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Camera extends Model
{
    protected $table = 'cameras';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'map_x' => 'float', 'map_y' => 'float'];
    }

}
