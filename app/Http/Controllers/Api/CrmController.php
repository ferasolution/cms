<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\Task;
use App\Support\Activity;
use App\Support\Settings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Staff CRM: employee profiles, online attendance with automatic working hours,
 * leave requests and department tasks. Staff with a linked employee profile use the
 * self-service endpoints (check in / out, own tasks, own leave) without CRM access.
 */
class CrmController extends Controller
{
    private function me(Request $request): Employee
    {
        $e = Employee::where('user_id', $request->user()->id)->first();
        abort_unless($e, 404, 'No employee profile is linked to your account. Ask HR to link one.');

        return $e;
    }

    public function employees(Request $request)
    {
        $this->authorizeView($request, 'crm');
        $q = Employee::with(['user:id,name,email', 'today'])->orderBy('department')->orderBy('name');
        if ($d = $request->query('department')) {
            $q->where('department', $d);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }
        if ($request->boolean('all')) {
            return $q->get();
        }

        return $this->paginate($q, $request, ['name', 'code', 'designation', 'phone'], 50);
    }

    private function rules(?Employee $e = null): array
    {
        return [
            'name' => 'required|string|max:120', 'department' => 'required|string|max:60', 'designation' => 'nullable|string|max:80',
            'phone' => 'nullable|string|max:30', 'cnic' => 'nullable|string|max:20', 'emergency_contact' => 'nullable|string|max:120',
            'joined_on' => 'nullable|date', 'left_on' => 'nullable|date', 'shift_start' => 'required|date_format:H:i', 'shift_end' => 'required|date_format:H:i',
            'basic_salary' => 'nullable|numeric|min:0', 'rfid_card' => 'nullable|string|max:40', 'status' => 'required|in:active,on_leave,terminated',
            'user_id' => 'nullable|exists:users,id',
        ];
    }

    public function storeEmployee(Request $request)
    {
        $this->authorizeManage($request, 'crm');
        $data = $request->validate($this->rules());
        $next = (int) Employee::max('id') + 1;
        $e = Employee::create($data + ['code' => 'EMP-'.str_pad((string) $next, 4, '0', STR_PAD_LEFT)]);
        Activity::log('crm', 'create', "Added employee {$e->name} ({$e->code}, {$e->department})", $e);

        return $e;
    }

    public function updateEmployee(Request $request, Employee $employee)
    {
        $this->authorizeManage($request, 'crm');
        $employee->update($request->validate($this->rules($employee)));
        Activity::log('crm', 'update', "Updated employee {$employee->name}", $employee);

        return $employee;
    }

    public function destroyEmployee(Request $request, Employee $employee)
    {
        abort_unless($request->user()->canApprove('crm'), 403);
        Activity::log('crm', 'delete', "Removed employee {$employee->name}");
        $employee->delete();

        return response()->noContent();
    }

    // ---------- Attendance ----------

    /** Recalculate worked / late / overtime minutes from the check-in and check-out times. */
    public static function compute(Attendance $a, Employee $e): void
    {
        if (! $a->check_in) {
            return;
        }
        $date = $a->date->toDateString();
        $shiftStart = Carbon::parse($date.' '.$e->shift_start);
        $shiftEnd = Carbon::parse($date.' '.$e->shift_end);
        if ($shiftEnd->lessThanOrEqualTo($shiftStart)) {
            $shiftEnd->addDay();
        }
        $grace = (int) Settings::get('late_grace_minutes');
        $late = max(0, (int) $shiftStart->diffInMinutes($a->check_in, false) - $grace);
        $worked = $a->check_out ? max(0, (int) $a->check_in->diffInMinutes($a->check_out)) : 0;
        $planned = (int) $shiftStart->diffInMinutes($shiftEnd);
        $a->minutes_worked = $worked;
        $a->late_minutes = $late > 0 ? $late + $grace : 0;
        $a->overtime_minutes = $a->check_out ? max(0, $worked - $planned) : 0;
    }

    private function punch(Employee $e, string $method, ?string $note = null): Attendance
    {
        $a = Attendance::where('employee_id', $e->id)->whereDate('date', now()->toDateString())->first()
            ?? new Attendance(['employee_id' => $e->id, 'date' => now()->toDateString()]);
        if (! $a->check_in) {
            $a->fill(['check_in' => now(), 'method' => $method, 'note' => $note]);
            self::compute($a, $e);
            $a->save();
            Activity::log('crm', 'check_in', "{$e->name} checked in".($a->late_minutes ? " ({$a->late_minutes} min late)" : ''), $a);
        } else {
            $a->fill(['check_out' => now()]);
            self::compute($a, $e);
            $a->save();
            Activity::log('crm', 'check_out', "{$e->name} checked out — worked ".intdiv($a->minutes_worked, 60).'h '.($a->minutes_worked % 60).'m', $a);
        }

        return $a;
    }

    /** Self-service: staff toggles their own check-in / check-out. */
    public function myPunch(Request $request)
    {
        return $this->punch($this->me($request), 'web', $request->input('note'));
    }

    /** RFID / manual punch by HR (an RFID reader types the card number into the box). */
    public function punchFor(Request $request)
    {
        $this->authorizeManage($request, 'crm');
        $data = $request->validate(['employee_id' => 'nullable|exists:employees,id', 'card' => 'nullable|string']);
        $e = ! empty($data['card']) ? Employee::where('rfid_card', trim($data['card']))->first() : Employee::find($data['employee_id'] ?? 0);
        abort_unless($e, 404, 'No employee with this card.');

        return $this->punch($e, ! empty($data['card']) ? 'rfid' : 'manual')->load('employee');
    }

