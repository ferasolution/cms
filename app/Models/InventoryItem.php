<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryItem extends Model
{
    protected $table = 'inventory_items';

    protected $guarded = ['id'];

    public function issues() { return $this->hasMany(InventoryIssue::class); }
}
