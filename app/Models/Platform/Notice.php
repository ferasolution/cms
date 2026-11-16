<?php

namespace App\Models\Platform;

use App\Models\Society;
use Illuminate\Database\Eloquent\Model;

/** A message from the platform team shown inside community portals. */
class Notice extends Model
{
    protected $table = 'platform_notices';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['plans' => 'array', 'society_ids' => 'array', 'admins_only' => 'boolean', 'active' => 'boolean', 'starts_at' => 'datetime', 'ends_at' => 'datetime'];
    }

    /** Live notices for one community. */
    public static function for(Society $s): array
    {
        return self::where('active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderByDesc('id')->limit(5)->get()
            ->filter(fn ($n) => match ($n->audience) {
                'plans' => in_array($s->plan, (array) $n->plans, true),
                'societies' => in_array($s->id, array_map('intval', (array) $n->society_ids), true),
                default => true,
            })
            ->map(fn ($n) => ['id' => $n->id, 'title' => $n->title, 'body' => $n->body, 'level' => $n->level, 'admins_only' => $n->admins_only])
            ->values()->all();
    }
}
