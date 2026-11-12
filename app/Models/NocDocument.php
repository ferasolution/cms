<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

class NocDocument extends Model
{
    use BelongsToSociety;

    protected $table = 'noc_documents';

    protected $guarded = ['id'];

    public function noc() { return $this->belongsTo(Noc::class); }
}
