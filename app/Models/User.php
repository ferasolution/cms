<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSociety;
use App\Support\Access;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use BelongsToSociety;

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password', 'role', 'permissions', 'designation', 'phone', 'house_id', 'household_role', 'active', 'last_login_at', 'last_login_ip', 'theme'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'active' => 'boolean',
            'permissions' => 'array',
            'last_login_at' => 'datetime',
        ];
    }

    public function house()
    {
        return $this->belongsTo(House::class);
    }

    public function employee()
    {
        return $this->hasOne(Employee::class);
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === 'super_admin';
    }

    /** Super Admin or Admin — community-wide authority. */
    public function isAdmin(): bool
    {
        return in_array($this->role, ['super_admin', 'admin'], true);
    }

    /** Role "user": a resident / household member. */
    public function isResident(): bool
    {
        return $this->role === 'user';
    }

    public function level(string $module): int
    {
        return Access::level($this, $module);
    }

    public function canApprove(string $module): bool
    {
        return Access::canApprove($this, $module);
    }

    public function canManage(string $module): bool
    {
        return Access::canManage($this, $module);
    }

    public function canView(string $module): bool
    {
        return Access::canView($this, $module);
    }
}
