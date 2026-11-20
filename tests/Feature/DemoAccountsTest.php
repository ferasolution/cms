<?php

namespace Tests\Feature;

use App\Models\Society;
use App\Models\User;
use App\Services\SitePlan;
use App\Support\DemoAccounts;
use App\Support\Tenant;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_demo_account_signs_in_and_cannot_be_changed(): void
    {
        $s = Society::create(['slug' => 'demo', 'name' => 'Maple Grove Estates', 'country' => 'US', 'status' => 'active', 'plan' => 'enterprise', 'site_plan' => SitePlan::usDemo()]);
        Tenant::run($s, function () {
            (new DemoSeeder)->setContainer(app())->run();
            DemoAccounts::ensure();
        });
        Tenant::set(null);

        $this->get('/demo/')->assertSee('superadmin@demo.local');
        $this->get('/block19/')->assertDontSee('superadmin@demo.local');

        foreach (array_keys(DemoAccounts::LIST) as $email) {
            $this->postJson('/demo/api/login', ['email' => $email, 'password' => 'password'])->assertSuccessful();
            $this->postJson('/demo/api/logout');
        }

        $this->postJson('/demo/api/login', ['email' => 'superadmin@demo.local', 'password' => 'password'])->assertSuccessful();
        $guard = User::withoutGlobalScopes()->where('society_id', $s->id)->where('email', 'guard@demo.local')->first();
        $this->putJson("/demo/api/users/{$guard->id}", ['name' => 'Hacked', 'email' => 'guard@demo.local', 'role' => 'user'])->assertUnprocessable();
        $this->deleteJson("/demo/api/users/{$guard->id}")->assertUnprocessable();
        $this->putJson('/demo/api/profile', ['current_password' => 'password', 'password' => 'newpass123', 'password_confirmation' => 'newpass123'])->assertUnprocessable();
        $this->putJson('/demo/api/profile', ['theme' => 'dark'])->assertSuccessful();
    }
}
