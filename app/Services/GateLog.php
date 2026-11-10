<?php

namespace App\Services;

use App\Models\Vehicle;
use App\Models\VehicleLog;
use App\Models\Visitor;
use App\Http\Controllers\Api\VisitorController;
use Illuminate\Support\Str;

/** Shared gate helpers: receipt tokens and the vehicle entry / exit register. */
class GateLog
{
    public static function plate(?string $p): string
    {
        return preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $p));
    }

    public static function token(string $prefix, string $model, string $column): string
    {
        do {
            $code = $prefix.'-'.strtoupper(Str::random(6));
        } while ($model::where($column, $code)->exists());

        return $code;
    }

    /** A visitor with a vehicle just entered → open an entry in the vehicle register. */
    public static function visitorVehicleIn(Visitor $v): void
    {
        if (! $v->vehicle_no || VehicleLog::where('visitor_id', $v->id)->exists()) {
            return;
        }
        self::enter([
            'plate' => $v->vehicle_no, 'vehicle_type' => $v->vehicle_type, 'kind' => $v->access_type === 'emergency' ? 'emergency' : ($v->category === 'delivery' || $v->category === 'contractor' ? 'service' : 'visitor'),
            'visitor_id' => $v->id, 'house_id' => $v->house_id, 'driver' => $v->name, 'gate' => $v->gate, 'watchlist_hit' => $v->watchlist_hit, 'logged_by' => $v->logged_by,
        ]);
    }

    public static function visitorVehicleOut(Visitor $v): void
    {
        VehicleLog::where('visitor_id', $v->id)->where('status', 'inside')->update(['status' => 'exited', 'exit_at' => now(), 'updated_at' => now()]);
    }

    public static function enter(array $d): VehicleLog
    {
        $d['plate'] = strtoupper(trim($d['plate']));
        $norm = self::plate($d['plate']);
        $vehicle = Vehicle::get(['id', 'plate', 'house_id', 'type'])->first(fn ($x) => self::plate($x->plate) === $norm);
        if ($vehicle) {
            $d['vehicle_id'] = $vehicle->id;
            $d['house_id'] ??= $vehicle->house_id;
            $d['vehicle_type'] ??= $vehicle->type;
            if (($d['kind'] ?? null) === null || $d['kind'] === 'visitor') {
                $d['kind'] = empty($d['visitor_id']) ? 'resident' : $d['kind'];
            }
        }
        if (! isset($d['watchlist_hit'])) {
            $d['watchlist_hit'] = (bool) VisitorController::watchlistMatch(null, null, $d['plate']);
        }

        return VehicleLog::create($d + ['entry_at' => now(), 'status' => 'inside', 'logged_by' => auth()->id()]);
    }
}
