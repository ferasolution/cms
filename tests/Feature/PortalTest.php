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
        $this->admin = User::create(['name' => 'ADH', 'email' => 'adh@test.local', 'password' => 'password', 'role' => 'admin']);
        Storage::fake('local');
    }

    private function as(string $role): User
    {
        return $role === 'admin' ? $this->admin : User::where('role', $role)->firstOrFail();
    }

    public function test_spa_and_login(): void
    {
        $this->get('/')->assertSuccessful()->assertSee('id="root"', false);
        $this->get('/complaints')->assertSuccessful();
        $this->getJson('/api/me')->assertUnauthorized();
        $this->postJson('/api/login', ['email' => 'adh@test.local', 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/login', ['email' => 'adh@test.local', 'password' => 'password'])
            ->assertSuccessful()->assertJsonPath('user.role', 'admin')->assertJsonCount(9, 'modules');
    }

    public function test_every_role_can_load_dashboard_alerts_and_map(): void
    {
        foreach (['admin', 'manager', 'security', 'inventory', 'librarian', 'finance', 'resident'] as $role) {
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
        $this->actingAs($resident)->getJson('/api/visitors')->assertForbidden();
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
            'name' => 'Test Guest', 'category' => 'guest', 'purpose' => 'Dinner', 'house_id' => $house->id,
            'photo' => UploadedFile::fake()->image('p.jpg'),
        ], ['Accept' => 'application/json'])->assertSuccessful();
        $id = $r->json('id');
        $this->actingAs($sec)->postJson("/api/visitors/{$id}/checkout")->assertSuccessful()->assertJsonPath('id', $id);
        $this->actingAs($sec)->postJson("/api/visitors/{$id}/checkout")->assertUnprocessable();
        $resident = User::where('house_id', $house->id)->first();
        $this->actingAs($resident)->getJson('/api/alerts')->assertSuccessful()->assertJsonFragment(['title' => 'Visitor at gate: Test Guest']);
        $this->actingAs($sec)->get('/files/'.$r->json('photo_path'))->assertSuccessful();
        $this->actingAs($resident)->get('/files/'.$r->json('photo_path'))->assertForbidden();
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
    }

    public function test_event_request_approve_and_time_alerts(): void
    {
        $resident = $this->as('resident');
        $this->actingAs($resident)->postJson('/api/events/quote', ['venue' => 'Community Hall', 'type' => 'wedding', 'start_time' => '19:00', 'end_time' => '23:30', 'guests' => 100])
            ->assertSuccessful()->assertJsonPath('total', 3000 * 5 + 100 * 30 + 400 * 5 + 10000 + 2000);
        $ev = $this->actingAs($resident)->postJson('/api/events', ['title' => 'Mehndi', 'type' => 'wedding', 'venue' => 'Community Hall', 'date' => now()->toDateString(), 'start_time' => now()->subHours(3)->format('H:i'), 'end_time' => now()->subMinutes(5)->format('H:i'), 'guests' => 50])->assertSuccessful();
        $this->actingAs($this->as('manager'))->postJson('/api/events/'.$ev->json('id').'/status', ['status' => 'approved', 'record_payment' => true])->assertSuccessful()->assertJsonPath('status', 'approved');
        $code = Event::find($ev->json('id'))->code;
        $this->actingAs($this->as('security'))->getJson('/api/events/verify/'.$code)->assertSuccessful();
        // the poll triggers the watcher: event already over → danger alert to security
        if (now()->hour >= 4) { // skip around midnight, when "3 hours ago" falls on the previous day
            $this->actingAs($this->as('security'))->getJson('/api/alerts')->assertSuccessful()->assertJsonFragment(['level' => 'danger']);
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
        $stranger = User::where('role', 'resident')->where('house_id', '!=', $resident->house_id)->first();
        $this->actingAs($stranger)->getJson('/api/records')->assertSuccessful()->assertJsonCount(0, 'data');
        $this->actingAs($stranger)->get('/files/'.$file->json('0.path'))->assertForbidden();
    }

    public function test_admin_manages_users_and_deploy_hook_is_protected(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', ['name' => 'New Guard', 'email' => 'g@x.local', 'role' => 'security', 'password' => 'secret123'])->assertSuccessful();
        $this->actingAs($this->admin)->postJson('/api/houses', ['house_no' => '999', 'block' => 'Z', 'type' => 'house'])->assertSuccessful();
        $this->postJson('/system/deploy')->assertForbidden();
    }
}
