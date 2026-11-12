<?php

namespace Tests\Feature;

use App\Models\House;
use App\Models\Society;
use App\Models\User;
use App\Support\Tenant;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SaasTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        config(['app.deploy_token' => 'secret-setup-key']);
    }

    private function signUp(array $o = []): array
    {
        return $this->postJson('/_p/api/register', $o + ['name' => 'Bahria Town Precinct 10', 'slug' => 'bahria', 'city' => 'Karachi', 'admin_name' => 'Bahria Admin',
            'email' => 'admin@bahria.pk', 'phone' => '0300-1234567', 'password' => 'bahria-pass-1', 'houses' => 220])->assertSuccessful()->json();
    }

    public function test_sign_up_creates_an_isolated_society(): void
    {
        $r = $this->signUp();
        $this->assertSame('/bahria/', $r['redirect']);
        $this->get('/')->assertRedirect('/bahria/');   // installed app opening the root lands in the user's society
        $soc = Society::where('slug', 'bahria')->first();
        $this->assertSame('trial', $soc->status);

        // the new admin is signed in to their own society only
        $this->getJson('/bahria/api/me')->assertSuccessful()->assertJsonPath('user.role', 'super_admin')->assertJsonPath('community', 'Bahria Town Precinct 10');
        $this->getJson('/bahria/api/houses')->assertSuccessful()->assertJsonPath('total', 0);
        $this->getJson('/bahria/api/users')->assertSuccessful()->assertJsonPath('total', 1);
        $this->getJson('/block19/api/me')->assertUnauthorized();                       // other society → guest
        $this->getJson('/bahria/api/houses/'.House::withoutGlobalScopes()->where('society_id', 1)->value('id'))->assertNotFound();   // a Block 19 house

        // creates data inside its own society; validation can't point at Block 19 rows
        $h = $this->postJson('/bahria/api/houses', ['block' => 'A', 'house_no' => '1', 'type' => 'house', 'status' => 'occupied'])->assertSuccessful()->json();
        $this->assertSame($soc->id, House::withoutGlobalScopes()->find($h['id'])->society_id);
        $b19House = House::withoutGlobalScopes()->where('society_id', 1)->first();
        $this->postJson('/bahria/api/complaints', ['category' => 'plumbing', 'title' => 'Leak', 'description' => 'Kitchen leak', 'house_id' => $b19House->id])->assertUnprocessable();

        // same email may exist in two societies
        Tenant::set($soc);
        $this->postJson('/bahria/api/users', ['name' => 'Ahmed', 'email' => 'resident@demo.local', 'password' => 'password1', 'role' => 'user', 'house_id' => $h['id']])->assertSuccessful();
        $this->assertSame(2, User::withoutGlobalScopes()->where('email', 'resident@demo.local')->count());

        // Block 19 still sees only its own data
        $this->postJson('/bahria/api/logout');
        $admin = User::withoutGlobalScopes()->where('society_id', 1)->where('role', 'admin')->first();
        $this->actingAs($admin)->getJson('/block19/api/houses?per_page=500')->assertSuccessful()->assertJsonPath('total', 393);
        $this->actingAs($admin)->getJson('/block19/api/search?q=Bahria')->assertSuccessful();
        $this->actingAs($admin)->getJson('/bahria/api/me')->assertUnauthorized();
    }

    public function test_slug_rules_and_lookup(): void
    {
        $this->getJson('/_p/api/slug-check?slug=block19')->assertJsonPath('ok', false);
        $this->getJson('/_p/api/slug-check?slug=security')->assertJsonPath('ok', false);   // a portal page name
        $this->getJson('/_p/api/slug-check?slug=dha-phase-6')->assertJsonPath('ok', true);
        $this->postJson('/_p/api/register', ['name' => 'X', 'slug' => 'api', 'city' => 'K', 'admin_name' => 'A', 'email' => 'a@b.pk', 'phone' => '1', 'password' => 'password1'])->assertUnprocessable();
        $this->getJson('/_p/api/lookup?q=block')->assertSuccessful()->assertJsonPath('0.slug', 'block19');
    }

    public function test_plan_limits_modules_and_trial_end(): void
    {
        $this->signUp(['plan' => 'basic']);
        $mods = collect($this->getJson('/bahria/api/me')->json('modules'))->pluck('key');
        $this->assertFalse($mods->contains('gym'));
        $this->assertFalse($mods->contains('library'));
        $this->getJson('/bahria/api/gym/members')->assertForbidden();

        Society::where('slug', 'bahria')->update(['trial_ends_at' => now()->subDay()]);
        $this->getJson('/bahria/api/houses')->assertStatus(402)->assertJsonPath('code', 'society_closed');
        $this->getJson('/bahria/api/me')->assertSuccessful();
    }

    public function test_platform_owner_setup_console_and_support_login(): void
    {
        $this->getJson('/_p/api/status')->assertJsonPath('needs_setup', true);
        $this->postJson('/_p/api/setup', ['token' => 'wrong', 'name' => 'Owner', 'email' => 'owner@fera.pk', 'password' => 'owner-pass-123'])->assertForbidden();
        $this->postJson('/_p/api/setup', ['token' => 'secret-setup-key', 'name' => 'Owner', 'email' => 'owner@fera.pk', 'password' => 'owner-pass-123'])->assertSuccessful()->assertJsonPath('user.email', 'owner@fera.pk');
        $this->postJson('/_p/api/setup', ['token' => 'secret-setup-key', 'name' => 'X', 'email' => 'x@fera.pk', 'password' => 'owner-pass-123'])->assertForbidden();

        $o = $this->getJson('/_p/api/overview')->assertSuccessful()->json();
        $this->assertSame(1, $o['stats']['societies']);
        $this->assertSame(393, $o['societies'][0]['houses']);
        // the owner is not a member of any society
        $this->getJson('/block19/api/me')->assertUnauthorized();

        $s = $this->postJson('/_p/api/societies', ['name' => 'DHA Phase 6', 'slug' => 'dha6', 'plan' => 'pro', 'status' => 'active', 'admin_name' => 'DHA Admin', 'email' => 'admin@dha6.pk', 'password' => 'password1'])->assertSuccessful()->json();
        $this->putJson('/_p/api/societies/'.$s['id'], ['name' => 'DHA Phase 6', 'slug' => 'dha6', 'status' => 'suspended', 'plan' => 'pro', 'modules' => ['gym']])->assertSuccessful()->assertJsonPath('status', 'suspended');
        $this->putJson('/_p/api/societies/'.$s['id'], ['name' => 'DHA Phase 6', 'slug' => 'dha6', 'status' => 'active', 'plan' => 'pro', 'modules' => ['gym']])->assertSuccessful()->assertJsonPath('open', true);

        $this->postJson('/_p/api/societies/'.$s['id'].'/impersonate')->assertSuccessful()->assertJsonPath('redirect', '/dha6/');
        $this->getJson('/dha6/api/me')->assertSuccessful()->assertJsonPath('user.email', 'admin@dha6.pk');
        $this->assertTrue(collect($this->getJson('/dha6/api/me')->json('modules'))->pluck('key')->contains('gym'));   // extra module on top of Pro
        $this->getJson('/_p/api/overview')->assertUnauthorized();   // now signed in as the society admin

        // people outside can't use the console
        $this->postJson('/_p/api/logout');
        $this->getJson('/_p/api/overview')->assertUnauthorized();
        $this->postJson('/_p/api/login', ['email' => 'owner@fera.pk', 'password' => 'owner-pass-123'])->assertSuccessful();
        $this->getJson('/_p/api/overview')->assertSuccessful();
    }
}