    public function attendance(Request $request)
    {
        $this->authorizeView($request, 'crm');
        $date = $request->query('date', now()->toDateString());
        $rows = Attendance::whereDate('date', $date)->get()->keyBy('employee_id');

        return Employee::where('status', '!=', 'terminated')->orderBy('department')->orderBy('name')->get()->map(fn ($e) => [
            'employee' => $e, 'attendance' => $rows[$e->id] ?? null,
        ]);
    }

    /** Monthly report: days present, hours, late, overtime per employee. */
    public function report(Request $request)
    {
        $this->authorizeView($request, 'crm');
        $month = $request->query('month', now()->format('Y-m'));
        $rows = Attendance::where('date', 'like', $month.'%')->get()->groupBy('employee_id');

        return Employee::orderBy('name')->get()->map(function ($e) use ($rows) {
            $r = $rows[$e->id] ?? collect();

            return ['employee' => $e->only(['id', 'code', 'name', 'department']), 'days' => $r->whereNotNull('check_in')->count(),
                'hours' => round($r->sum('minutes_worked') / 60, 1), 'late_days' => $r->where('late_minutes', '>', 0)->count(),
                'late_minutes' => $r->sum('late_minutes'), 'overtime_hours' => round($r->sum('overtime_minutes') / 60, 1)];
        });
    }

    // ---------- Leave ----------

    public function leaves(Request $request)
    {
        $u = $request->user();
        $q = LeaveRequest::with(['employee:id,name,code,department', 'reviewer:id,name'])->latest('id');
        if (! $u->canView('crm')) {
            $q->where('employee_id', $this->me($request)->id);
        }
        if ($s = $request->query('status')) {
            $q->where('status', $s);
        }

        return $this->paginate($q, $request, [], 30);
    }

    public function storeLeave(Request $request)
    {
        $e = $this->me($request);
        $data = $request->validate(['type' => 'required|in:casual,sick,annual,unpaid', 'from' => 'required|date', 'to' => 'required|date|after_or_equal:from', 'reason' => 'nullable|string|max:1000']);
        $l = LeaveRequest::create($data + ['employee_id' => $e->id]);
        Activity::log('crm', 'leave', "{$e->name} requested {$l->type} leave ".$l->from->format('d M').'–'.$l->to->format('d M'), $l);
        Activity::alertModule('crm', 3, 'Leave request: '.$e->name, ucfirst($l->type).' · '.$l->from->format('d M').'–'.$l->to->format('d M'), 'info', '/crm?tab=leave');

        return $l;
    }

    public function reviewLeave(Request $request, LeaveRequest $leave)
    {
        abort_unless($request->user()->canApprove('crm'), 403);
        $data = $request->validate(['status' => 'required|in:approved,rejected']);
        $leave->update($data + ['reviewed_by' => $request->user()->id]);
        Activity::log('crm', $data['status'], ucfirst($data['status'])." leave of {$leave->employee->name}", $leave);
        Activity::alertUser($leave->employee->user_id, 'crm', 'Leave '.$data['status'], $leave->from->format('d M').'–'.$leave->to->format('d M'), $data['status'] === 'approved' ? 'success' : 'danger', '/workspace');

        return $leave->load('employee', 'reviewer');
    }

    // ---------- Tasks ----------

    public function tasks(Request $request)
    {
        $u = $request->user();
        $q = Task::with(['employee:id,name,department', 'creator:id,name'])->orderByRaw("case status when 'todo' then 0 when 'in_progress' then 1 else 2 end")->orderBy('due_at');
        if (! $u->canView('crm')) {
            $q->where('employee_id', $this->me($request)->id);
        }
        foreach (['status', 'department', 'employee_id'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }

        return $this->paginate($q, $request, ['title'], 100);
    }

    public function storeTask(Request $request)
    {
        $this->authorizeManage($request, 'crm');
        $data = $request->validate(['title' => 'required|string|max:200', 'description' => 'nullable|string|max:3000', 'department' => 'nullable|string|max:60',
            'employee_id' => 'nullable|exists:employees,id', 'priority' => 'required|in:low,normal,high,urgent', 'due_at' => 'nullable|date']);
        $t = Task::create($data + ['created_by' => $request->user()->id]);
        $t->load('employee');
        Activity::log('crm', 'task', "Task \"{$t->title}\"".($t->employee ? " assigned to {$t->employee->name}" : ''), $t);
        Activity::alertUser($t->employee?->user_id, 'crm', 'New task: '.$t->title, $t->due_at ? 'Due '.$t->due_at->format('d M h:i A') : null, 'info', '/workspace');

        return $t;
    }

    public function updateTask(Request $request, Task $task)
    {
        $u = $request->user();
        $mine = $task->employee && $task->employee->user_id === $u->id;
        abort_unless($u->canManage('crm') || $mine, 403);
        $data = $request->validate(['status' => 'required|in:todo,in_progress,done']);
        $task->update($data + ['completed_at' => $data['status'] === 'done' ? now() : null]);
        Activity::log('crm', 'task', "Task \"{$task->title}\" → ".str_replace('_', ' ', $data['status']), $task);

        return $task->load('employee');
    }

    /** Self-service summary for the logged-in staff member. */
    public function workspace(Request $request)
    {
        $e = Employee::where('user_id', $request->user()->id)->first();
        if (! $e) {
            return ['employee' => null];
        }

        return [
            'employee' => $e,
            'today' => Attendance::where('employee_id', $e->id)->whereDate('date', now()->toDateString())->first(),
            'month' => Attendance::where('employee_id', $e->id)->where('date', 'like', now()->format('Y-m').'%')->orderByDesc('date')->get(),
            'tasks' => Task::where('employee_id', $e->id)->where('status', '!=', 'done')->orderBy('due_at')->get(),
            'leaves' => LeaveRequest::where('employee_id', $e->id)->latest('id')->limit(10)->get(),
        ];
    }
}
