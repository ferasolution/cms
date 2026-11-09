<?php

namespace Database\Seeders;

use App\Http\Controllers\Api\CrmController;
use App\Models\Announcement;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\GymCheckin;
use App\Models\GymMember;
use App\Models\GymPayment;
use App\Models\GymPlan;
use App\Models\House;
use App\Models\Incident;
use App\Models\LeaveRequest;
use App\Models\SosAlert;
use App\Models\Task;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Visitor;
use App\Models\VisitorPass;
use App\Models\Watchlist;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/** Demo data for the v2 modules: CRM, gym, announcements, passes, vehicles, watchlist, incidents. */
class DemoExtrasSeeder extends Seeder
{
    public function run(): void
    {
        if (GymPlan::exists()) {
            return; // already seeded
        }
        $houses = House::orderBy('id')->get();
        $residents = User::where('role', 'user')->whereNotNull('house_id')->orderBy('id')->get();
        $staff = User::where('role', 'editor')->orderBy('id')->get();
        $sec = User::where('email', 'security@demo.local')->first() ?? $staff->first();
        if ($residents->count() < 6 || $staff->count() < 2 || $houses->count() < 14) {
            return; // not the standard demo community
        }

        // Gate log: statuses, expected exits, a couple waiting for approval and one overstay.
        Visitor::whereNotNull('exit_at')->update(['status' => 'exited']);
        foreach (Visitor::whereNull('exit_at')->get() as $i => $v) {
            $entry = now()->subMinutes(35 + $i * 55);
            $v->update(['status' => 'inside', 'entry_at' => $entry, 'expected_exit_at' => $i === 0 ? now()->subMinutes(20) : $entry->copy()->addHours(4)]);
        }
        foreach ([['Courier — TCS', 'delivery', 'Parcel delivery'], ['Imran Plumber', 'worker', 'Kitchen sink repair']] as $k => [$name, $cat, $purpose]) {
            Visitor::create(['house_id' => $residents[$k]->house_id, 'name' => $name, 'category' => $cat, 'purpose' => $purpose, 'status' => 'awaiting', 'gate' => 'Main Gate', 'phone' => '0345-'.rand(1000000, 9999999), 'logged_by' => $sec?->id, 'created_at' => now()->subMinutes(2 + $k)]);
        }

        // Vehicles & passes
        $makes = [['Toyota Corolla', 'White'], ['Honda Civic', 'Black'], ['Suzuki Alto', 'Silver'], ['Honda CD70', 'Red'], ['Toyota Hilux', 'Grey']];
        foreach ($houses->take(14) as $i => $h) {
            [$make, $color] = $makes[$i % 5];
            Vehicle::create(['house_id' => $h->id, 'plate' => ['BKR', 'LEA', 'AFR', 'KHI', 'BJT'][$i % 5].'-'.(1000 + $i * 137), 'type' => str_contains($make, 'CD70') ? 'bike' : 'car', 'make' => $make, 'color' => $color, 'sticker_no' => 'STK-'.(500 + $i), 'parking_slot' => $h->block.'-P'.($i + 1), 'owner_name' => $h->owner_name]);
        }
        foreach ([['Usman Cousin', 'relative', 0, 3], ['Birthday Guests', 'guest', 1, 6], ['AC Technician', 'worker', 2, 2]] as $k => [$name, $cat, $ri, $hours]) {
            VisitorPass::create(['code' => 'VP-DEMO'.($k + 1).'X', 'house_id' => $residents[$ri]->house_id, 'created_by' => $residents[$ri]->id, 'visitor_name' => $name, 'category' => $cat,
                'purpose' => ucfirst($cat).' visit', 'persons' => $cat === 'guest' ? 12 : 1, 'valid_from' => now()->subHour(), 'valid_until' => now()->addHours($hours * 4), 'max_stay_minutes' => $hours * 60, 'multi_use' => $cat === 'guest']);
        }
        Watchlist::create(['name' => 'Fake Salesman', 'phone' => '0300-1112223', 'level' => 'blocked', 'reason' => 'Fraud complaints from residents (Block C)', 'added_by' => $sec?->id]);
        Watchlist::create(['vehicle_no' => 'XYZ-999', 'level' => 'watch', 'reason' => 'Reported loitering near Gate 2', 'added_by' => $sec?->id]);
        Incident::create(['reference' => 'INC-00001', 'type' => 'suspicious', 'severity' => 'medium', 'location' => 'Block C park', 'description' => 'Unknown motorbike circling Block C twice after midnight. Plate noted.', 'status' => 'investigating', 'reported_by' => $sec?->id, 'created_at' => now()->subHours(9)]);
        Incident::create(['reference' => 'INC-00002', 'type' => 'accident', 'severity' => 'low', 'location' => 'Street 2, Block A', 'description' => 'Minor car scratch while parking. Both parties settled.', 'status' => 'resolved', 'action_taken' => 'Statements recorded, CCTV clip saved.', 'resolved_at' => now()->subDay(), 'reported_by' => $sec?->id, 'created_at' => now()->subDays(2)]);

        // Staff CRM — employee profiles for every staff login, 10 days of attendance, tasks, leave.
        $depts = ['manager' => 'Administration', 'security' => 'Security', 'guard' => 'Security', 'inventory' => 'Stores', 'librarian' => 'Library', 'finance' => 'Accounts', 'hr' => 'HR', 'gym' => 'Club'];
        $emps = [];
        foreach ($staff as $i => $u) {
            $key = explode('@', $u->email)[0];
            $emps[] = Employee::create(['code' => 'EMP-'.str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT), 'user_id' => $u->id, 'name' => $u->name, 'department' => $depts[$key] ?? 'Operations',
                'designation' => $u->designation, 'phone' => $u->phone, 'joined_on' => now()->subMonths(6 + $i)->toDateString(), 'shift_start' => $key === 'guard' ? '20:00' : '09:00', 'shift_end' => $key === 'guard' ? '08:00' : '17:00',
                'basic_salary' => 35000 + $i * 5000, 'rfid_card' => 'RF'.str_pad((string) (10001 + $i), 6, '0', STR_PAD_LEFT)]);
        }
        foreach (['Rafiq Gardener' => 'Maintenance', 'Javed Electrician' => 'Maintenance', 'Akram Plumber' => 'Maintenance', 'Sweeper Team Lead' => 'Sanitation'] as $name => $dept) {
            $emps[] = Employee::create(['code' => 'EMP-'.str_pad((string) (count($emps) + 1), 4, '0', STR_PAD_LEFT), 'name' => $name, 'department' => $dept, 'designation' => explode(' ', $name)[1] ?? 'Worker', 'shift_start' => '08:00', 'shift_end' => '16:00', 'basic_salary' => 28000, 'rfid_card' => 'RF'.(20001 + count($emps))]);
        }
        foreach ($emps as $ei => $e) {
            for ($d = 9; $d >= 0; $d--) {
                $day = now()->subDays($d);
                if ($day->isSunday() || ($ei + $d) % 9 === 0) {
                    continue;
                }
                if ($d === 0 && ($e->shift_start > now()->format('H:i') || $ei % 4 === 3)) {
                    continue; // not in yet today
                }
                $in = Carbon::parse($day->toDateString().' '.$e->shift_start)->addMinutes((($ei * 7 + $d * 3) % 25) - 8);
                $out = $d === 0 ? null : (clone $in)->addMinutes(470 + (($ei + $d) % 5) * 20);
                $a = new Attendance(['employee_id' => $e->id, 'date' => $day->toDateString(), 'check_in' => $in, 'check_out' => $out, 'method' => $ei % 2 ? 'rfid' : 'web']);
                CrmController::compute($a, $e);
                $a->save();
            }
        }
        $creator = User::where('email', 'hr@demo.local')->first();
        foreach ([['Repaint speed breakers Block A', 'Maintenance', 0, 'high', 1], ['Monthly CCTV footage backup', 'Security', 1, 'normal', 2], ['Replace 6 street light bulbs', 'Maintenance', 9, 'urgent', 0], ['Stock audit — Main Store', 'Stores', 3, 'normal', 5], ['Prepare November payroll', 'Accounts', 5, 'high', 3]] as [$t, $dept, $ei, $p, $days]) {
            Task::create(['title' => $t, 'department' => $dept, 'employee_id' => $emps[min($ei, count($emps) - 1)]->id, 'created_by' => $creator?->id, 'priority' => $p, 'due_at' => now()->addDays($days)->setTime(17, 0), 'status' => $days === 0 ? 'in_progress' : 'todo']);
        }
        LeaveRequest::create(['employee_id' => $emps[1]->id, 'type' => 'casual', 'from' => now()->addDays(3)->toDateString(), 'to' => now()->addDays(4)->toDateString(), 'reason' => 'Family wedding in Hyderabad']);
        LeaveRequest::create(['employee_id' => $emps[3]->id, 'type' => 'sick', 'from' => now()->subDays(5)->toDateString(), 'to' => now()->subDays(4)->toDateString(), 'reason' => 'Fever', 'status' => 'approved', 'reviewed_by' => $creator?->id]);

