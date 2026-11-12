<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class StaffEntry extends Model
{
    use BelongsToSociety;

    protected $table = 'staff_entries';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['entry_at' => 'datetime', 'exit_at' => 'datetime', 'off_schedule' => 'boolean'];
    }

    public function staff() { return $this->belongsTo(DomesticStaff::class, 'domestic_staff_id'); }
    public function house() { return $this->belongsTo(House::class); }
    public function logger() { return $this->belongsTo(User::class, 'logged_by'); }
}
