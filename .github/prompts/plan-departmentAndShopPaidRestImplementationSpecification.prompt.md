# Department and Shop Paid-Rest Implementation Specification

Use this prompt to refine and then implement the new department and shop paid-rest features in the existing payroll plan and codebase.

## Goal

Extend the payroll system so shop staff can use paid monthly rest days that:

- are configured by department
- are approved separately from leave
- can be taken as full day or half day
- can carry forward month to month
- do not deduct salary
- do not remove the full-attendance bonus
- still enforce minimum on-duty coverage

This feature must be implemented as a paid-rest overlay on top of the base roster, not as a repeating rest-day roster pattern.

## Confirmed Decisions

- Department is optional in the first rollout.
- A department management UI must exist so non-technical ERP users can create and maintain departments themselves.
- Existing repeating roster templates must remain available.
- For shop teams, use an all-week base roster or a dedicated all-week shop-base roster template.
- Real day-off behavior for shop staff must come from approved paid-rest requests, not from the repeating roster template itself.
- Paid rest is separate from leave because it is paid time and must not remove the full-attendance bonus.
- Carry-forward uses a large numeric cap rather than a special unlimited mode.
- Shop-specific behavior must be driven by department settings, not by matching a department name in business logic.
- Department may become required later, but only after data backfill and UI adoption.

## Existing Verified Extension Points

Backend:

- `/home/luore/projects/Employee-attendence-app2/django_backend/core/models.py`
  - `Employee`
  - `EmployeeLeaveRecord`
  - `AttendanceMonthlySummary`
  - `PayrollRunEmployee`
  - `PayrollMonthlySummary`
- `/home/luore/projects/Employee-attendence-app2/django_backend/core/serializers.py`
  - `EmployeeSerializer`
- `/home/luore/projects/Employee-attendence-app2/django_backend/core/views.py`
  - leave overlay helpers
  - attendance save/finalization flow
  - `EmployeeViewSet`
- `/home/luore/projects/Employee-attendence-app2/django_backend/core/payroll_views.py`
  - payroll API pattern for list/detail/action endpoints
- `/home/luore/projects/Employee-attendence-app2/django_backend/core/payroll_services.py`
  - attendance summary rebuild
  - payroll generation
- `/home/luore/projects/Employee-attendence-app2/django_backend/core/urls.py`
  - router registrations and payroll endpoints

Frontend:

- `/home/luore/projects/Employee-attendence-app2/nextjs_frontend/songfei/src/app/erp/layout.tsx`
  - sidebar navigation
- `/home/luore/projects/Employee-attendence-app2/nextjs_frontend/songfei/src/app/erp/employees/page.tsx`
  - employee hub cards
- `/home/luore/projects/Employee-attendence-app2/nextjs_frontend/songfei/src/app/erp/employees/crud/page.tsx`
  - employee CRUD form and roster assignment flow
- `/home/luore/projects/Employee-attendence-app2/nextjs_frontend/songfei/src/app/erp/employees/payroll/page.tsx`
  - attendance resolution, leave, and overtime operations

Important current-state note:

- `Employee` does not yet have a real `department` field.
- `AttendanceRecordEmployee.department` already exists, but it is only imported attendance snapshot text and must remain separate from master-data department assignment.

## Backend Data Model Specification

### 1. Department

Add a new `Department` model in `django_backend/core/models.py`.

Fields:

- `name`: `CharField`, required, unique
- `code`: `CharField`, optional, unique when present
- `description`: `TextField`, blank allowed
- `is_active`: `BooleanField`, default `True`
- `shop_paid_rest_enabled`: `BooleanField`, default `False`
- `paid_rest_days_granted_per_month`: `DecimalField`, default `2.0`
- `paid_rest_carry_forward_cap_days`: `DecimalField`, default `9999.0`
- `minimum_staff_required_per_shift`: `PositiveIntegerField`, default `2`
- `allow_half_day_paid_rest`: `BooleanField`, default `True`
- `created_at`: timestamp
- `updated_at`: timestamp

Rules:

- `name` is the human-facing label used in the ERP.
- Paid-rest settings are meaningful only when `shop_paid_rest_enabled` is true.
- If `shop_paid_rest_enabled` is false, paid-rest requests for employees in that department must be rejected.
- Departments should be deactivated or archived when no longer used rather than silently removed from history.

### 2. Employee Extension

Extend `Employee` in `django_backend/core/models.py`:

