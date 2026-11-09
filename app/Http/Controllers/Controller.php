<?php

namespace App\Http\Controllers;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

abstract class Controller
{
    protected function authorizeManage(Request $request, string $module): void
    {
        abort_unless($request->user()->canManage($module), 403, 'You do not have permission for this action.');
    }

    protected function authorizeView(Request $request, string $module): void
    {
        abort_unless($request->user()->canView($module), 403, 'You do not have access to this module.');
    }

    /** Free-text search over the given columns plus pagination. */
    protected function paginate(Builder $query, Request $request, array $searchable = [], int $perPage = 20)
    {
        if (($q = trim((string) $request->query('q'))) !== '' && $searchable) {
            $query->where(function (Builder $w) use ($q, $searchable) {
                foreach ($searchable as $col) {
                    $w->orWhere($col, 'like', "%{$q}%");
                }
            });
        }
        if ($from = $request->query('from')) {
            $query->whereDate($query->getModel()->getTable().'.created_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->whereDate($query->getModel()->getTable().'.created_at', '<=', $to);
        }

        return $query->paginate(min((int) $request->query('per_page', $perPage), 100));
    }
}
