<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class DomesticStaff extends Model
{
    use BelongsToSociety;

    protected $table = 'domestic_staff';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime', 'valid_until' => 'date:Y-m-d', 'active' => 'boolean'];
    }

    public function house() { return $this->belongsTo(House::class); }
    public function verifier() { return $this->belongsTo(User::class, 'verified_by'); }
    public function entries() { return $this->hasMany(StaffEntry::class); }
    public function inside() { return $this->hasOne(StaffEntry::class)->whereNull('exit_at')->latestOfMany('entry_at'); }
}
