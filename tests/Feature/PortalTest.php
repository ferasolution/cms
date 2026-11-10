<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Event;
use App\Models\House;
use App\Models\InventoryItem;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PortalTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        $this->admin = User::create(['name' => 'Super', 'email' => 'adh@test.local', 'password' => 'password', 'role' => 'super_admin']);
        Storage::fake('local');
    }

    private function as(string $role): User
    {
        return $role === 'admin' ? $this->admin : User::where('email', $role.'@demo.local')->firstOrFail();
    }

    public function test_spa_and_login(): void
    {
        $this->get('/')->assertSuccessful()->assertSee('id="root"', false);
        $this->get('/complaints')->assertSuccessful();
        $this->getJson('/api/me')->assertUnauthorized();
        $this->postJson('/api/login', ['email' => 'adh@test.local', 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/login', ['email' => 'adh@test.local', 'password' => 'password'])
            ->assertSuccessful()->assertJsonPath('user.role', 'super_admin')->assertJsonCount(14, 'modules');
    }

    public function test_every_role_can_load_dashboard_alerts_and_map(): void
    {
        foreach (['admin', 'manager', 'security', 'inventory', 'librarian', 'finance', 'hr', 'gym', 'guard', 'resident'] as $role) {
            $u = $this->as($role);
            $this->actingAs($u)->getJson('/api/dashboard')->assertSuccessful()->assertJsonStructure(['cards', 'activity']);
            $this->actingAs($u)->getJson('/api/alerts')->assertSuccessful()->assertJsonStructure(['alerts', 'unread']);
            $this->actingAs($u)->getJson('/api/map')->assertSuccessful();
            $this->actingAs($u)->getJson('/api/me')->assertSuccessful();
        }
        $this->actingAs($this->admin)->getJson('/api/activity')->assertSuccessful();
    }

    public function test_module_lists_load_for_admin(): void
    {
        foreach (['visitors', 'visitors/stats', 'inventory', 'inventory/issues', 'library/books', 'library/categories', 'library/issues',
            'finance/transactions', 'finance/summary', 'finance/maintenance', 'finance/salaries', 'finance/expense-requests',
            'events', 'events/rates', 'complaints', 'complaints/report', 'noc', 'noc/checklists', 'records', 'houses', 'houses?all=1', 'users',
            'users?staff=1', 'houses/1'] as $url) {
            $this->actingAs($this->admin)->getJson('/api/'.$url)->assertSuccessful();
        }
    }

    public function test_permissions(): void
    {
        $resident = $this->as('resident');
        $this->actingAs($resident)->getJson('/api/visitors')->assertSuccessful(); // own household only
        $this->actingAs($resident)->getJson('/api/gate/watchlist')->assertForbidden();
        $this->actingAs($resident)->getJson('/api/inventory')->assertForbidden();
        $this->actingAs($resident)->getJson('/api/finance/transactions')->assertForbidden();
        $this->actingAs($resident)->getJson('/api/users')->assertForbidden();
        $this->actingAs($this->as('security'))->getJson('/api/finance/transactions')->assertForbidden();
        $this->actingAs($this->as('security'))->getJson('/api/visitors')->assertSuccessful();
        $other = House::where('id', '!=', $resident->house_id)->first();
        $this->actingAs($resident)->getJson('/api/houses/'.$other->id)->assertForbidden();
    }

    public function test_security_entry_and_exit_notifies_household(): void
    {
        $house = House::first();
        $sec = $this->as('security');
        $r = $this->actingAs($sec)->post('/api/visitors', [
            'name' => 'Test Guest', 'category' => 'guest', 'purpose' => 'Dinner', 'house_id' => $house->id, 'request_approval' => false,
            'photo' => UploadedFile::fake()->image('p.jpg'),
        ], ['Accept' => 'application/json'])->assertSuccessful();
        $id = $r->json('id');
        $this->actingAs($sec)->postJson("/api/visitors/{$id}/checkout")->assertSuccessful()->assertJsonPath('id', $id);
        $this->actingAs($sec)->postJson("/api/visitors/{$id}/checkout")->assertUnprocessable();
        $resident = User::where('house_id', $house->id)->first();
        $this->actingAs($resident)->getJson('/api/alerts')->assertSuccessful()->assertJsonFragment(['title' => 'Visitor entered: Test Guest']);
        $this->actingAs($sec)->get('/files/'.$r->json('photo_path'))->assertSuccessful();
        $this->actingAs($resident)->get('/files/'.$r->json('photo_path'))->assertSuccessful(); // own household's visitor
        $other = User::where('role', 'user')->where('house_id', '!=', $house->id)->first();
        $this->actingAs($other)->get('/files/'.$r->json('photo_path'))->assertForbidden();
    }

    public function test_inventory_issue_and_return(): void
    {
        $item = InventoryItem::where('quantity', '>', 5)->first();
        $u = $this->as('inventory');
        $issue = $this->actingAs($u)->postJson('/api/inventory/issues', ['inventory_item_id' => $item->id, 'quantity' => 2, 'issued_to' => 'Rafiq', 'purpose' => 'Test'])->assertSuccessful();
        $this->assertSame($item->quantity - 2, $item->fresh()->quantity);
        $this->actingAs($u)->postJson('/api/inventory/issues', ['inventory_item_id' => $item->id, 'quantity' => 99999, 'issued_to' => 'X', 'purpose' => 'Y'])->assertUnprocessable();
        $this->actingAs($u)->postJson('/api/inventory/issues/'.$issue->json('id').'/return', ['returned_quantity' => 2])->assertSuccessful();
        $this->assertSame($item->quantity, $item->fresh()->quantity);
    }

    public function test_library_request_issue_return(): void
    {
        $book = Book::where('available', '>', 0)->orderByDesc('id')->first();
        $resident = $this->as('resident');
        $req = $this->actingAs($resident)->postJson("/api/library/books/{$book->id}/request")->assertSuccessful();
        $this->actingAs($resident)->postJson("/api/library/books/{$book->id}/request")->assertUnprocessable();
        $this->actingAs($this->as('librarian'))->postJson('/api/library/issues', ['issue_id' => $req->json('id')])->assertSuccessful()->assertJsonPath('status', 'issued');
        $this->assertSame($book->available - 1, $book->fresh()->available);
        $this->actingAs($this->as('librarian'))->postJson('/api/library/issues/'.$req->json('id').'/return')->assertSuccessful();
        $this->actingAs($this->as('librarian'))->post('/api/library/books', ['title' => 'E Book', 'copies' => 1, 'ebook' => UploadedFile::fake()->create('b.pdf', 50, 'application/pdf')], ['Accept' => 'application/json'])->assertSuccessful();
    }

    public function test_finance_flow(): void
    {
        $fin = $this->as('finance');
        $this->actingAs($fin)->postJson('/api/finance/transactions', ['type' => 'revenue', 'category' => 'maintenance', 'amount' => 3000, 'house_id' => 1, 'period' => now()->format('Y-m'), 'date' => now()->toDateString()])->assertSuccessful();
        $req = $this->actingAs($this->as('security'))->postJson('/api/finance/expense-requests', ['title' => 'Torch', 'amount' => 1500, 'category' => 'security'])->assertSuccessful();
        $this->actingAs($fin)->postJson('/api/finance/expense-requests/'.$req->json('id').'/review', ['status' => 'approved'])->assertForbidden();
        $this->actingAs($this->admin)->postJson('/api/finance/expense-requests/'.$req->json('id').'/review', ['status' => 'approved'])->assertSuccessful();
        $this->actingAs($fin)->postJson('/api/finance/expense-requests/'.$req->json('id').'/pay')->assertSuccessful()->assertJsonPath('status', 'paid');
        $this->actingAs($this->as('security'))->getJson('/api/finance/expense-requests')->assertSuccessful()->assertJsonCount(2, 'data');
        $this->actingAs($this->as('resident'))->getJson('/api/finance/my')->assertSuccessful()->assertJsonStructure(['months', 'outstanding', 'payments']);
        $this->actingAs($this->as('resident'))->getJson('/api/finance/expense-requests')->assertForbidden();
    }

    public function test_event_request_approve_and_time_alerts(): void
    {
        $resident = $this->as('resident');
        $this->actingAs($resident)->postJson('/api/events/quote', ['venue' => 'Community Hall', 'type' => 'wedding', 'start_time' => '19:00', 'end_time' => '23:30', 'guests' => 100])
            ->assertSuccessful()->assertJsonPath('total', 3000 * 5 + 100 * 30 + 400 * 5 + 10000 + 2000);
        $ev = $this->actingAs($resident)->postJson('/api/events', ['title' => 'Mehndi', 'type' => 'wedding', 'venue' => 'Community Hall', 'date' => now()->toDateString(), 'start_time' => now()->subHours(3)->format('H:i'), 'end_time' => now()->subMinutes(5)->format('H:i'), 'guests' => 50, 'grace_minutes' => 0])->assertSuccessful();
        $this->actingAs($this->as('manager'))->postJson('/api/events/'.$ev->json('id').'/status', ['status' => 'approved', 'record_payment' => true])->assertSuccessful()->assertJsonPath('status', 'approved');
        $code = Event::find($ev->json('id'))->code;
        $this->actingAs($this->as('security'))->getJson('/api/events/verify/'.$code)->assertSuccessful();
        // the poll triggers the watcher: event already over → danger alert to security
        if (now()->hour >= 4) { // skip around midnight, when "3 hours ago" falls on the previous day
            $this->actingAs($this->as('security'))->getJson('/api/alerts')->assertSuccessful();
            $this->assertTrue(\App\Models\Alert::where('level', 'danger')->where('audience_module', 'security')->exists());
        }
        $this->actingAs($this->admin)->putJson('/api/events/rates', ['venues' => ['Hall' => 100], 'per_guest' => 1, 'per_vehicle' => 1, 'security_per_hour' => 1, 'late_night_surcharge' => 0, 'type_surcharge' => ['wedding' => 0]])->assertSuccessful()->assertJsonPath('venues.Hall', 100);
    }

    public function test_complaint_lifecycle(): void
    {
        $resident = $this->as('resident');
        $c = $this->actingAs($resident)->postJson('/api/complaints', ['category' => 'plumbing', 'title' => 'Leak', 'priority' => 'urgent'])->assertSuccessful();
        $mgr = $this->as('manager');
        $this->actingAs($mgr)->postJson('/api/complaints/'.$c->json('id').'/assign', ['assigned_worker' => 'Akram'])->assertSuccessful();
        $this->actingAs($mgr)->postJson('/api/complaints/'.$c->json('id').'/status', ['status' => 'resolved', 'resolution' => 'Fixed'])->assertSuccessful();
        $this->actingAs($resident)->postJson('/api/complaints/'.$c->json('id').'/rate', ['rating' => 5])->assertSuccessful();
        $this->actingAs($resident)->getJson('/api/complaints')->assertSuccessful()->assertJsonFragment(['ticket_no' => $c->json('ticket_no') ?? 'CMP-'.str_pad((string) $c->json('id'), 5, '0', STR_PAD_LEFT)]);
    }

    public function test_noc_and_record_room(): void
    {
        $resident = $this->as('resident');
        $noc = $this->actingAs($resident)->post('/api/noc', ['type' => 'rental', 'documents' => [UploadedFile::fake()->create('cnic.pdf', 20, 'application/pdf')], 'document_names' => ['CNIC of owner']], ['Accept' => 'application/json'])->assertSuccessful();
        $this->actingAs($this->as('manager'))->postJson('/api/noc/'.$noc->json('id').'/status', ['status' => 'documents_required', 'note' => 'Need tenant CNIC'])->assertSuccessful();
        $this->actingAs($resident)->post('/api/noc/'.$noc->json('id').'/documents', ['documents' => [UploadedFile::fake()->image('t.jpg')]], ['Accept' => 'application/json'])->assertSuccessful()->assertJsonPath('status', 'under_review');

        $file = $this->actingAs($this->as('manager'))->post('/api/records', ['house_id' => $resident->house_id, 'title' => 'Allotment', 'category' => 'allotment', 'files' => [UploadedFile::fake()->create('a.pdf', 30, 'application/pdf')]], ['Accept' => 'application/json'])->assertSuccessful();
        $this->actingAs($resident)->getJson('/api/records')->assertSuccessful()->assertJsonCount(1, 'data');
        $this->actingAs($resident)->get('/files/'.$file->json('0.path'))->assertSuccessful();
        $stranger = User::where('role', 'user')->where('house_id', '!=', $resident->house_id)->first();
        $this->actingAs($stranger)->getJson('/api/records')->assertSuccessful()->assertJsonCount(0, 'data');
        $this->actingAs($stranger)->get('/files/'.$file->json('0.path'))->assertForbidden();
    }

    public function test_admin_manages_users_and_deploy_hook_is_protected(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', ['name' => 'New Guard', 'email' => 'g@x.local', 'role' => 'editor', 'designation' => 'Security Guard', 'permissions' => ['security' => 2], 'password' => 'secret123'])->assertSuccessful()->assertJsonPath('levels.security', 2);
        $this->actingAs($this->admin)->postJson('/api/houses', ['house_no' => '999', 'block' => 'Z', 'type' => 'house'])->assertSuccessful();
        $this->postJson('/system/deploy')->assertForbidden();
    }

    public function test_user_panel_roles_and_permissions(): void
    {
        $admin = User::where('email', 'admin@demo.local')->first();
        $this->actingAs($admin)->getJson('/api/users/meta')->assertSuccessful()->assertJsonPath('can_super', false);
        // admin cannot create or touch a super admin
        $this->actingAs($admin)->postJson('/api/users', ['name' => 'X', 'email' => 'x@x.l', 'role' => 'super_admin', 'password' => 'secret123'])->assertUnprocessable();
        $this->actingAs($admin)->putJson('/api/users/'.$this->admin->id, ['name' => 'Hack', 'email' => $this->admin->email, 'role' => 'user'])->assertForbidden();
        // editor gets exactly the modules granted
        $ed = $this->actingAs($this->admin)->postJson('/api/users', ['name' => 'Lib Two', 'email' => 'lib2@x.l', 'role' => 'editor', 'permissions' => ['library' => 3, 'bogus' => 3], 'password' => 'secret123'])->assertSuccessful();
        $editor = User::find($ed->json('id'));
        $this->actingAs($editor)->getJson('/api/inventory')->assertForbidden();
        $this->actingAs($editor)->getJson('/api/library/issues')->assertSuccessful();
        $this->assertSame(['library' => 3], $editor->permissions);
        // a "user" can never be raised above view
        $u = $this->actingAs($this->admin)->postJson('/api/users', ['name' => 'Res', 'email' => 'r@x.l', 'role' => 'user', 'permissions' => ['finance' => 3, 'inventory' => 3], 'password' => 'secret123'])->assertSuccessful();
        $this->assertSame(1, \App\Support\Access::level(User::find($u->json('id')), 'inventory'));
        $this->actingAs(User::find($u->json('id')))->getJson('/api/finance/transactions')->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/users/'.$editor->id.'/history')->assertSuccessful();
    }

    public function test_gate_approval_pass_scan_watchlist_and_overstay(): void
    {
        $resident = $this->as('resident');
        $guard = $this->as('guard');
        // arrival → household approves
        $v = $this->actingAs($guard)->postJson('/api/visitors', ['name' => 'Cousin', 'category' => 'relative', 'purpose' => 'Visit', 'house_id' => $resident->house_id])->assertSuccessful()->assertJsonPath('status', 'awaiting');
        $this->actingAs($this->as('librarian'))->postJson('/api/visitors/'.$v->json('id').'/respond', ['decision' => 'approve'])->assertForbidden();
        $this->actingAs($resident)->postJson('/api/visitors/'.$v->json('id').'/respond', ['decision' => 'approve', 'stay_minutes' => 30])->assertSuccessful()->assertJsonPath('status', 'inside');
        // pre-registered QR pass → scan → entry with pass
        $p = $this->actingAs($resident)->postJson('/api/gate/passes', ['visitor_name' => 'Ali', 'category' => 'guest', 'valid_from' => now()->subMinute()->toDateTimeString(), 'valid_until' => now()->addHours(2)->toDateTimeString()])->assertSuccessful();
        $code = $p->json('code');
        $this->actingAs($guard)->postJson('/api/gate/scan', ['code' => $code])->assertSuccessful()->assertJsonPath('valid', true)->assertJsonPath('kind', 'pass');
        $this->actingAs($guard)->postJson('/api/visitors', ['name' => 'Ali', 'category' => 'guest', 'purpose' => 'Dinner', 'pass_code' => $code])->assertSuccessful()->assertJsonPath('status', 'inside');
        $this->actingAs($guard)->postJson('/api/gate/scan', ['code' => $code])->assertSuccessful()->assertJsonPath('valid', false);
        // blacklist blocks entry
        $this->actingAs($this->as('security'))->postJson('/api/gate/watchlist', ['cnic' => '42101-1111111-1', 'level' => 'blocked', 'reason' => 'Theft'])->assertSuccessful();
        $this->actingAs($guard)->postJson('/api/visitors', ['name' => 'Bad', 'cnic' => '4210111111111', 'category' => 'visitor', 'purpose' => 'x'])->assertUnprocessable();
        // vehicle scan + incident
        $this->actingAs($resident)->postJson('/api/gate/vehicles', ['plate' => 'abc-123', 'type' => 'car'])->assertSuccessful();
        $this->actingAs($guard)->postJson('/api/gate/scan', ['code' => 'ABC123'])->assertSuccessful()->assertJsonPath('kind', 'vehicle')->assertJsonPath('valid', true);
        $this->actingAs($guard)->postJson('/api/gate/incidents', ['type' => 'suspicious', 'severity' => 'high', 'description' => 'Loitering'])->assertSuccessful();
        // overstay alert fires from the poll
        \App\Models\Visitor::find($v->json('id'))->update(['expected_exit_at' => now()->subMinute()]);
        \Illuminate\Support\Facades\Cache::forget('watchers-lock');
        $this->actingAs($guard)->getJson('/api/alerts')->assertSuccessful();
        $this->assertNotNull(\App\Models\Visitor::find($v->json('id'))->overstay_alerted_at);
        $this->actingAs($resident)->getJson('/api/visitors')->assertSuccessful();
        $this->actingAs($resident)->getJson('/api/gate/watchlist')->assertForbidden();
    }

    public function test_crm_attendance_leave_tasks(): void
    {
        $hr = $this->as('hr');
        $guard = $this->as('guard');
        $this->actingAs($guard)->getJson('/api/crm/workspace')->assertSuccessful()->assertJsonStructure(['employee', 'tasks']);
        $before = \App\Models\Attendance::count();
        $this->actingAs($this->as('librarian'))->postJson('/api/crm/punch')->assertSuccessful();
        $this->actingAs($this->as('librarian'))->postJson('/api/crm/punch')->assertSuccessful();
        $this->assertLessThanOrEqual($before + 1, \App\Models\Attendance::count());
        $this->actingAs($hr)->postJson('/api/crm/punch-for', ['card' => 'RF010001'])->assertSuccessful();
        $l = $this->actingAs($guard)->postJson('/api/crm/leaves', ['type' => 'casual', 'from' => now()->addDay()->toDateString(), 'to' => now()->addDays(2)->toDateString()])->assertSuccessful();
        $this->actingAs($guard)->postJson('/api/crm/leaves/'.$l->json('id').'/review', ['status' => 'approved'])->assertForbidden();
        $this->actingAs($hr)->postJson('/api/crm/leaves/'.$l->json('id').'/review', ['status' => 'approved'])->assertSuccessful();
        $emp = \App\Models\Employee::where('user_id', $guard->id)->first();
        $t = $this->actingAs($hr)->postJson('/api/crm/tasks', ['title' => 'Patrol', 'employee_id' => $emp->id, 'priority' => 'normal'])->assertSuccessful();
        $this->actingAs($guard)->postJson('/api/crm/tasks/'.$t->json('id'), ['status' => 'done'])->assertSuccessful();
        foreach (['crm/employees', 'crm/attendance', 'crm/report', 'crm/leaves', 'crm/tasks'] as $url) {
            $this->actingAs($hr)->getJson('/api/'.$url)->assertSuccessful();
        }
        $this->actingAs($this->as('resident'))->getJson('/api/crm/employees')->assertForbidden();
    }

    public function test_gym_scan_payments(): void
    {
        $gym = $this->as('gym');
        $this->actingAs($gym)->postJson('/api/gym/scan', ['card' => 'GC70002'])->assertSuccessful()->assertJsonPath('allowed', true);
        $this->actingAs($gym)->postJson('/api/gym/scan', ['card' => 'GC70004'])->assertSuccessful()->assertJsonPath('allowed', false); // expired
        $this->actingAs($gym)->postJson('/api/gym/scan', ['card' => 'GC70007'])->assertSuccessful()->assertJsonPath('allowed', false); // blocked
        $this->actingAs($gym)->postJson('/api/gym/scan', ['card' => 'NOPE'])->assertSuccessful()->assertJsonPath('allowed', false);
        $resident = $this->as('resident');
        $member = \App\Models\GymMember::where('user_id', $resident->id)->first();
        $pay = $this->actingAs($resident)->postJson('/api/gym/members/'.$member->id.'/pay', ['method' => 'qr'])->assertSuccessful()->assertJsonStructure(['reference', 'qr' => ['text']]);
        $end = $member->end_date->copy();
        $this->actingAs($gym)->postJson('/api/gym/payments/'.$pay->json('id').'/confirm', ['status' => 'paid'])->assertSuccessful();
        $this->assertTrue($member->fresh()->end_date->gt($end));
        $this->actingAs($resident)->getJson('/api/gym/members')->assertSuccessful()->assertJsonCount(1, 'data');
        foreach (['gym/stats', 'gym/plans', 'gym/checkins', 'gym/payments'] as $url) {
            $this->actingAs($gym)->getJson('/api/'.$url)->assertSuccessful();
        }
        $this->actingAs($resident)->postJson('/api/gym/scan', ['card' => 'GC70002'])->assertForbidden();
    }

    public function test_sos_announcements_search_settings(): void
    {
        $resident = $this->as('resident');
        $sos = $this->actingAs($resident)->postJson('/api/sos', ['type' => 'medical', 'message' => 'Help'])->assertSuccessful();
        $this->actingAs($this->as('guard'))->getJson('/api/alerts')->assertSuccessful()->assertJsonCount(1, 'sos');
        $this->actingAs($this->as('guard'))->postJson('/api/sos/'.$sos->json('id'), ['status' => 'responding'])->assertSuccessful();
        $this->actingAs($resident)->getJson('/api/sos')->assertSuccessful()->assertJsonStructure(['data', 'contacts']);
        $this->actingAs($this->admin)->getJson('/api/map')->assertSuccessful()->assertJsonPath('stats.sos', 1)->assertJsonPath('site.name', 'Gulistan-e-Jauhar Block 19')->assertJsonCount(393, 'houses')->assertJsonStructure(['signals']);

        $a = $this->actingAs($this->as('manager'))->postJson('/api/announcements', ['title' => 'Water off', 'body' => 'Sat', 'category' => 'utility', 'priority' => 'important', 'audience' => 'residents'])->assertSuccessful();
        $this->actingAs($resident)->getJson('/api/announcements')->assertSuccessful()->assertJsonFragment(['title' => 'Water off']);
        $this->actingAs($this->as('guard'))->getJson('/api/announcements')->assertSuccessful()->assertJsonMissing(['title' => 'Water off']);
        $this->actingAs($resident)->postJson('/api/announcements/'.$a->json('id').'/read')->assertSuccessful();
        $this->actingAs($resident)->postJson('/api/announcements', ['title' => 'x', 'body' => 'y', 'category' => 'general', 'priority' => 'normal', 'audience' => 'all'])->assertForbidden();

        $this->actingAs($this->admin)->getJson('/api/search?q=N-1')->assertSuccessful()->assertJsonFragment(['type' => 'House']);
        $this->actingAs($resident)->getJson('/api/search?q=Ahmed')->assertSuccessful()->assertJsonMissing(['type' => 'House']);
        $s = $this->actingAs($this->admin)->getJson('/api/settings')->assertSuccessful()->json();
        $this->actingAs($this->admin)->putJson('/api/settings', array_merge($s, ['community_name' => 'Green Valley']))->assertSuccessful()->assertJsonPath('community_name', 'Green Valley');
        $this->actingAs(User::where('email', 'admin@demo.local')->first())->putJson('/api/settings', $s)->assertForbidden();
    }

    public function test_map_signals_locate_and_automations(): void
    {
        $resident = $this->as('resident');
        // a new complaint shows up as a signal pinned to the resident's house, auto-assigned by category
        $c = $this->actingAs($resident)->postJson('/api/complaints', ['category' => 'plumbing', 'title' => 'Pipe burst', 'priority' => 'urgent'])->assertSuccessful();
        $this->assertSame('assigned', \App\Models\Complaint::find($c->json('id'))->status);
        $map = $this->actingAs($this->admin)->getJson('/api/map')->assertSuccessful()->json();
        $sig = collect($map['signals'])->firstWhere('key', 'complaint-'.$c->json('id'));
        $this->assertNotNull($sig);
        $this->assertSame($resident->house_id, $sig['house_id']);
        $this->assertNotNull(collect($map['houses'])->firstWhere('id', $resident->house_id)['mx']);
        $this->assertNotEmpty($map['site']['streets']);
        // the manager's alert carries the house id so the UI can "locate" it
        $this->assertSame($resident->house_id, \App\Models\Alert::where('title', 'like', '%Pipe burst%')->latest('id')->first()->house_id);
        // resident only sees signals from their own house
        $own = $this->actingAs($resident)->getJson('/api/map')->json('signals');
        $this->assertTrue(collect($own)->every(fn ($s) => $s['house_id'] === $resident->house_id));
        // SOS is a signal with the house → emergency locate
        $this->actingAs($resident)->postJson('/api/sos', ['type' => 'fire'])->assertSuccessful();
        $this->assertNotNull(collect($this->actingAs($this->as('guard'))->getJson('/api/map')->json('signals'))->firstWhere('type', 'sos'));
        // automations overview + manual run + escalation
        \App\Models\Complaint::where('id', $c->json('id'))->update(['status' => 'open', 'created_at' => now()->subHours(10)]);
        $r = $this->actingAs($this->admin)->postJson('/api/automations/run')->assertSuccessful();
        $this->assertNotNull(\App\Models\Complaint::find($c->json('id'))->escalated_at);
        $this->assertGreaterThan(10, count($r->json('rules')));
        $this->actingAs($resident)->getJson('/api/automations')->assertForbidden();
        // GPS reference points
        $this->actingAs($this->admin)->putJson('/api/settings/geo', ['p1' => ['x' => 100, 'y' => 100, 'lat' => 24.9, 'lng' => 67.12], 'p2' => ['x' => 900, 'y' => 500, 'lat' => 24.89, 'lng' => 67.13]])->assertSuccessful();
        $this->assertEquals(24.9, $this->actingAs($this->admin)->getJson('/api/map')->json('site.geo.p1.lat'));
        // site plan can be re-applied without duplicating houses
        $this->actingAs($this->admin)->postJson('/api/settings/site-plan')->assertSuccessful()->assertJsonPath('created', 0);
    }
}
