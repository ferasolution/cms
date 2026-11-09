<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Book extends Model
{
    protected $table = 'books';

    protected $guarded = ['id'];

    public function issues() { return $this->hasMany(BookIssue::class); }
}
