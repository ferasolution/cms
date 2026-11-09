<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryIssue extends Model
{
    protected $table = 'inventory_issues';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'issued_at' => 'datetime',
            'returned_at' => 'datetime',
            'expected_return' => 'date',
        ];
    }

    public function item() { return $this->belongsTo(InventoryItem::class, 'inventory_item_id'); }
    public function issuer() { return $this->belongsTo(User::class, 'issued_by'); }
}
