<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class RecordFile extends Model
{
    use BelongsToSociety;

    protected $table = 'record_files';

    protected $guarded = ['id'];

    public function house() { return $this->belongsTo(House::class); }
    public function uploader() { return $this->belongsTo(User::class, 'uploaded_by'); }
}
