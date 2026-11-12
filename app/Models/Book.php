<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class Book extends Model
{
    use BelongsToSociety;

    protected $table = 'books';

    protected $guarded = ['id'];

    public function issues() { return $this->hasMany(BookIssue::class); }
}
