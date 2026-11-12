<?php

namespace Tests;

use App\Support\Tenant;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Tenant::set(null);   // the current society is static — never carry it from one test into the next
    }
}