- `department = ForeignKey(Department, null=True, blank=True, on_delete=SET_NULL, related_name='employees')`

Rules:

- Keep department optional in v1.
- Do not make department required in serializer validation yet.
- Later hardening can make it required after all employees have been assigned.
- Do not remove or repurpose `AttendanceRecordEmployee.department`.

### 3. EmployeePaidRestRequest

Add a new `EmployeePaidRestRequest` model in `django_backend/core/models.py`.

Fields:

- `employee`: `ForeignKey(Employee, related_name='paid_rest_requests')`
- `department`: `ForeignKey(Department, null=True, on_delete=PROTECT, related_name='paid_rest_requests')`
- `rest_date`: `DateField`
- `duration_unit`: choices `full_day`, `half_day`
- `linked_attendance_shift`: choices `''`, `morning`, `afternoon`
- `paid_rest_days`: `DecimalField` storing `1.0` or `0.5`
- `submission_status`: choices `draft`, `submitted`, `approved`, `rejected`
- `employee_reason`: `TextField`, blank allowed
- `manager_note`: `TextField`, blank allowed
- `submitted_by`: optional user FK
- `submitted_at`: nullable timestamp
- `decision_by`: optional user FK
- `decision_at`: nullable timestamp
- `coverage_snapshot_json`: `JSONField`, default empty dict
- `created_at`: timestamp
- `updated_at`: timestamp

Rules:

- Only `full_day` and `half_day` are supported in v1.
- `full_day` implies both shifts and `paid_rest_days = 1.0`.
- `half_day` requires `linked_attendance_shift` and `paid_rest_days = 0.5`.
- Approved leave and approved paid rest for the same employee/date/shift are mutually exclusive.
- Requests are tied to the employee’s department snapshot at creation time for audit.

### 4. EmployeePaidRestMonthlyBalance

Add a new `EmployeePaidRestMonthlyBalance` model in `django_backend/core/models.py`.

Fields:

- `employee`: `ForeignKey(Employee, related_name='paid_rest_balances')`
- `department`: `ForeignKey(Department, null=True, on_delete=PROTECT, related_name='paid_rest_balances')`
- `year`: `PositiveIntegerField`
- `month`: `PositiveSmallIntegerField`
- `opening_balance_days`: `DecimalField`
- `granted_days`: `DecimalField`
- `used_days`: `DecimalField`
- `closing_balance_days`: `DecimalField`
- `carry_forward_cap_days`: `DecimalField`
- `calc_snapshot`: `JSONField`, default empty dict
- `generated_at`: timestamp
- `updated_at`: timestamp

Rules:

- Unique per `employee`, `year`, and `month`.
- Use this as a monthly snapshot row, not as a hand-edited running balance ledger.
- Rebuild deterministically from department policy plus approved paid-rest requests.
- Formula:
  - `closing_balance_days = min(opening_balance_days + granted_days - used_days, carry_forward_cap_days)`

## Attendance Integration Specification

Extend the attendance system with a new neutral resolved status: `paid_rest`.

### Attendance status changes

Update shift status handling anywhere the existing statuses are enumerated:

- add `paid_rest` to backend shift status validation
- add `paid_rest` to frontend `ShiftStatus` unions
- treat `paid_rest` as resolved, not missing

### Overlay pattern

Mirror the existing leave-overlay implementation in `core/views.py`.

Add helper functions parallel to the leave helpers:

- `_determine_paid_rest_shift_targets(paid_rest_request)`
- `_build_paid_rest_lookup(year, month, employee_ids)`
- `_overlay_paid_rest_records_on_day_payload(day_payload, paid_rest_requests)`

Integration order during attendance save/finalization:

1. extract day payload
2. overlay approved leave
3. overlay approved paid rest
4. apply roster off-day normalization
5. run final validations

Rules:

- Only approved paid-rest requests participate in overlay.
- Paid rest must blank in/out times for the affected shift(s).
- Paid rest must not be converted into approved leave.
- Paid rest must not leave the day unresolved.

## Attendance Summary Specification

Extend `AttendanceMonthlySummary` with:

- `paid_rest_minutes_total`

Rules:

- Paid-rest minutes are calculated from scheduled roster time for the affected shift or day.
- Paid-rest minutes are informational and auditable.
- Paid-rest minutes must not be included in:
  - `approved_leave_minutes_total`
  - `unapproved_leave_minutes_total`
  - `absent_minutes_total`
  - `deductible_nonwork_minutes`
