<?php

namespace App\Models\Concerns;

use App\Models\Society;
use App\Support\Tenant;
use Illuminate\Database\Eloquent\Builder;

/** Filters every query by the current society and stamps new records with it. */
trait BelongsToSociety
{
    public static function bootBelongsToSociety(): void
    {
        static::addGlobalScope('society', function (Builder $q) {
            if ($id = Tenant::id()) {
                $q->where($q->getModel()->getTable().'.society_id', $id);
            }
        });
        static::creating(function ($m) {
            if (empty($m->society_id) && ($id = Tenant::id())) {
                $m->society_id = $id;
            }
        });
    }

    public function society()
    {
        return $this->belongsTo(Society::class);
    }
}
