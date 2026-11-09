<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RecordFile extends Model
{
    protected $table = 'record_files';

    protected $guarded = ['id'];

    public function house() { return $this->belongsTo(House::class); }
    public function uploader() { return $this->belongsTo(User::class, 'uploaded_by'); }
}
