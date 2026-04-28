# Trial-Run Bulk Import Pack

The correct term for this workflow is bulk import. If you are loading realistic data just to exercise the payroll flow, seed data import is also accurate.

This pack lets you enter employee and payroll setup data once in CSV files, then load it into the backend through the existing API endpoints.

## Files in this pack

- `employees.csv`: required for worker master data.
- `payroll_policies.csv`: optional, but useful when the trial run needs a specific payroll ruleset.
- `compensation_profiles.csv`: optional, but usually needed if monthly salary or allowances differ from the employee base salary.
- `payroll_adjustments.csv`: optional one-off additions or deductions for a test month.

Blank rows are ignored. Rows whose first filled cell starts with `#` are also ignored, so you can temporarily comment out data rows.

## Recommended workflow

1. Fill `employees.csv` first.
2. Add `payroll_policies.csv` if this trial run needs a dedicated policy version.
3. Add `compensation_profiles.csv` to assign monthly salary and optional allowances to each worker.
4. Add `payroll_adjustments.csv` only if you want to seed advances, tips, manual bonuses, or manual deductions.
5. Start the Django backend.
6. Run the importer script.
7. After the master data is in place, upload attendance machine exports from the payroll page.

## Import command

Run this from the repository root after the backend is available on localhost:8000:

```bash
django_backend/.songfeiVENV/bin/python django_backend/scripts/import_trial_run_pack.py --input-dir docs/trial-run-bulk-import
```

If the backend API is protected later, pass a DRF token:

```bash
django_backend/.songfeiVENV/bin/python django_backend/scripts/import_trial_run_pack.py --input-dir docs/trial-run-bulk-import --token YOUR_TOKEN
```

## CSV notes

### employees.csv

Required columns:

- `worker_id`
- `name`
- `base_salary`

Optional columns:

- `is_active`

Example:

```csv
worker_id,name,base_salary,is_active
1001,Example Employee,4500000,true
```

### payroll_policies.csv

Required columns:

- `policy_code`
- `name`
- `effective_from`

Useful optional columns:

- `version_number`
- `effective_to`
- `status`
- `is_active`
- `rice_allowance_amount`
- `social_security_allowance_amount`
- `full_attendance_bonus_amount`
- `labor_pool_percent`
- `normal_work_hours_per_day`
- `salary_days_per_month`
- `overtime_multiplier`
- `late_grace_minutes`
- `rounding_unit_amount`
- `rounding_rule`
- `unapproved_absence_incident_threshold`
- `currency`

### compensation_profiles.csv

Required columns:

- `worker_id`
- `monthly_salary`
- `effective_from`

Useful optional columns:

- `effective_to`
- `payroll_policy_code`
- `payroll_policy_version`
- `rice_allowance_amount`
- `social_security_allowance_amount`
- `eligible_for_social_security`
- `trial_period_end_date`

### payroll_adjustments.csv

Required columns:

- `worker_id`
- `year`
- `month`
- `adjustment_type`
- `amount`

Useful optional columns:

- `approval_status`
- `notes`

Supported adjustment types currently match the backend choices:

- `advance`
- `tips`
- `gardening`
- `dog_feeding`
- `manual_bonus`
- `manual_deduction`
- `other`

## Idempotent behavior

The importer is designed to upsert the common seed-data records:

- employees are matched by `worker_id`
- payroll policies are matched by `policy_code` + `version_number`
- compensation profiles are matched by employee + `effective_from`
- payroll adjustments are matched by employee + year + month + adjustment type + notes

That means you can update the CSVs and rerun the importer without re-entering everything from scratch.