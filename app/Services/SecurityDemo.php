<?php

namespace App\Services;

use App\Models\Camera;
use App\Models\DomesticStaff;
use App\Models\Employee;
use App\Models\GuardShift;
use App\Models\House;
use App\Models\PatrolCheckpoint;
use App\Models\PatrolRound;
use App\Models\PatrolScan;
use App\Models\StaffEntry;
use App\Models\User;
use App\Models\VehicleLog;
use App\Http\Controllers\Api\SecurityOpsController;

/** Demo data for the security suite (only on demo installations). */
class SecurityDemo
{
    public static function seed(): void
    {
        if (Camera::exists()) {
            return;
        }
        // cameras (demo feeds until real NVR / camera URLs are entered)
        foreach ([
            ['Main Gate — Entry', 'Main Gate', 'Rashid Minhas Road entrance', 392, 492],
            ['Main Gate — Exit', 'Main Gate', 'Exit lane', 404, 520],
            ['Gate 2', 'Gate 2', 'Graveyard Road entrance', 1100, 150],
            ['Central Park', null, 'Park & mosque', 650, 445],
            ['Shopping Complex', null, 'Commercial area', 772, 410],
            ['North Park', null, 'North park & office', 760, 205],
        ] as $i => [$n, $g, $l, $x, $y]) {
            Camera::create(['name' => $n, 'gate' => $g, 'location' => $l, 'stream_type' => 'demo', 'map_x' => $x, 'map_y' => $y, 'sort' => $i,
                'playback_url' => 'http://NVR-IP/doc/page/playback.asp?start={start_hik}&end={end_hik}']);
        }
        // patrol checkpoints around Block 19
        $cps = [];
        foreach ([
            ['Main Gate', 400, 505], ['Mosque', 484, 446], ['Central Park', 686, 443], ['Shopping Complex', 772, 425], ['North Park', 752, 188],
            ['Community Office', 869, 250], ['Gate 2', 1105, 155], ['East Corner', 1285, 545], ['South Corner', 530, 715], ['North-West Corner', 605, 45],
        ] as $i => [$n, $x, $y]) {
            $cps[] = PatrolCheckpoint::create(['code' => GateLog::token('CP', PatrolCheckpoint::class, 'code'), 'name' => $n, 'location' => 'Block 19', 'map_x' => $x, 'map_y' => $y, 'sort' => $i]);
        }

        // guards + this week's shifts
        $guards = Employee::where('department', 'Security')->get();
        foreach (['Nadeem Akhtar', 'Shahid Khan'] as $k => $n) {
            $guards->push(Employee::create(['code' => 'EMP-G'.($k + 1), 'name' => $n, 'department' => 'Security', 'designation' => 'Security Guard', 'phone' => '0301-55500'.$k, 'joined_on' => now()->subYear(), 'shift_start' => '07:00', 'shift_end' => '15:00']));
        }
        $slots = SecurityOpsController::slots();
        $plan = [['morning', 'Main Gate'], ['evening', 'Main Gate'], ['night', 'Main Gate'], ['morning', 'Gate 2']];
        $boss = User::where('email', 'security@demo.local')->value('id');
        for ($d = -3; $d <= 4; $d++) {
            $date = today()->addDays($d)->toDateString();
            foreach ($plan as $i => [$slot, $post]) {
                $g = $guards[($i + max(0, $d + 3)) % $guards->count()];
                [$a, $b] = $slots[$slot];
                $s = \Carbon\Carbon::parse("$date $a");
                $e = \Carbon\Carbon::parse("$date $b");
                if ($e->lte($s)) {
                    $e->addDay();
                }
                $status = $e->isPast() ? 'completed' : ($s->isPast() ? 'on_duty' : 'scheduled');
                GuardShift::create(['employee_id' => $g->id, 'user_id' => $g->user_id, 'guard_name' => $g->name, 'post' => $post, 'date' => $date, 'slot' => $slot, 'starts_at' => $s, 'ends_at' => $e,
                    'status' => $status, 'checked_in_at' => $status !== 'scheduled' ? $s->copy()->addMinutes(rand(-5, 8)) : null, 'checked_out_at' => $status === 'completed' ? $e->copy()->addMinutes(rand(0, 10)) : null,
                    'handover_notes' => $status === 'completed' ? collect(['All quiet. Register updated.', 'Delivery van for N-54 expected tomorrow 10 AM.', 'Street light near Park is off — complaint logged.', 'Gate barrier sticking, told maintenance.'])->random() : null,
                    'handover_items' => $status === 'completed' ? ['Gate keys', 'Wireless set', 'Visitor register'] : null, 'handover_ack_at' => $status === 'completed' ? $e->copy()->addMinutes(12) : null, 'created_by' => $boss]);
            }
        }
        // make sure the demo guard account is on duty now (for the guard login)
        $guardUser = User::where('email', 'guard@demo.local')->first();
        if ($guardUser && $emp = Employee::where('user_id', $guardUser->id)->first()) {
            GuardShift::where('status', 'on_duty')->where('post', 'Main Gate')->update(['employee_id' => $emp->id, 'user_id' => $guardUser->id, 'guard_name' => $emp->name]);
        }

        // patrol history: rounds every 2 hours today
        $guardId = $guardUser?->id ?? $boss;
        foreach ([6, 4, 2] as $h) {
            $start = now()->subHours($h);
            $r = PatrolRound::create(['user_id' => $guardId, 'started_at' => $start, 'ended_at' => $start->copy()->addMinutes(35), 'expected' => count($cps), 'status' => 'completed', 'scanned' => 0]);
            $skip = $h === 2 ? [7, 8] : [];
            foreach ($cps as $i => $cp) {
                if (in_array($i, $skip, true)) {
                    continue;
                }
                PatrolScan::create(['patrol_round_id' => $r->id, 'patrol_checkpoint_id' => $cp->id, 'user_id' => $guardId, 'scanned_at' => $start->copy()->addMinutes(3 * $i + 2),
                    'status' => $h === 4 && $i === 4 ? 'issue' : 'ok', 'note' => $h === 4 && $i === 4 ? 'Park gate lock broken' : null]);
            }
            $r->update(['scanned' => count($cps) - count($skip), 'status' => $skip ? 'incomplete' : 'completed']);
        }

        // domestic staff
        $houses = House::whereNotNull('map_x')->inRandomOrder()->limit(8)->pluck('id')->all();
        $resHouse = User::where('email', 'resident@demo.local')->value('house_id') ?? ($houses[0] ?? null);
        $people = [
            ['Shabana Bibi', 'maid', '42101-1112223-4', 'Mon,Tue,Wed,Thu,Fri,Sat', '09:00', '13:00', 'verified', $resHouse, true],
            ['Akbar Ali', 'driver', '42201-2223334-5', 'Mon,Tue,Wed,Thu,Fri', '08:00', '18:00', 'verified', $resHouse, true],
            ['Gul Muhammad', 'gardener', '42301-3334445-6', 'Tue,Fri', '07:00', '11:00', 'verified', $houses[1] ?? null, false],
            ['Rubina', 'cook', '42101-4445556-7', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', '11:00', '20:00', 'verified', $houses[2] ?? null, true],
            ['Sajid Masih', 'cleaner', '42101-5556667-8', 'Mon,Wed,Fri', '10:00', '12:00', 'pending', $houses[3] ?? null, false],
            ['Naseem Akhtar', 'nanny', '42101-6667778-9', 'Mon,Tue,Wed,Thu,Fri', '08:00', '17:00', 'pending', $houses[4] ?? null, false],
        ];
        foreach ($people as [$n, $t, $c, $days, $f, $to, $ver, $h, $in]) {
            $s = DomesticStaff::create(['code' => GateLog::token('DS', DomesticStaff::class, 'code'), 'house_id' => $h, 'name' => $n, 'type' => $t, 'cnic' => $c, 'phone' => '0300-'.rand(1000000, 9999999),
                'work_days' => $days, 'time_from' => $f, 'time_to' => $to, 'verification' => $ver, 'verified_by' => $ver === 'verified' ? $boss : null, 'verified_at' => $ver === 'verified' ? now()->subDays(20) : null,
                'valid_until' => today()->addMonths(6), 'created_by' => $boss]);
            for ($d = 3; $d >= 1; $d--) {
                $e = now()->subDays($d)->setTimeFromTimeString($f);
                StaffEntry::create(['domestic_staff_id' => $s->id, 'house_id' => $h, 'entry_at' => $e, 'exit_at' => now()->subDays($d)->setTimeFromTimeString($to), 'gate' => 'Main Gate', 'logged_by' => $guardId]);
            }
            if ($in) {
                StaffEntry::create(['domestic_staff_id' => $s->id, 'house_id' => $h, 'entry_at' => now()->subMinutes(rand(30, 150)), 'gate' => 'Main Gate', 'logged_by' => $guardId]);
            }
        }

        // vehicle register
        foreach (\App\Models\Vehicle::limit(4)->get() as $i => $v) {
            VehicleLog::create(['plate' => $v->plate, 'vehicle_type' => $v->type, 'kind' => 'resident', 'vehicle_id' => $v->id, 'house_id' => $v->house_id, 'gate' => 'Main Gate',
                'entry_at' => now()->subHours($i + 1), 'exit_at' => $i % 2 ? now()->subMinutes(20) : null, 'status' => $i % 2 ? 'exited' : 'inside', 'logged_by' => $guardId]);
        }
        foreach (\App\Models\Visitor::whereNotNull('vehicle_no')->get() as $v) {
            VehicleLog::create(['plate' => strtoupper($v->vehicle_no), 'kind' => $v->category === 'delivery' ? 'service' : 'visitor', 'visitor_id' => $v->id, 'house_id' => $v->house_id, 'driver' => $v->name, 'gate' => $v->gate ?: 'Main Gate',
                'entry_at' => $v->entry_at ?? $v->created_at, 'exit_at' => $v->exit_at, 'status' => $v->status === 'inside' ? 'inside' : 'exited', 'logged_by' => $v->logged_by]);
        }
    }
}