- Paid rest must not set `full_attendance_eligible` to false.

Therefore the confirmed full-attendance rule becomes:

- lateness removes the bonus
- approved leave removes the bonus
- unapproved leave removes the bonus
- absences remove the bonus
- paid rest does not remove the bonus

## Payroll Integration Specification

Extend payroll data structures:

- add `paid_rest_minutes_total` to `PayrollRunEmployee`
- add `total_paid_rest_minutes` to `PayrollMonthlySummary`
- include paid-rest details inside payroll calculation snapshots for audit

Rules:

- Paid rest does not reduce salary.
- Paid rest does not increase salary.
- Paid rest does not count as overtime.
- Paid rest does not count as deductible minutes.
- Paid rest does not remove the full-attendance bonus.

In `generate_payroll_run`:

- keep the existing deductible minutes formula based only on lateness, absence, approved leave, and unapproved leave
- do not add `paid_rest_minutes_total` into the deduction quantity
- keep the full-attendance bonus logic neutral toward paid rest
- include paid-rest totals in `calc_snapshot` for transparency

## Validation and Approval Rules

Approval-time validations for paid rest:

1. Employee must exist and be active.
2. Employee must have a department assigned.
3. Employee department must have `shop_paid_rest_enabled = true`.
4. Employee must be rostered as working during the targeted shift or day.
5. Request must not overlap an approved leave record for the same shift/date.
6. Request must not overlap another approved paid-rest request for the same shift/date.
7. Employee must have enough available paid-rest balance in the target month.
8. Approval must preserve minimum coverage for every affected shift.

Coverage algorithm:

- resolve the base roster for all active employees in the same department for the target date and shift
- count employees scheduled to work that shift
- subtract employees already unavailable because of approved leave on that shift
- subtract employees already unavailable because of approved paid rest on that shift
- subtract the candidate employee if this approval would take them off duty
- reject approval if resulting on-duty headcount is below `department.minimum_staff_required_per_shift`

For the confirmed three-person shop case:

- if the department minimum remains `2`, only one employee can be off during a given shift

## API Specification

Add the following backend APIs.

### Department APIs

- `GET /api/departments/`
- `POST /api/departments/`
- `PATCH /api/departments/{id}/`
- `DELETE /api/departments/{id}/`

Implementation pattern:

- use `DepartmentViewSet`
- use `DepartmentSerializer`
- follow the existing `EmployeeViewSet` and router registration pattern

Delete rule:

- hard delete only if the department is unused
- otherwise deactivate or archive it so historical references remain auditable

### Paid-Rest APIs

- `GET /api/payroll/paid-rest/?year=&month=`
- `POST /api/payroll/paid-rest/`
- `GET /api/payroll/paid-rest/{id}/`
- `PATCH /api/payroll/paid-rest/{id}/`
- `DELETE /api/payroll/paid-rest/{id}/`
- `POST /api/payroll/paid-rest/{id}/submit/`
- `POST /api/payroll/paid-rest/{id}/approve/`
- `POST /api/payroll/paid-rest/{id}/reject/`
- `GET /api/payroll/paid-rest-balances/?year=&month=`

Filtering support:

- `employee_id`
- `department_id`
- `submission_status`

Implementation pattern:

- mirror the existing leave endpoints and APIView action pattern in `core/payroll_views.py`
- do not refactor unrelated payroll endpoints in the same change set

## Frontend Implementation Specification

### 1. Navigation

Update:

- `nextjs_frontend/songfei/src/app/erp/layout.tsx`
- `nextjs_frontend/songfei/src/app/erp/employees/page.tsx`

Add a new Department management entry under the employee area.

### 2. Department Management Screen

Create:

- `nextjs_frontend/songfei/src/app/erp/employees/departments/page.tsx`

Purpose:

- allow non-technical ERP users to create and edit departments
- manage shop paid-rest settings without developer help

Required UI capabilities:

- list departments
- create department
- edit department
- activate/deactivate department
- configure shop paid-rest settings when enabled
- show validation errors inline

Suggested fields in UI:

- Department name
- Code
- Description
- Active toggle
- Shop paid rest enabled toggle
- Paid rest days granted per month
- Carry-forward cap days
- Minimum staff required per shift
- Allow half-day paid rest toggle

### 3. Employee CRUD Extension

