<?php

namespace App\Models\Platform;

use App\Models\Society;
use Illuminate\Database\Eloquent\Model;

/** One line in the platform's payments ledger (provider webhooks and manual payments). */
class BillingEvent extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['amount' => 'float', 'occurred_at' => 'datetime'];
    }

    public function society()
    {
        return $this->belongsTo(Society::class);
    }

    public static function record(?Society $s, string $provider, string $type, array $d = []): self
    {
        if (! empty($d['reference']) && ($old = self::where('provider', $provider)->where('type', $type)->where('reference', $d['reference'])->first())) {
            return $old;   // providers retry webhooks
        }

        return self::create(['society_id' => $s?->id, 'provider' => $provider, 'type' => $type, 'occurred_at' => $d['occurred_at'] ?? now()] + array_intersect_key($d, array_flip(['amount', 'currency', 'status', 'plan', 'reference', 'description'])));
    }
}
