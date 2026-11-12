<?php

namespace App\Services;

use App\Models\House;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;

/**
 * Real site plan for the 3D map — Gulistan-e-Jauhar Block 19, digitised from the society plot map.
 * Plots are stored in source-image pixels (the map converts them to scene units).
 * Series: N = north bungalow plots (1–157), E = east blocks (101–236 + A/C), W = west blocks (1–96 + 73A).
 */
class SitePlan
{
    public const FILE = 'data/block19-site.json';

    private const FIRST = ['Ahmed', 'Fatima', 'Usman', 'Ayesha', 'Bilal', 'Sana', 'Hamza', 'Zainab', 'Imran', 'Hira', 'Faisal', 'Mariam', 'Kashif', 'Nadia', 'Omar', 'Rabia', 'Tariq', 'Saima', 'Adeel', 'Nida', 'Junaid', 'Amna', 'Shoaib', 'Mehwish'];
    private const LAST = ['Khan', 'Ali', 'Siddiqui', 'Hussain', 'Malik', 'Qureshi', 'Raza', 'Sheikh', 'Javed', 'Mirza', 'Aslam', 'Abbasi', 'Iqbal', 'Farooq', 'Anwar', 'Baig', 'Rizvi', 'Zaidi', 'Memon', 'Butt'];

    /** The current society's digitised plan (plots + site). Outside a society (old migrations) the bundled Block 19 plan. */
    public static function data(): ?array
    {
        if ($soc = \App\Support\Tenant::get()) {
            return $soc->site_plan ?: null;
        }

        return self::bundled();
    }

    public static function bundled(): array
    {
        return json_decode(file_get_contents(database_path(self::FILE)), true);
    }

    /** The site metadata (boundary, roads, landmarks, gates, street labels, geo-reference) — null when the society has no map yet. */
    public static function site(): ?array
    {
        $site = self::data()['site'] ?? null;
        if (! $site) {
            return null;
        }
        if ($geo = Setting::get('map_geo')) {
            $site['geo'] = $geo + ['note' => 'Set in Settings'];
        }

        return $site;
    }

    /**
     * Place every plot as a house.
     * - Houses already on the plan are re-matched to the nearest plot (fixes numbering, keeps their records).
     * - $adoptExisting: houses not on the plan yet (demo data) take the first free plots.
     * - $demo: new houses get demo owner names and maintenance amounts.
     */
    public static function apply(bool $adoptExisting = false, bool $demo = false): array
    {
        abort_unless(self::data(), 422, 'This society has no site plan yet.');
        $plots = collect(self::data()['plots'])->values()->all();
        $taken = [];
        $created = $moved = $renamed = $unplaced = 0;

        DB::transaction(function () use (&$plots, &$taken, $adoptExisting, $demo, &$created, &$moved, &$renamed, &$unplaced) {
            // 1. houses already on the map → nearest plot (closest pairs first)
            $placed = House::whereNotNull('map_x')->get();
            $pairs = [];
            foreach ($placed as $h) {
                foreach ($plots as $i => $p) {
                    $d = hypot($p['cx'] - $h->map_x, $p['cy'] - $h->map_y);
                    if ($d < 12) {
                        $pairs[] = [$d, $h->id, $i];
                    }
                }
            }
            usort($pairs, fn ($a, $b) => $a[0] <=> $b[0]);
            $houseDone = [];
            foreach ($pairs as [$d, $hid, $i]) {
                if (isset($houseDone[$hid]) || isset($taken[$i])) {
                    continue;
                }
                $houseDone[$hid] = $taken[$i] = true;
                $h = $placed->firstWhere('id', $hid);
                if ($h->block !== $plots[$i]['series'] || (string) $h->house_no !== (string) $plots[$i]['no']) {
                    $renamed++;
                }
                self::place($h, $plots[$i]);
                $moved++;
            }
            foreach ($placed as $h) { // on the old plan but no plot any more
                if (! isset($houseDone[$h->id])) {
                    $h->forceFill(['map_x' => null, 'map_y' => null])->save();
                    $unplaced++;
                }
            }

            // 2. plots that already have a house with the same label (placed manually)
            foreach ($plots as $i => $p) {
                if (isset($taken[$i])) {
                    continue;
                }
                if ($h = House::whereNull('map_x')->where('block', $p['series'])->where('house_no', $p['no'])->first()) {
                    self::place($h, $p);
                    $taken[$i] = true;
                    $moved++;
                }
            }

            // 3. demo houses not on the plan → spread over free plots; then create the rest
            $spare = $adoptExisting ? House::whereNull('map_x')->orderBy('id')->get()->all() : [];
            $free = array_values(array_filter(array_keys($plots), fn ($i) => ! isset($taken[$i])));
            $step = $spare ? max(1, intdiv(count($free), count($spare))) : 1;
            foreach ($spare as $k => $h) {
                $i = $free[min(count($free) - 1, $k * $step)] ?? null;
                if ($i === null || isset($taken[$i])) {
                    continue;
                }
                self::place($h, $plots[$i]);
                $taken[$i] = true;
                $moved++;
            }
            foreach ($plots as $i => $p) {
                if (isset($taken[$i])) {
                    continue;
                }
                $small = $p['series'] !== 'N';
                $h = new House([
                    'type' => 'house',
                    'owner_name' => $demo ? self::FIRST[($i * 7) % count(self::FIRST)].' '.self::LAST[($i * 11) % count(self::LAST)] : null,
                    'monthly_maintenance' => $demo ? ($small ? 2500 : 5000) : 0,
                    'floors' => $small ? 2 + ($i % 2) : 1 + ($i % 2),
                ]);
                self::place($h, $p);
                $created++;
            }
        });

        return ['plots' => count($plots), 'created' => $created, 'placed' => $moved, 'renumbered' => $renamed, 'removed_from_map' => $unplaced];
    }

    private static function place(House $h, array $p): void
    {
        $h->fill([
            'block' => $p['series'], 'house_no' => $p['no'], 'street' => $p['street'] ?? $h->street,
            'map_x' => $p['cx'], 'map_y' => $p['cy'], 'map_w' => $p['w'], 'map_h' => $p['h'], 'map_angle' => $p['ang'],
            'grid_x' => (int) round($p['cx'] / 20), 'grid_y' => (int) round($p['cy'] / 20),
        ]);
        if ($p['series'] !== 'N' && $h->floors < 2) {
            $h->floors = 2;
        }
        $h->save();
    }
}
