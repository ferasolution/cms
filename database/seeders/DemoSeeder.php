<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Book;
use App\Models\BookIssue;
use App\Models\Complaint;
use App\Models\Event;
use App\Models\ExpenseRequest;
use App\Models\House;
use App\Models\InventoryIssue;
use App\Models\InventoryItem;
use App\Models\Noc;
use App\Models\NocStatusLog;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Visitor;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Demo community: 4 blocks × 3 streets × 6 houses, one login per role (password: "password"),
 * and sample records in every module so the portal can be shown to the client straight away.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! \App\Support\Tenant::id()) {
            \App\Support\Tenant::set(\App\Models\Society::orderBy('id')->first());
        }
        $D = \App\Support\DemoData::for();
        $amt = fn ($pkr) => \App\Support\DemoData::amount($pkr, $D);
        $names = $D['owners'];

        $houses = [];
        $i = 0;
        foreach (['A', 'B', 'C', 'D'] as $bi => $block) {
            for ($street = 1; $street <= 3; $street++) {
                for ($n = 1; $n <= 6; $n++) {
                    $houses[] = House::create([
                        'house_no' => (string) ($street * 100 + $n),
                        'block' => $block,
                        'street' => 'Street '.$street,
                        'owner_name' => $names[$i % count($names)],
                        'owner_phone' => \App\Support\DemoData::phone($i, $D),
                        'type' => $n === 6 && $street === 1 ? 'commercial' : 'house',
                        'grid_x' => ($bi % 2) * 8 + $n,
                        'grid_y' => intdiv($bi, 2) * 5 + $street,
                        'floors' => 1 + ($i % 3),
                        'monthly_maintenance' => $amt(3000 + ($i % 3) * 1000),
                    ]);
                    $i++;
                }
            }
        }

        // Demo staff = editors with a designation template (demo password for everyone: "password").
        $roles = ['manager' => [$D['staff']['manager'], 'Community Manager'], 'security' => [$D['staff']['security'], 'Security Manager'], 'inventory' => [$D['staff']['inventory'], 'Inventory Manager'],
            'librarian' => [$D['staff']['librarian'], 'Librarian'], 'finance' => [$D['staff']['finance'], 'Finance Manager'], 'hr' => [$D['staff']['hr'], 'HR Manager'], 'gym' => [$D['staff']['gym'], 'Gym Manager'], 'guard' => [$D['staff']['guard'], 'Security Guard']];
        $staff = [];
        User::firstOrCreate(['email' => 'admin@demo.local'], ['name' => 'Community Admin', 'role' => 'admin', 'password' => 'password', 'phone' => \App\Support\DemoData::phone(9001, $D)]);
        foreach ($roles as $key => [$name, $designation]) {
            $staff[$key] = User::firstOrCreate(['email' => $key.'@demo.local'], ['name' => $name, 'role' => 'editor', 'designation' => $designation, 'permissions' => \App\Support\Access::TEMPLATES[$designation], 'password' => 'password', 'phone' => \App\Support\DemoData::phone(rand(100, 999), $D)]);
        }
        $resident = User::firstOrCreate(['email' => 'resident@demo.local'], ['name' => $houses[0]->owner_name, 'role' => 'user', 'designation' => 'Household Owner', 'household_role' => 'owner', 'password' => 'password', 'house_id' => $houses[0]->id]);
        $residents = [$resident];
        foreach (array_slice($houses, 1, 7) as $h) {
            $residents[] = User::create(['name' => $h->owner_name, 'email' => strtolower(str_replace(' ', '.', $h->owner_name)).$h->id.'@demo.local', 'role' => 'user', 'household_role' => 'owner', 'password' => 'password', 'house_id' => $h->id]);
        }

        // Security
        $cats = ['visitor', 'guest', 'worker', 'relative', 'friend', 'delivery'];
        $purposes = $D['purposes'];
        for ($v = 0; $v < 30; $v++) {
            $entry = Carbon::now()->subHours(rand(0, 96))->subMinutes(rand(0, 59));
            Visitor::create([
                'house_id' => $houses[array_rand($houses)]->id,
                'name' => $D['visitor_first'][$v % 8].' '.$D['visitor_last'][$v % 4],
                'cnic' => \App\Support\DemoData::idNumber(rand(1, 99999), $D),
                'phone' => \App\Support\DemoData::phone(rand(1, 99999), $D),
                'category' => $cats[$v % count($cats)],
                'purpose' => $purposes[$v % count($purposes)],
                'vehicle_no' => $v % 3 ? \App\Support\DemoData::plate($v, $D) : null,
                'persons' => 1 + $v % 3,
                'gate' => $v % 2 ? 'Main Gate' : 'Gate 2',
                'entry_at' => $entry,
                'exit_at' => $v < 4 ? null : (clone $entry)->addMinutes(rand(20, 300)),
                'logged_by' => $staff['security']->id,
            ]);
        }

        // Inventory
        $items = [['Plastic Chairs', 'Furniture', 200, 'pcs'], [$D['tent'], 'Events', 6, 'pcs'], ['Water Pump 1HP', 'Maintenance', 3, 'pcs'],
            ['LED Flood Light', 'Electrical', 25, 'pcs'], ['Walkie Talkie', 'Security', 12, 'pcs'], ['Grass Cutter', 'Gardening', 2, 'pcs'],
            ['Paint (Gallons)', 'Maintenance', 4, 'gal'], ['Sound System', 'Events', 1, 'set'], ['First Aid Kit', 'Safety', 8, 'pcs'], ['Ladder 12ft', 'Maintenance', 2, 'pcs']];
        foreach ($items as $k => [$name, $cat, $qty, $unit]) {
            $item = InventoryItem::create(['name' => $name, 'sku' => 'INV-'.str_pad((string) ($k + 1), 4, '0', STR_PAD_LEFT), 'category' => $cat, 'quantity' => $qty, 'min_quantity' => max(1, intdiv($qty, 5)), 'unit' => $unit, 'location' => 'Main Store', 'unit_cost' => $amt(rand(5, 300) * 100)]);
            if ($k < 5) {
                InventoryIssue::create(['inventory_item_id' => $item->id, 'quantity' => min($qty, 1 + $k), 'issued_by' => $staff['inventory']->id, 'issued_to' => $D['issued_to'][$k], 'purpose' => $D['issue_purpose'][$k], 'issued_at' => now()->subDays($k + 1), 'expected_return' => now()->addDays(3 - $k), 'returned_at' => $k === 0 ? now() : null, 'returned_quantity' => $k === 0 ? 1 : 0]);
                $item->decrement('quantity', $k === 0 ? 0 : min($qty, 1 + $k));
            }
        }

        // Library
        $books = $D['books'];
        foreach ($books as $k => [$t, $a, $c]) {
            $book = Book::create(['title' => $t, 'author' => $a, 'category' => $c, 'isbn' => '978'.rand(1000000000, 9999999999), 'shelf' => 'S-'.(1 + $k % 4), 'copies' => 2, 'available' => 2]);
            if ($k < 4) {
                $status = ['requested', 'issued', 'issued', 'returned'][$k];
                BookIssue::create(['book_id' => $book->id, 'user_id' => $residents[$k]->id, 'status' => $status, 'issued_at' => $status !== 'requested' ? now()->subDays(10 - $k) : null, 'due_at' => $status !== 'requested' ? now()->addDays(4 - $k * 2) : null, 'returned_at' => $status === 'returned' ? now()->subDay() : null, 'issued_by' => $status !== 'requested' ? $staff['librarian']->id : null]);
                if ($status === 'issued') {
                    $book->decrement('available');
                }
            }
        }

        // Finance — 6 months of history
        for ($m = 5; $m >= 0; $m--) {
            $d = now()->startOfMonth()->subMonths($m);
            $period = $d->format('Y-m');
            foreach (array_slice($houses, 0, 40) as $h) {
                if ($m === 0 && $h->id % 4 === 0) {
                    continue; // some unpaid this month
                }
                Transaction::create(['type' => 'revenue', 'category' => 'maintenance', 'amount' => $h->monthly_maintenance, 'house_id' => $h->id, 'period' => $period, 'date' => (clone $d)->addDays(rand(0, 9)), 'reference' => 'MNT-'.$period.'-'.$h->id, 'recorded_by' => $staff['finance']->id]);
            }
            foreach (array_values($staff) as $si => $s) {
                Transaction::create(['type' => 'salary', 'category' => 'salary', 'amount' => $amt([55000, 45000, 38000, 40000, 60000, 50000, 42000, 32000][$si % 8]), 'staff_id' => $s->id, 'party' => $s->name, 'period' => $period, 'date' => (clone $d)->endOfMonth(), 'recorded_by' => $staff['finance']->id]);
            }
            Transaction::create(['type' => 'expense', 'category' => 'utilities', 'amount' => $amt(rand(60, 95) * 1000), 'party' => $D['utility'], 'description' => 'Street lights & pumps', 'date' => (clone $d)->addDays(14), 'recorded_by' => $staff['finance']->id]);
            Transaction::create(['type' => 'expense', 'category' => 'repair', 'amount' => $amt(rand(10, 40) * 1000), 'party' => 'Local vendor', 'description' => 'General repairs', 'date' => (clone $d)->addDays(18), 'recorded_by' => $staff['finance']->id]);
            Transaction::create(['type' => 'revenue', 'category' => 'event', 'amount' => $amt(rand(10, 30) * 1000), 'description' => 'Hall booking charges', 'date' => (clone $d)->addDays(20), 'recorded_by' => $staff['finance']->id]);
            Transaction::create(['type' => 'revenue', 'category' => 'fine', 'amount' => $amt(rand(2, 8) * 1000), 'description' => 'Late payment / parking fines', 'date' => (clone $d)->addDays(22), 'recorded_by' => $staff['finance']->id]);
        }
        ExpenseRequest::create(['requested_by' => $staff['manager']->id, 'title' => 'Park benches replacement', 'amount' => $amt(85000), 'category' => 'repair', 'purpose' => '6 broken benches in Block B park']);
        ExpenseRequest::create(['requested_by' => $staff['security']->id, 'title' => 'CCTV camera for Gate 2', 'amount' => $amt(42000), 'category' => 'security', 'purpose' => 'Existing camera not working']);

        // Events
        $evs = array_map(fn ($e, $x) => [...$e, ...$x], $D['events'], [[2, 'pending', 150], [0, 'approved', 40], [5, 'approved', 200], [-3, 'completed', 80]]);
        foreach ($evs as $k => [$t, $type, $venue, $days, $status, $guests]) {
            $start = $days === 0 ? now()->subHours(2)->format('H:00') : '19:00';
            $end = $days === 0 ? now()->addMinutes(50)->format('H:i') : '23:00';
            Event::create(['code' => $status === 'pending' ? null : 'EVT-'.strtoupper(substr(md5($t), 0, 6)), 'house_id' => $houses[$k + 2]->id, 'requested_by' => $residents[$k]->id, 'title' => $t, 'type' => $type, 'venue' => $venue, 'date' => now()->addDays($days)->toDateString(), 'start_time' => $start, 'end_time' => $end, 'guests' => $guests, 'vehicles' => intdiv($guests, 5), 'charges' => $amt(5000 + $guests * 50), 'status' => $status, 'approved_by' => $status !== 'pending' ? $staff['manager']->id : null]);
        }

        // Complaints
        $cs = [['plumbing', 'Water leakage in street', 'high', 'open'], ['electrical', 'Street light not working', 'normal', 'assigned'], ['cleaning', 'Garbage not collected', 'urgent', 'in_progress'],
            ['gardening', 'Park grass overgrown', 'low', 'resolved'], ['security', 'Gate 2 barrier stuck', 'high', 'resolved'], ['construction', 'Neighbour construction debris', 'normal', 'open']];
        foreach ($cs as $k => [$cat, $title, $pri, $status]) {
            Complaint::create(['ticket_no' => 'CMP-'.str_pad((string) ($k + 1), 5, '0', STR_PAD_LEFT), 'house_id' => $residents[$k]->house_id, 'user_id' => $residents[$k]->id, 'category' => $cat, 'title' => $title, 'description' => $title.' — please resolve soon.', 'priority' => $pri, 'status' => $status,
                'assigned_worker' => $status !== 'open' ? $D['workers'][$k % 5] : null, 'assigned_by' => $status !== 'open' ? $staff['manager']->id : null, 'assigned_at' => $status !== 'open' ? now()->subDays(2) : null,
                'resolution' => $status === 'resolved' ? 'Issue fixed and verified on site.' : null, 'resolved_at' => $status === 'resolved' ? now()->subDay() : null, 'created_at' => now()->subDays(6 - $k)]);
        }

        // NOC
        foreach ([['sale_transfer', 'under_review'], ['construction', 'documents_required'], ['utility_connection', 'completed']] as $k => [$type, $status]) {
            $noc = Noc::create(['reference' => 'NOC-'.now()->format('y').'-'.str_pad((string) ($k + 1), 4, '0', STR_PAD_LEFT), 'house_id' => $residents[$k]->house_id, 'user_id' => $residents[$k]->id, 'type' => $type, 'details' => 'Application for '.str_replace('_', ' ', $type), 'status' => $status, 'completed_at' => $status === 'completed' ? now() : null]);
            foreach (array_slice(['submitted', 'under_review', 'documents_required', 'approved', 'completed'], 0, ['under_review' => 2, 'documents_required' => 3, 'completed' => 5][$status]) as $s) {
                if ($status === 'completed' && $s === 'documents_required') {
                    continue;
                }
                NocStatusLog::create(['noc_id' => $noc->id, 'status' => $s, 'note' => ucfirst(str_replace('_', ' ', $s)), 'user_id' => $s === 'submitted' ? $residents[$k]->id : $staff['manager']->id]);
            }
        }

        $log = [['security', 'create', 'Visitor '.$D['visitor_first'][0].' '.$D['visitor_last'][0].' entered for A-101'], ['inventory', 'issue', 'Issued 3 × LED Flood Light to '.$D['issued_to'][1]], ['library', 'issue', 'Issued "'.$D['books'][1][0].'" to resident'],
            ['finance', 'create', 'Recorded maintenance payment from A-102'], ['events', 'approve', 'Approved event "'.$D['events'][2][0].'"'], ['complaints', 'assign', 'Assigned CMP-00002 to '.$D['workers'][1]], ['noc', 'status', 'NOC-'.now()->format('y').'-0002 marked documents required']];
        foreach ($log as $k => [$mod, $act, $desc]) {
            ActivityLog::create(['user_id' => $staff[['security' => 'security', 'inventory' => 'inventory', 'library' => 'librarian', 'finance' => 'finance'][$mod] ?? 'manager']->id, 'module' => $mod, 'action' => $act, 'description' => $desc, 'created_at' => now()->subMinutes(15 * (7 - $k))]);
        }

        $this->call(DemoExtrasSeeder::class);
    }
}
