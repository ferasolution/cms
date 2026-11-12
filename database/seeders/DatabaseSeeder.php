<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! \App\Support\Tenant::id()) {
            \App\Support\Tenant::set(\App\Models\Society::orderBy('id')->first());
        }
        $this->call(DemoSeeder::class);
        \App\Models\Visitor::whereNull('token')->each(fn ($v) => $v->forceFill(['token' => \App\Services\GateLog::token('GV', \App\Models\Visitor::class, 'token'), 'access_type' => $v->category === 'emergency' ? 'emergency' : 'temporary'])->saveQuietly());
        \App\Services\SecurityDemo::seed();
    }
}
