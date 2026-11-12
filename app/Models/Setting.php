<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use Illuminate\Database\Eloquent\Model;

/** Key/value settings, one set per society. */
class Setting extends Model
{
    use BelongsToSociety;

    public $timestamps = false;

    protected $guarded = ['id'];

    public static function get(string $key, $default = null)
    {
        $row = static::where('key', $key)->first();

        return $row ? json_decode($row->value, true) : $default;
    }

    public static function put(string $key, $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => json_encode($value)]);
    }
}
