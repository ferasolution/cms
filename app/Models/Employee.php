<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $table = 'employees';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'joined_on' => 'date:Y-m-d',
            'left_on' => 'date:Y-m-d',
            'basic_salary' => 'decimal:2',
        ];
    }

    public function user() { return $this->belongsTo(User::class); }
    public function attendances() { return $this->hasMany(Attendance::class); }
    public function today() { return $this->hasOne(Attendance::class)->whereDate('date', now()->toDateString()); }
}
