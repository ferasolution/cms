<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class InventoryItem extends Model
{
    use BelongsToSociety;

    protected $table = 'inventory_items';

    protected $guarded = ['id'];

    public function issues() { return $this->hasMany(InventoryIssue::class); }
}
