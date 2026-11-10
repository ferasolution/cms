<?php

namespace App\Services;

use App\Models\House;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;

/**
 * Real site plan for the 3D map (Gulistan-e-Jauhar Block 19, digitised from the society plot map).
 * Plots are stored in source-image pixels; the 3D map converts them to scene units.
 * Series: N = north bungalow plots (1–157), E = east blocks (101–236 + A/B/C), W = west blocks.
 */
class SitePlan
{
    public const FILE = 'data/block19-site.json';

    public static function data(): array
    {
        return json_decode(file_get_contents(database_path(self::FILE)), true);
    }

    /**
     * Store the plan and place every plot as a house.
     * $adoptExisting: re-use houses that are not on the plan yet (demo data) for the first plots.
     * $demo: give new demo houses owner names and maintenance amounts.
     */
    public static function apply(bool $adoptExisting = false, bool $demo = false): array
    {
        $d = self::data();
        Setting::put('site_plan', $d['site']);
        $plots = collect($d['plots'])->sortBy(fn ($p) => [array_search($p['series'], ['N', 'E', 'W']), (int) $p['no'], $p['no']])->values();
        $spare = $adoptExisting ? House::whereNull('map_x')->orderBy('id')->get()->all() : [];
        $first = ['Ahmed', 'Fatima', 'Usman', 'Ayesha', 'Bilal', 'Sana', 'Hamza', 'Zainab', 'Imran', 'Hira', 'Faisal', 'Mariam', 'Kashif', 'Nadia', 'Omar', 'Rabia', 'Tariq', 'Saima', 'Adeel', 'Nida', 'Junaid', 'Amna', 'Shoaib', 'Mehwish'];
        $last = ['Khan', 'Ali', 'Siddiqui', 'Hussain', 'Malik', 'Qureshi', 'Raza', 'Sheikh', 'Javed', 'Mirza', 'Aslam', 'Abbasi', 'Iqbal', 'Farooq', 'Anwar', 'Baig', 'Rizvi', 'Zaidi', 'Memon', 'Butt'];
        $created = $moved = 0;

        DB::transaction(function () use ($plots, &$spare, $demo, $first, $last, &$created, &$moved) {
            foreach ($plots as $i => $p) {
                $geo = ['map_x' => $p['cx'], 'map_y' => $p['cy'], 'map_w' => $p['w'], 'map_h' => $p['h'], 'map_angle' => $p['ang']];
                $house = House::where('block', $p['series'])->where('house_no', $p['no'])->first();
                if (! $house && $spare) {
                    $house = array_shift($spare);
                    $house->fill(['block' => $p['series'], 'house_no' => $p['no'], 'street' => self::streetName($p)]);
                }
                $small = $p['series'] !== 'N';
                if (! $house) {
                    $house = new House([
                        'block' => $p['series'], 'house_no' => $p['no'], 'street' => self::streetName($p), 'type' => 'house',
                        'owner_name' => $demo ? $first[($i * 7) % count($first)].' '.$last[($i * 11) % count($last)] : null,
                        'monthly_maintenance' => $demo ? ($small ? 2500 : 5000) : 0,
                        'floors' => $small ? 2 + ($i % 2) : 1 + ($i % 2),
                    ]);
                    $created++;
                } else {
                    $moved++;
                    if ($small && $house->floors < 2) {
                        $house->floors = 2;
                    }
                }
                $house->fill($geo + ['grid_x' => (int) round($p['cx'] / 20), 'grid_y' => (int) round($p['cy'] / 20)])->save();
            }
        });

        return ['plots' => $plots->count(), 'created' => $created, 'placed' => $moved];
    }

    private static function streetName(array $p): string
    {
        return ['N' => 'North Sector', 'E' => 'East Sector', 'W' => 'West Sector'][$p['series']] ?? 'Block 19';
    }
}
