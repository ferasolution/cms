<?php

namespace App\Models;

use App\Support\Plans;
use Illuminate\Database\Eloquent\Model;

/** A community (tenant) using the platform, reached at cms.ferasolution.com/{slug}. */
class Society extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['site_plan'];

    protected function casts(): array
    {
        return ['site_plan' => 'array', 'modules' => 'array', 'trial_ends_at' => 'datetime', 'paid_until' => 'date'];
    }

    public function plan(): array
    {
        return Plans::get($this->plan);
    }

    /** Modules this society may use (plan + any extra modules switched on by the platform owner). */
    public function allowedModules(): array
    {
        $p = $this->plan()['modules'];
        if ($p === '*') {
            return array_keys(\App\Support\Access::MODULES);
        }

        return array_values(array_unique(array_merge($p, (array) $this->modules)));
    }

    public function maxHouses(): ?int
    {
        return $this->max_houses ?: $this->plan()['max_houses'];
    }

    /** Can people use the portal right now? */
    public function isOpen(): bool
    {
        if ($this->status === 'suspended') {
            return false;
        }
        if ($this->status === 'trial') {
            return ! $this->trial_ends_at || $this->trial_ends_at->isFuture();
        }

        return true;
    }

    public function publicInfo(): array
    {
        return ['id' => $this->id, 'slug' => $this->slug, 'name' => $this->name, 'city' => $this->city, 'logo' => $this->logo_path, 'status' => $this->status, 'plan' => $this->plan,
            'trial_ends_at' => $this->trial_ends_at, 'has_map' => ! empty($this->site_plan)];
    }
}
