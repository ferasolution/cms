<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NocDocument extends Model
{
    protected $table = 'noc_documents';

    protected $guarded = ['id'];

    public function noc() { return $this->belongsTo(Noc::class); }
}
