<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    use BelongsToSociety;

    protected $table = 'announcements';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'pinned' => 'boolean',
        ];
    }

    public function author() { return $this->belongsTo(User::class, 'created_by'); }
    public function readers() { return $this->belongsToMany(User::class, 'announcement_reads')->withPivot('read_at'); }
}
