<?php

namespace App\Support;

use Illuminate\Validation\DatabasePresenceVerifier;

/** Makes `exists:` and `unique:` validation rules look only inside the current society. */
class TenantPresenceVerifier extends DatabasePresenceVerifier
{
    protected function table($table)
    {
        $q = parent::table($table);
        $name = str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table;
        if (($id = Tenant::id()) && in_array($name, Tenant::TABLES, true)) {
            $q->where($name.'.society_id', $id);
        }

        return $q;
    }
}
