<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryIssue;
use App\Models\InventoryItem;
use App\Support\Activity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    private array $rules = [
        'name' => 'required|string|max:150',
        'sku' => 'nullable|string|max:50',
        'category' => 'nullable|string|max:60',
        'quantity' => 'required|integer|min:0',
        'min_quantity' => 'nullable|integer|min:0',
        'unit' => 'nullable|string|max:20',
        'location' => 'nullable|string|max:100',
        'unit_cost' => 'nullable|numeric|min:0',
    ];

    public function index(Request $request)
    {
        $this->authorizeManage($request, 'inventory');
        $q = InventoryItem::withCount(['issues as out_count' => fn ($w) => $w->whereNull('returned_at')])->orderBy('name');
        if ($request->boolean('low')) {
            $q->whereColumn('quantity', '<=', 'min_quantity');
        }
        if ($request->boolean('all')) {
            return $q->get();
        }

        return $this->paginate($q, $request, ['name', 'sku', 'category', 'location']);
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request, 'inventory');
        $item = InventoryItem::create($request->validate($this->rules));
        Activity::log('inventory', 'create', "Added {$item->quantity} {$item->unit} of {$item->name} to stock", $item);

        return $item;
    }

    public function update(Request $request, InventoryItem $item)
    {
        $this->authorizeManage($request, 'inventory');
        $old = $item->quantity;
        $item->update($request->validate($this->rules));
        $diff = $item->quantity - $old;
        Activity::log('inventory', 'update', "Updated {$item->name}".($diff ? ' (stock '.($diff > 0 ? '+' : '').$diff.')' : ''), $item);

        return $item;
    }

    public function destroy(Request $request, InventoryItem $item)
    {
        $this->authorizeManage($request, 'inventory');
        Activity::log('inventory', 'delete', "Removed item {$item->name}");
        $item->delete();

        return response()->noContent();
    }

    public function issues(Request $request)
    {
        $this->authorizeManage($request, 'inventory');
        $q = InventoryIssue::with(['item:id,name,unit', 'issuer:id,name'])->latest('issued_at');
        match ($request->query('status')) {
            'out' => $q->whereNull('returned_at'),
            'returned' => $q->whereNotNull('returned_at'),
            'overdue' => $q->whereNull('returned_at')->whereDate('expected_return', '<', now()),
            default => null,
        };

        return $this->paginate($q, $request, ['issued_to', 'purpose']);
    }

    /** Item issuance form: who issued, who took it, for what purpose. */
    public function issue(Request $request)
    {
        $this->authorizeManage($request, 'inventory');
        $data = $request->validate([
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'quantity' => 'required|integer|min:1',
            'issued_to' => 'required|string|max:120',
            'issued_to_contact' => 'nullable|string|max:60',
            'purpose' => 'required|string|max:255',
            'expected_return' => 'nullable|date|after_or_equal:today',
            'remarks' => 'nullable|string|max:1000',
        ]);

        return DB::transaction(function () use ($data, $request) {
            $item = InventoryItem::lockForUpdate()->findOrFail($data['inventory_item_id']);
            abort_if($item->quantity < $data['quantity'], 422, "Only {$item->quantity} {$item->unit} of {$item->name} in stock.");
            $item->decrement('quantity', $data['quantity']);
            $issue = InventoryIssue::create($data + ['issued_by' => $request->user()->id, 'issued_at' => now()]);
            Activity::log('inventory', 'issue', "Issued {$data['quantity']} × {$item->name} to {$data['issued_to']} — {$data['purpose']}", $issue);
            if ($item->fresh()->quantity <= $item->min_quantity) {
                Activity::alertRole(['inventory', 'admin'], 'inventory', 'Low stock: '.$item->name, 'Only '.$item->fresh()->quantity.' '.$item->unit.' left.', 'warning', '/inventory');
            }

            return $issue->load('item', 'issuer');
        });
    }

    public function returnIssue(Request $request, InventoryIssue $issue)
    {
        $this->authorizeManage($request, 'inventory');
        abort_if($issue->returned_at, 422, 'Already returned.');
        $data = $request->validate(['returned_quantity' => 'nullable|integer|min:0', 'remarks' => 'nullable|string|max:500']);
        $qty = min((int) ($data['returned_quantity'] ?? $issue->quantity), $issue->quantity);
        $issue->update(['returned_at' => now(), 'returned_quantity' => $qty, 'remarks' => trim(($issue->remarks ?? '').' '.$request->input('remarks', ''))]);
        $issue->item->increment('quantity', $qty);
        Activity::log('inventory', 'return', "{$issue->issued_to} returned {$qty} × {$issue->item->name}".($qty < $issue->quantity ? ' ('.($issue->quantity - $qty).' missing)' : ''), $issue);

        return $issue->load('item', 'issuer');
    }
}
