<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Noc;
use App\Models\NocDocument;
use App\Models\NocStatusLog;
use App\Support\Activity;
use App\Support\Uploads;
use Illuminate\Http\Request;

class NocController extends Controller
{
    /** Guideline & checklist shown on the document upload portal. */
    public const CHECKLISTS = [
        'sale_transfer' => ['label' => 'Sale / Transfer of property', 'docs' => ['CNIC of seller', 'CNIC of buyer', 'Original allotment / ownership letter', 'Sale agreement', 'Latest maintenance clearance', 'Utility bills (paid)']],
        'construction' => ['label' => 'Construction / New building', 'docs' => ['CNIC of owner', 'Approved building plan', 'Ownership document', 'Contractor details', 'Maintenance clearance']],
        'renovation' => ['label' => 'Renovation / Alteration', 'docs' => ['CNIC of owner', 'Scope of work / drawings', 'Contractor details', 'Neighbour consent (if structural)']],
        'utility_connection' => ['label' => 'Utility connection (gas / electricity / water)', 'docs' => ['CNIC of owner', 'Ownership document', 'Utility company application form', 'Maintenance clearance']],
        'rental' => ['label' => 'Rental / Tenant registration', 'docs' => ['CNIC of owner', 'CNIC of tenant', 'Rent agreement', 'Tenant police verification form', 'Tenant photographs']],
        'other' => ['label' => 'Other', 'docs' => ['CNIC of applicant', 'Supporting documents']],
    ];

    /** Checklists with the society's own ID name (CNIC, ID number, Emirates ID…). */
    public static function checklists_(): array
    {
        $id = \App\Support\Settings::idLabel();

        return json_decode(str_replace('CNIC', $id, json_encode(self::CHECKLISTS, JSON_UNESCAPED_UNICODE)), true);
    }

    public const STATUSES = ['submitted', 'under_review', 'documents_required', 'approved', 'completed', 'rejected'];

    public function checklists()
    {
        return self::checklists_();
    }

    public function index(Request $request)
    {
        $this->authorizeView($request, 'noc');
        $q = Noc::with(['house', 'user:id,name,phone'])->withCount('documents')->latest('id');
        if ($request->user()->isResident()) {
            $q->where('user_id', $request->user()->id);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, ['reference', 'details']);
    }

    public function show(Request $request, Noc $noc)
    {
        $this->authorizeView($request, 'noc');
        abort_if($request->user()->isResident() && $noc->user_id !== $request->user()->id, 403);

        return $noc->load(['house', 'user:id,name,phone,email', 'documents', 'logs.user:id,name']) ->setAttribute('checklist', self::checklists_()[$noc->type] ?? null);
    }

    public function store(Request $request)
    {
        $this->authorizeView($request, 'noc');
        $data = $request->validate([
            'type' => 'required|in:'.implode(',', array_keys(self::CHECKLISTS)),
            'details' => 'nullable|string|max:3000',
            'house_id' => 'nullable|exists:houses,id',
            'documents' => 'nullable|array|max:15',
            'documents.*' => 'file|mimes:jpg,jpeg,png,pdf|max:10240',
            'document_names' => 'nullable|array',
        ]);
        $u = $request->user();
        $noc = Noc::create(['type' => $data['type'], 'details' => $data['details'] ?? null, 'house_id' => $u->isResident() ? $u->house_id : ($data['house_id'] ?? null), 'user_id' => $u->id, 'status' => 'submitted']);
        $noc->update(['reference' => 'NOC-'.now()->format('y').'-'.str_pad((string) $noc->id, 4, '0', STR_PAD_LEFT)]);
        $this->saveDocs($request, $noc);
        NocStatusLog::create(['noc_id' => $noc->id, 'status' => 'submitted', 'note' => 'Application submitted', 'user_id' => $u->id]);
        Activity::log('noc', 'create', "NOC application {$noc->reference} — ".self::CHECKLISTS[$noc->type]['label'], $noc);
        Activity::alertModule('noc', 3, 'New NOC application', $noc->reference.' · '.self::CHECKLISTS[$noc->type]['label'], 'info', '/noc', $noc->house_id);

        return $this->show($request, $noc);
    }

    private function saveDocs(Request $request, Noc $noc): int
    {
        $names = $request->input('document_names', []);
        $n = 0;
        foreach ($request->file('documents', []) as $i => $file) {
            NocDocument::create(['noc_id' => $noc->id, 'name' => $names[$i] ?? $file->getClientOriginalName(), 'path' => Uploads::store($file, 'noc')]);
            $n++;
        }

        return $n;
    }

    public function uploadDocs(Request $request, Noc $noc)
    {
        abort_unless($request->user()->canManage('noc') || $noc->user_id === $request->user()->id, 403);
        $request->validate(['documents' => 'required|array|max:15', 'documents.*' => 'file|mimes:jpg,jpeg,png,pdf|max:10240']);
        $n = $this->saveDocs($request, $noc);
        if ($noc->status === 'documents_required' && $noc->user_id === $request->user()->id) {
            $noc->update(['status' => 'under_review']);
            NocStatusLog::create(['noc_id' => $noc->id, 'status' => 'under_review', 'note' => "{$n} document(s) uploaded by applicant", 'user_id' => $request->user()->id]);
            Activity::alertModule('noc', 3, 'Documents uploaded: '.$noc->reference, "{$n} new document(s)", 'info', '/noc', $noc->house_id);
        }
        Activity::log('noc', 'upload', "{$n} document(s) added to {$noc->reference}", $noc);

        return $this->show($request, $noc);
    }

    /** Every status change is logged and notified to the applicant. */
    public function setStatus(Request $request, Noc $noc)
    {
        $this->authorizeManage($request, 'noc');
        $data = $request->validate(['status' => 'required|in:'.implode(',', self::STATUSES), 'note' => 'nullable|string|max:2000', 'certificate' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240']);
        $patch = ['status' => $data['status'], 'remarks' => $data['note'] ?? $noc->remarks];
        if ($request->hasFile('certificate')) {
            $patch['certificate_path'] = Uploads::store($request->file('certificate'), 'noc');
        }
        if ($data['status'] === 'completed') {
            $patch['completed_at'] = now();
        }
        $noc->update($patch);
        NocStatusLog::create(['noc_id' => $noc->id, 'status' => $data['status'], 'note' => $data['note'] ?? null, 'user_id' => $request->user()->id]);
        $label = ucwords(str_replace('_', ' ', $data['status']));
        Activity::log('noc', 'status', "{$noc->reference} → {$label}", $noc);
        Activity::alertUser($noc->user_id, 'noc', "NOC {$noc->reference}: {$label}", $data['note'] ?? null, match ($data['status']) { 'completed', 'approved' => 'success', 'rejected' => 'danger', 'documents_required' => 'warning', default => 'info' }, '/noc');

        return $this->show($request, $noc);
    }
}
