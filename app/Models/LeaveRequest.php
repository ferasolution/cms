<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    protected $table = 'leave_requests';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'from' => 'date:Y-m-d',
            'to' => 'date:Y-m-d',
        ];
    }

    public function employee() { return $this->belongsTo(Employee::class); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }
}