Extend:

- `nextjs_frontend/songfei/src/app/erp/employees/crud/page.tsx`

Add:

- fetch departments
- optional department select on create and edit
- explanation text that paid-rest eligibility depends on department assignment

Rules:

- department stays optional in v1
- do not block save when department is blank
- keep existing required fields for name and worker ID unchanged; monthly salary is managed through the compensation ledger rather than the employee record

### 4. Payroll Operations Extension

Extend:

- `nextjs_frontend/songfei/src/app/erp/employees/payroll/page.tsx`

Add a Paid Rest section that supports:

- month-scoped request listing
- create draft request
- submit request
- approve request
- reject request
- show monthly balances
- show coverage-related validation errors from the backend

Display requirements:

- show `Paid rest` as a distinct neutral badge separate from `Approved leave`
- show half-day targeting clearly as morning or afternoon
- show remaining balance and requested usage in days

### 5. Attendance Rendering

In the payroll attendance table and drawers:

- render approved paid rest as `Paid rest`
- do not color or label it like leave
- do not mark it unresolved
- keep leave and paid rest visually distinct for audit clarity

## Frontend Conventions To Preserve

In touched ERP pages:

- preserve page-local state patterns
- preserve page-local fetch usage where those pages already use direct endpoint calls
- avoid unrelated API-client migrations in the same slice
- preserve existing roster workflow and employee identity wording

## Build Order

### Phase A. Backend master data

1. add `Department`
2. add `Employee.department`
3. add migrations
4. expose department serializer and viewset
5. add `/api/departments/`

### Phase B. Backend paid-rest workflow

1. add `EmployeePaidRestRequest`
2. add `EmployeePaidRestMonthlyBalance`
3. add serializers
4. add list/detail/action endpoints
5. add balance endpoint
6. add approval and coverage validation

### Phase C. Backend attendance and payroll integration

1. add `paid_rest` attendance status support
2. add paid-rest overlay helpers
3. extend attendance finalization
4. add `paid_rest_minutes_total` summaries
5. extend payroll run data and monthly summaries
6. keep full-attendance and deductions neutral toward paid rest

### Phase D. Frontend management screens

1. add Departments page
2. add navigation links
3. add employee department selector
4. add payroll paid-rest section
5. add attendance rendering for `Paid rest`

### Phase E. Hardening

1. decide whether to require employee department after master data is populated
2. add stricter validation only after data migration is complete

## Migration Order

- Migration 1: add `Department` and `Employee.department`
- Migration 2: add paid-rest models
- Migration 3: add summary fields for paid-rest totals

## Testing Requirements

Backend tests in `django_backend/core/tests.py` should cover:

- department CRUD
- employee create and update with optional department
- paid-rest request creation
- half-day and full-day request validation
- overlap rejection against approved leave
- overlap rejection against approved paid rest
- insufficient balance rejection
- insufficient coverage rejection
- attendance overlay to `paid_rest`
- monthly balance rebuild math
- full-attendance neutrality for paid rest
- payroll deduction neutrality for paid rest

Frontend validation:

- `cd /home/luore/projects/Employee-attendence-app2/nextjs_frontend/songfei && npm run build`

Backend validation:

- `cd /home/luore/projects/Employee-attendence-app2/django_backend && ./.songfeiVENV/bin/python manage.py test core`

Manual verification:

1. create a department with shop paid rest enabled
2. assign an employee to that department
3. create and approve a half-day paid-rest request
4. save attendance and verify the affected shift becomes `Paid rest`
5. rebuild attendance summary and verify `paid_rest_minutes_total` is populated
6. generate payroll and verify:
   - no deduction is created for paid rest
   - full-attendance bonus remains available if there is no lateness, leave, or absence
7. verify that approving another overlapping paid-rest request is blocked when it would reduce staffing below the configured minimum

## Implementation Notes For The Coding Agent

- The live code already uses a leave overlay pattern in `core/views.py`; extend that pattern rather than inventing a separate attendance-resolution architecture.
- The live payroll engine already calculates deductions from lateness, absence, approved leave, and unapproved leave; preserve that formula and keep paid rest outside it.
- The live employee CRUD page and payroll operations page are already large; keep the changes focused and avoid unrelated cleanup refactors.
- Preserve the composite employee identity rule based on `worker_id + name`.
- Keep planner-related modules out of this work. Department and paid-rest logic belongs in `core`.
