<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Files are kept on the private "local" disk (storage/app/private) and only served through
 * the authenticated /files route, so record-room files stay private to their owners.
 */
class Uploads
{
    public static function store(?UploadedFile $file, string $folder): ?string
    {
        if (! $file) {
            return null;
        }
        $name = now()->format('Ymd_His').'_'.Str::random(8).'.'.strtolower($file->getClientOriginalExtension() ?: 'bin');

        // folder first (the file guard matches on it), then the society so tenants never share a directory
        return $file->storeAs($folder.'/s'.(\App\Support\Tenant::id() ?? 0), $name, 'local');
    }
}
