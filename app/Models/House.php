<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class House extends Model
{
    protected $table = 'houses';

    protected $guarded = ['id'];

    public function residents() { return $this->hasMany(User::class); }
    public function visitors() { return $this->hasMany(Visitor::class); }
    public function complaints() { return $this->hasMany(Complaint::class); }
    public function records() { return $this->hasMany(RecordFile::class); }
    public function getLabelAttribute(): string { return trim(($this->block ? $this->block.'-' : '').$this->house_no); }
    protected $appends = ['label'];
}
