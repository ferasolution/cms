<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class BookIssue extends Model
{
    use BelongsToSociety;

    protected $table = 'book_issues';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'issued_at' => 'datetime',
            'returned_at' => 'datetime',
            'due_at' => 'date:Y-m-d',
        ];
    }

    public function book() { return $this->belongsTo(Book::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function issuer() { return $this->belongsTo(User::class, 'issued_by'); }
}
