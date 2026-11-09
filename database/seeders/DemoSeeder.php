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
        $names = ['Ahmed Khan', 'Fatima Ali', 'Usman Tariq', 'Ayesha Siddiqui', 'Bilal Hussain', 'Sana Malik', 'Hamza Qureshi', 'Zainab Raza',
            'Imran Sheikh', 'Hira Javed', 'Faisal Mirza', 'Mariam Aslam', 'Kashif Abbasi', 'Nadia Iqbal', 'Omar Farooq', 'Rabia Anwar'];

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
                        'owner_phone' => '0300-'.str_pad((string) (1000000 + $i * 7919 % 8999999), 7, '0', STR_PAD_LEFT),
                        'type' => $n === 6 && $street === 1 ? 'commercial' : 'house',
                        'grid_x' => ($bi % 2) * 8 + $n,
                        'grid_y' => intdiv($bi, 2) * 5 + $street,
                        'floors' => 1 + ($i % 3),
                        'monthly_maintenance' => 3000 + ($i % 3) * 1000,
                    ]);
                    $i++;
                }
            }
        }

        $roles = ['manager' => 'Saad Manager', 'security' => 'Gate Security', 'inventory' => 'Store Keeper', 'librarian' => 'Librarian', 'finance' => 'Accounts Officer'];
        $staff = [];
        foreach ($roles as $role => $name) {
            $staff[$role] = User::firstOrCreate(['email' => $role.'@demo.local'], ['name' => $name, 'role' => $role, 'password' => 'password', 'phone' => '0321-5550'.rand(100, 999)]);
        }
        $resident = User::firstOrCreate(['email' => 'resident@demo.local'], ['name' => $houses[0]->owner_name, 'role' => 'resident', 'password' => 'password', 'house_id' => $houses[0]->id]);
        $residents = [$resident];
        foreach (array_slice($houses, 1, 7) as $h) {
            $residents[] = User::create(['name' => $h->owner_name, 'email' => strtolower(str_replace(' ', '.', $h->owner_name)).$h->id.'@demo.local', 'role' => 'resident', 'password' => 'password', 'house_id' => $h->id]);
        }

        // Security
        $cats = ['visitor', 'guest', 'worker', 'relative', 'friend', 'delivery'];
        $purposes = ['Family visit', 'Plumbing work', 'Courier delivery', 'Dinner invitation', 'Electric repair', 'Tuition', 'House cleaning'];
        for ($v = 0; $v < 30; $v++) {
            $entry = Carbon::now()->subHours(rand(0, 96))->subMinutes(rand(0, 59));
            Visitor::create([
                'house_id' => $houses[array_rand($houses)]->id,
                'name' => ['Ali Raza', 'Kamran', 'Shahid', 'Asif', 'Naveed', 'Tahir', 'Waqas', 'Junaid'][$v % 8].' '.['Ahmed', 'Butt', 'Khan', 'Shah'][$v % 4],
                'cnic' => '42101-'.rand(1000000, 9999999).'-'.rand(1, 9),
                'phone' => '0333-'.rand(1000000, 9999999),
                'category' => $cats[$v % count($cats)],
                'purpose' => $purposes[$v % count($purposes)],
                'vehicle_no' => $v % 3 ? 'KHI-'.rand(100, 9999) : null,
                'persons' => 1 + $v % 3,
                'gate' => $v % 2 ? 'Main Gate' : 'Gate 2',
                'entry_at' => $entry,
                'exit_at' => $v < 4 ? null : (clone $entry)->addMinutes(rand(20, 300)),
                'logged_by' => $staff['security']->id,
            ]);
        }

        // Inventory
        $items = [['Plastic Chairs', 'Furniture', 200, 'pcs'], ['Shamiana Tent', 'Events', 6, 'pcs'], ['Water Pump 1HP', 'Maintenance', 3, 'pcs'],
            ['LED Flood Light', 'Electrical', 25, 'pcs'], ['Walkie Talkie', 'Security', 12, 'pcs'], ['Grass Cutter', 'Gardening', 2, 'pcs'],
            ['Paint (Gallons)', 'Maintenance', 4, 'gal'], ['Sound System', 'Events', 1, 'set'], ['First Aid Kit', 'Safety', 8, 'pcs'], ['Ladder 12ft', 'Maintenance', 2, 'pcs']];
        foreach ($items as $k => [$name, $cat, $qty, $unit]) {
            $item = InventoryItem::create(['name' => $name, 'sku' => 'INV-'.str_pad((string) ($k + 1), 4, '0', STR_PAD_LEFT), 'category' => $cat, 'quantity' => $qty, 'min_quantity' => max(1, intdiv($qty, 5)), 'unit' => $unit, 'location' => 'Main Store', 'unit_cost' => rand(5, 300) * 100]);
            if ($k < 5) {
                InventoryIssue::create(['inventory_item_id' => $item->id, 'quantity' => min($qty, 1 + $k), 'issued_by' => $staff['inventory']->id, 'issued_to' => ['Gardener Rafiq', 'Electrician Javed', 'Security Supervisor', 'Event Committee', 'Plumber Akram'][$k], 'purpose' => ['Park maintenance', 'Street light repair', 'Night patrol', 'Community iftar', 'Water line fix'][$k], 'issued_at' => now()->subDays($k + 1), 'expected_return' => now()->addDays(3 - $k), 'returned_at' => $k === 0 ? now() : null, 'returned_quantity' => $k === 0 ? 1 : 0]);
                $item->decrement('quantity', $k === 0 ? 0 : min($qty, 1 + $k));
            }
        }

        // Library
        $books = [['Aangan', 'Khadija Mastoor', 'Urdu Novel'], ['Udaas Naslain', 'Abdullah Hussain', 'Urdu Novel'], ['Raja Gidh', 'Bano Qudsia', 'Urdu Novel'],
            ['Atomic Habits', 'James Clear', 'Self Help'], ['Sapiens', 'Yuval Noah Harari', 'History'], ['Clean Code', 'Robert C. Martin', 'Technology'],
            ['The Alchemist', 'Paulo Coelho', 'Fiction'], ['Shahab Nama', 'Qudratullah Shahab', 'Biography'], ['Pir-e-Kamil', 'Umera Ahmed', 'Urdu Novel'], ['A Brief History of Time', 'Stephen Hawking', 'Science']];
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
            foreach ($staff as $s) {
                Transaction::create(['type' => 'salary', 'category' => 'salary', 'amount' => [55000, 45000, 38000, 40000, 60000][array_search($s->role, array_keys($staff))], 'staff_id' => $s->id, 'party' => $s->name, 'period' => $period, 'date' => (clone $d)->endOfMonth(), 'recorded_by' => $staff['finance']->id]);
            }
            Transaction::create(['type' => 'expense', 'category' => 'utilities', 'amount' => rand(60, 95) * 1000, 'party' => 'K-Electric', 'description' => 'Street lights & pumps', 'date' => (clone $d)->addDays(14), 'recorded_by' => $staff['finance']->id]);
            Transaction::create(['type' => 'expense', 'category' => 'repair', 'amount' => rand(10, 40) * 1000, 'party' => 'Local vendor', 'description' => 'General repairs', 'date' => (clone $d)->addDays(18), 'recorded_by' => $staff['finance']->id]);
            Transaction::create(['type' => 'revenue', 'category' => 'event', 'amount' => rand(10, 30) * 1000, 'description' => 'Hall booking charges', 'date' => (clone $d)->addDays(20), 'recorded_by' => $staff['finance']->id]);
            Transaction::create(['type' => 'revenue', 'category' => 'fine', 'amount' => rand(2, 8) * 1000, 'description' => 'Late payment / parking fines', 'date' => (clone $d)->addDays(22), 'recorded_by' => $staff['finance']->id]);
        }
        ExpenseRequest::create(['requested_by' => $staff['manager']->id, 'title' => 'Park benches replacement', 'amount' => 85000, 'category' => 'repair', 'purpose' => '6 broken benches in Block B park']);
        ExpenseRequest::create(['requested_by' => $staff['security']->id, 'title' => 'CCTV camera for Gate 2', 'amount' => 42000, 'category' => 'security', 'purpose' => 'Existing camera not working']);

        // Events
        $evs = [['Walima Reception', 'wedding', 'Community Hall', 2, 'pending', 150], ['Birthday Party', 'birthday', 'Club Lawn', 0, 'approved', 40], ['Milad Mehfil', 'religious', 'Mosque Lawn', 5, 'approved', 200], ['Cricket Tournament', 'sports', 'Ground', -3, 'completed', 80]];
        foreach ($evs as $k => [$t, $type, $venue, $days, $status, $guests]) {
            $start = $days === 0 ? now()->subHours(2)->format('H:00') : '19:00';
            $end = $days === 0 ? now()->addMinutes(50)->format('H:i') : '23:00';
            Event::create(['code' => 'EVT-'.strtoupper(substr(md5($t), 0, 6)), 'house_id' => $houses[$k + 2]->id, 'requested_by' => $residents[$k]->id, 'title' => $t, 'type' => $type, 'venue' => $venue, 'date' => now()->addDays($days)->toDateString(), 'start_time' => $start, 'end_time' => $end, 'guests' => $guests, 'vehicles' => intdiv($guests, 5), 'charges' => 5000 + $guests * 50, 'status' => $status, 'approved_by' => $status !== 'pending' ? $staff['manager']->id : null]);
        }

        // Complaints
        $cs = [['plumbing', 'Water leakage in street', 'high', 'open'], ['electrical', 'Street light not working', 'normal', 'assigned'], ['cleaning', 'Garbage not collected', 'urgent', 'in_progress'],
            ['gardening', 'Park grass overgrown', 'low', 'resolved'], ['security', 'Gate 2 barrier stuck', 'high', 'resolved'], ['construction', 'Neighbour construction debris', 'normal', 'open']];
        foreach ($cs as $k => [$cat, $title, $pri, $status]) {
            Complaint::create(['ticket_no' => 'CMP-'.str_pad((string) ($k + 1), 5, '0', STR_PAD_LEFT), 'house_id' => $residents[$k]->house_id, 'user_id' => $residents[$k]->id, 'category' => $cat, 'title' => $title, 'description' => $title.' — please resolve soon.', 'priority' => $pri, 'status' => $status,
                'assigned_worker' => $status !== 'open' ? ['Akram (Plumber)', 'Javed (Electrician)', 'Sweeper Team', 'Rafiq (Gardener)', 'Maintenance Team'][$k % 5] : null, 'assigned_by' => $status !== 'open' ? $staff['manager']->id : null, 'assigned_at' => $status !== 'open' ? now()->subDays(2) : null,
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

        $log = [['security', 'create', 'Visitor Ali Raza Ahmed entered for A-101'], ['inventory', 'issue', 'Issued 3 × LED Flood Light to Electrician Javed'], ['library', 'issue', 'Issued "Udaas Naslain" to resident'],
            ['finance', 'create', 'Recorded maintenance payment from A-102'], ['events', 'approve', 'Approved event "Milad Mehfil"'], ['complaints', 'assign', 'Assigned CMP-00002 to Javed (Electrician)'], ['noc', 'status', 'NOC-'.now()->format('y').'-0002 marked documents required']];
        foreach ($log as $k => [$mod, $act, $desc]) {
            ActivityLog::create(['user_id' => $staff[['security' => 'security', 'inventory' => 'inventory', 'library' => 'librarian', 'finance' => 'finance'][$mod] ?? 'manager']->id, 'module' => $mod, 'action' => $act, 'description' => $desc, 'created_at' => now()->subMinutes(15 * (7 - $k))]);
        }
    }
}