        // Gym & club
        $plans = collect([['Monthly — Individual', 'individual', 30, 3500, 'gym'], ['Monthly — Family (4)', 'family', 30, 9000, 'gym,pool'], ['Quarterly — Individual', 'individual', 90, 9500, 'gym,pool,courts'], ['7-day Trial', 'trial', 7, 0, 'gym']])
            ->map(fn ($p) => GymPlan::create(['name' => $p[0], 'type' => $p[1], 'duration_days' => $p[2], 'price' => $p[3], 'facilities' => $p[4]]));
        $gymUser = User::where('email', 'gym@demo.local')->first();
        foreach ($residents->take(8) as $i => $r) {
            $plan = $plans[$i % 3];
            $end = match ($i) { 0 => now()->addDays(2), 3 => now()->subDays(4), default => now()->addDays(10 + $i * 5) };
            $m = GymMember::create(['member_no' => 'GYM-'.str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT), 'user_id' => $r->id, 'house_id' => $r->house_id, 'gym_plan_id' => $plan->id, 'name' => $r->name, 'phone' => '0333-'.(4440000 + $i),
                'rfid_card' => 'GC'.(70001 + $i), 'start_date' => $end->copy()->subDays($plan->duration_days - 1)->toDateString(), 'end_date' => $end->toDateString(), 'card_blocked' => $i === 6]);
            GymPayment::create(['gym_member_id' => $m->id, 'amount' => $plan->price, 'days' => $plan->duration_days, 'reference' => 'GP-DEMO'.str_pad((string) $i, 4, '0'), 'method' => $i % 2 ? 'qr' : 'cash', 'status' => 'paid', 'paid_at' => Carbon::parse($m->start_date), 'confirmed_by' => $gymUser?->id]);
            for ($c = 0; $c < 6; $c++) {
                GymCheckin::create(['gym_member_id' => $m->id, 'card' => $m->rfid_card, 'method' => 'rfid', 'allowed' => $i !== 3, 'reason' => $i === 3 ? 'Subscription expired' : 'Valid', 'created_at' => now()->subDays($c)->setTime(6 + ($i % 4), 15 * ($c % 4))]);
            }
        }
        $m = GymMember::where('member_no', 'GYM-0004')->first();
        if ($m) {
            GymPayment::create(['gym_member_id' => $m->id, 'amount' => $m->plan->price, 'days' => $m->plan->duration_days, 'reference' => 'GP-PEND0001', 'method' => 'qr', 'status' => 'pending']);
        }

        // Announcements
        $admin = User::whereIn('role', ['admin', 'super_admin'])->first() ?? $staff->first();
        Announcement::create(['title' => 'Water supply shutdown — Block B', 'body' => "Tank cleaning on Saturday 10 AM to 2 PM. Please store water in advance.\nSorry for the inconvenience.", 'category' => 'utility', 'priority' => 'important', 'audience' => 'all', 'pinned' => true, 'created_by' => $admin?->id, 'created_at' => now()->subHours(5)]);
        Announcement::create(['title' => 'Community Milad Mehfil', 'body' => 'All residents are invited to the Milad Mehfil at the Mosque lawn. Langar after Isha.', 'category' => 'event', 'priority' => 'normal', 'audience' => 'residents', 'created_by' => $admin?->id, 'created_at' => now()->subDay()]);
        Announcement::create(['title' => 'Staff: new attendance system', 'body' => 'From today please check in and out from the portal (My Workspace) or with your RFID card at the office.', 'category' => 'general', 'priority' => 'normal', 'audience' => 'staff', 'created_by' => $admin?->id, 'created_at' => now()->subDays(2)]);

        // A resolved SOS for history
        if ($r = $residents->get(5)) {
            SosAlert::create(['user_id' => $r->id, 'house_id' => $r->house_id, 'type' => 'medical', 'message' => 'Elderly father fainted', 'status' => 'resolved', 'responder_id' => $sec?->id,
                'responded_at' => now()->subDays(3)->addMinutes(2), 'resolved_at' => now()->subDays(3)->addMinutes(25), 'resolution' => 'Ambulance called, patient shifted to hospital.', 'created_at' => now()->subDays(3)]);
        }
    }
}
