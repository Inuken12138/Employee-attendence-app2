# Payroll System Plan

Date: 2026-03-31

## 1. Objective

Design a payroll system that combines:

- fixed monthly compensation
- roster-aware attendance outcomes
- full-attendance incentives
- time deductions and approved overtime pay
- optional manual adjustments such as wage advances and tips
- construction-project completion incentives funded from project revenue

The system should support preview, month-end review, approval, and a frozen payroll run that can be audited later.

It should also support employee-facing and management-facing monthly reports, correction runs for locked payroll, and exportable PDF and JPG artifacts built from the final payroll data.

## 2. Current Understanding

### A. Plain-language overview

This system can be understood as seven layers working in order:

1. The company defines payroll rules such as rice allowance, social security allowance, full-attendance bonus, and project labor-pool percent.
2. Each employee has a monthly compensation setup. This determines that employee's `monthly_base_wage`.
3. Attendance for the month is resolved first, including missing logs, leave decisions, and overtime approval or rejection.
4. Attendance and project work logs are summarized into payroll facts such as late minutes, approved overtime minutes, absences, leave minutes, and project labor cost.
5. Optional extra items are added, such as wage advances, tips, gardening pay, project-completion bonus, or correction carry-forwards.
6. A monthly payroll run collects all those facts and freezes the final result for each employee.
7. Reports and workforce summaries are generated from the locked payroll run for employees and management.

In other words:

- attendance tells us whether money should be added or deducted
- attendance resolution tells us which minutes count as approved overtime, denied overtime, leave, or absence
- manual adjustments tell us about special one-off additions or deductions
- project settlement tells us whether there is extra project bonus money
- the payroll run is the final monthly calculation container
- the report layer turns the final payroll run into auditable employee and management documents

### B. Fixed monthly compensation

Each employee has a baseline monthly package made of:

- `monthly_salary`: employee-specific fixed monthly salary
- `rice_allowance`: fixed amount, same for all employees
- `social_security_allowance`: fixed amount, optional because the employer decides manually whether the employee receives it

Recommended monthly base formula:

`monthly_base_wage = monthly_salary + rice_allowance + social_security_allowance_if_eligible`

Meaning:

- `monthly_salary` is the employee's normal fixed salary
- `rice_allowance` is added for everyone
- `social_security_allowance_if_eligible` is added only for eligible employees

This `monthly_base_wage` should be the base amount used for daily-rate and hourly-rate calculations.

### C. Full-attendance bonus

An employee earns a fixed full-attendance bonus only if the month has:

- no lateness
- no leave
- no absences

Confirmed rule for v1:

- if `late_minutes_total > 0`, no full-attendance bonus, even 1 minute
- if `approved_leave_minutes_total > 0`, no full-attendance bonus
- if `unapproved_leave_minutes_total > 0`, no full-attendance bonus
- if `absent_minutes_total > 0`, no full-attendance bonus
- if attendance for the month is unresolved, payroll cannot be finalized

### D. Time deductions and overtime approval

You clarified that overtime must not be paid automatically.

Recommended interpretation for v1:

- if an employee checks out later than the rostered end time, the extra minutes become `potential_ot_minutes`
- those minutes are shown to the user for approval, rejection, or partial approval
- only `approved_ot_minutes` are paid
- denied overtime must store a reason, and that reason should appear on the employee report
- the default action can approve the whole blue block, but the user can also toggle `Narrow it down`
- in `Narrow it down` mode, the user can define which sub-range inside the blue block is approved OT and which remaining sub-range is denied OT
- if an employee misses scheduled work time, the missed time is converted to deductible minutes
- a full-day absence is treated exactly like a late arrival in formula terms: it becomes deductible hours at normal hourly wage

- `late_hours = late_minutes_total / 60`
- `approved_ot_hours = approved_ot_minutes_total / 60`
- `deductible_nonwork_minutes = late_minutes_total + absent_minutes_total + approved_leave_minutes_total + unapproved_leave_minutes_total`
- `deductible_hours_total = deductible_nonwork_minutes / 60`

Then:

- `deduction_amount = deductible_hours_total * hourly_wage`
- `approved_overtime_pay = approved_ot_hours * hourly_wage * 2`
- `time_adjustment = approved_overtime_pay - deduction_amount`

Confirmed rule:

Hourly wage should be calculated from `monthly_base_wage`, not just from `monthly_salary`.

- `daily_salary_rate = monthly_base_wage / 30`
- `hourly_wage = daily_salary_rate / 8`

This means the rice allowance and eligible social security allowance affect:

- daily salary rate
- hourly wage
- lateness deduction
- absence deduction
- leave deduction
- overtime addition

Example of full-day absence deduction:

- if the employee was rostered for 8 hours and worked 0 hours on that day
- `absent_minutes_total += 480`
- `deduction_amount += 8 * hourly_wage`

Example of overtime approval:

- if an employee checked out 2 hours after rostered end time, the UI shows `Potential OT 2h 0m` in blue
- the user must approve, partially approve, or deny it
- if approved, those 120 minutes become `approved_ot_minutes_total`
- if partially approved, the approved sub-range becomes `approved_ot_minutes_total` and the remaining sub-range becomes denied OT time
- if denied, those 120 minutes do not generate pay and the denial reason is stored for audit and reporting

Example:

- `monthly_salary = 2,000,000`
- `rice_allowance = 200,000`
- `social_security_allowance = 150,000`
- `monthly_base_wage = 2,350,000`
- `daily_salary_rate = 2,350,000 / 30 = 78,333.33`
- `hourly_wage = 78,333.33 / 8 = 9,791.67`

If the employee has 3 approved overtime hours, overtime addition is:

- `3 * 9,791.67 * 2 = 58,750.02`

If the employee has 2 net late hours, lateness deduction is:

- `2 * 9,791.67 = 19,583.34`

### E. Leave handling

Recommended leave model for v1:

- leave can be recorded as full day, half day, or custom hours
- the system should support a real `submit leave request` step followed by a separate `approve or reject` step
- in the current offline setup, the same user can submit the request on behalf of the employee and then approve it immediately
- in the future online setup, the employee can submit the request and HR or management can approve or reject it with a reason
- leave requests must be created independently of the month-end attendance import, because the accountant records leave before the full attendance logs are available
- the important inputs are the leave date and, for partial leave, the exact time range the employee was away from work
- when the month-end attendance logs are imported, the system should automatically apply approved leave records onto the imported attendance result
- if the employee was away for the whole day, the day should show as `Approved leave` instead of `No logs`
- if the employee was away only for a time range, that time range should be treated as approved leave and counted as deductible time
- approved leave still deducts salary for missed time
- approved leave still removes the full-attendance bonus
- rejected leave or no-show becomes unapproved leave
- unapproved leave deducts salary and also creates a disciplinary incident flag

Recommended operational rule:

- if an employee has two unapproved full-day leave incidents, the system should raise a strong termination-review alert for management
- the payroll system should record and flag this clearly, but final HR action should still be manually confirmed for audit safety

Why this is a good fit for the current process:

- management can still approve or reject leave the way they do now
- the current one-user workflow can build the same future habit by using submit-then-approve even before the system is multi-user
- the accountant can record leave earlier, then let the system merge that leave into the month-end attendance import automatically
- the payroll calculation remains auditable because approved leave, rejected leave, and no-show are distinct states

### F. Optional manual adjustments

These are signed monetary adjustments:

- `wage_advance`: negative component
- `tips_and_extra_jobs`: positive component

Examples of positive extras:

- feeding the factory dog
- gardening
- other ad hoc helper tasks

### G. Construction-project incentive

You described a project-based labor pool model:

- project revenue = `X`
- labor pool = `0.1 * X`
- a team of employees is assigned to the project
- each day, the system subtracts each assigned employee's daily salary cost from the pool
- if the project finishes before the pool is exhausted, the remaining positive balance is shared with the team
- if the pool goes negative, do not deduct salary; simply treat project bonus as zero

You also clarified that the accountant records project work per project, and the measurement can be:

- `1 day`
- `0.5 day`
- custom hours such as `2 hours` or `3 hours`

For v1, use raw number of hours for hour-based entries instead of requiring a precise start and end time range.

Recommended project bonus model for v1:

- `labor_pool = project_revenue * labor_pool_percent`
- `employee_daily_wage = monthly_base_wage / 30`
- normalize every project work log entry into hours first
- `employee_project_reserved_hours = sum(normalized_hours for all project work logs for that employee on that project)`
- `employee_project_day_equivalent = employee_project_reserved_hours / normal_work_hours_per_day`
- `employee_project_labor_cost = employee_daily_wage * employee_project_day_equivalent`
- `total_actual_labor_cost_spend = sum(employee_project_labor_cost for all employees on the project)`
- `remaining_bonus_pool = max(labor_pool - total_actual_labor_cost_spend, 0)`

Confirmed distribution rule:

The remaining amount should be distributed based on each employee's share of the total actual labor cost spent on that project.

Recommended formula:

- `employee_weight = employee_project_labor_cost / total_actual_labor_cost_spend`
- `employee_share = remaining_bonus_pool * employee_weight`

Project reservation rule:

- in v1, do not automatically block or warn based on available work time for the day
- project rush work can legitimately extend beyond normal working hours because of overtime
- accountant-entered project quantities should be treated as trusted input in v1
- if needed, the UI may show informational totals, but it should not try to enforce double-booking rules automatically

Worked example based on your clarification:

- Employee A daily wage = `203,333`
- Employee A worked `20` project days
- `employee_project_labor_cost = 203,333 * 20 = 4,066,660`
- `total_actual_labor_cost_spend = 11,849,000`
- `employee_weight = 4,066,660 / 11,849,000 ≈ 34%`
- if `labor_pool = 21,558,000`
- `remaining_bonus_pool = 21,558,000 - 11,849,000 = 9,709,000`
- `employee_share ≈ 9,709,000 * 34% = 3,301,000`

In implementation, the exact fraction should be used before final thousand-rounding.

If the remaining pool is negative, project bonus becomes zero and no salary is deducted.

## 3. Recommended Monthly Payroll Formula

For each employee and payroll month:

`monthly_base_wage = monthly_salary + rice_allowance + social_security_allowance_if_eligible`

`attendance_bonus = full_attendance_bonus if eligible else 0`

`deductible_nonwork_minutes = late_minutes_total + absent_minutes_total + approved_leave_minutes_total + unapproved_leave_minutes_total`

`deductible_hours_total = deductible_nonwork_minutes / 60`

`deduction_amount = deductible_hours_total * hourly_wage`

`approved_overtime_pay = approved_ot_minutes_total / 60 * hourly_wage * 2`

`time_adjustment = approved_overtime_pay - deduction_amount`

`manual_adjustments = tips_and_extra_jobs - wage_advances + any_other_signed_adjustments`

`project_bonus = sum(project bonus shares settled into this payroll month)`

`carry_forward_recovery_amount = prior_overpayment_recovery`

`gross_before_rounding = monthly_base_wage + attendance_bonus + time_adjustment + manual_adjustments + project_bonus - carry_forward_recovery_amount`

`gross_payable = round_to_nearest_1000(gross_before_rounding)`

Important correction-run rule:

- if the employer underpaid the employee, that underpayment should be paid immediately after the correction run
- it should not become a carry-forward credit in next month's payroll
- carry-forward logic is only for prior overpayment recovery owed back to the company

Recommended output should keep the components separate rather than storing only a final amount.

Rounding rule:

- rounding happens only once at the end of payroll
- the amount is rounded to the nearest thousand kip
- this rounding note should appear on both employee and management reports

Worked example:

- `monthly_base_wage = 2,350,000`
- `attendance_bonus = 300,000`
- `approved_overtime_pay = 58,750`
- `deduction_amount = 19,583`
- `manual_adjustments = -150,000`
- `project_bonus = 400,000`
- `carry_forward_recovery_amount = 0`

Then:

- `time_adjustment = 58,750 - 19,583 = 39,167`
- `gross_before_rounding = 2,350,000 + 300,000 + 39,167 - 150,000 + 400,000 = 2,939,167`
- `gross_payable = 2,939,000` after final thousand-rounding

## 4. Data Model Design

### A. How these models relate to each other

Think of the models as different layers of the payroll system.

```text
Employee
  -> EmployeeCompensationProfile
	-> EmployeeLeaveRecord
	-> AttendanceOvertimeDecision
	   -> AttendanceOvertimeDecisionSegment
  -> AttendanceMonthlySummary
  -> EmployeePayrollAdjustment
  -> ConstructionProjectWorkLog
  -> PayrollRunEmployee
	-> EmployeePayrollCarryForwardBalance

PayrollPolicy
  -> PayrollRun

PayrollRun (normal or correction)
  -> PayrollRunEmployee
    -> PayrollComponent
	-> PayrollMonthlySummary
	-> PayrollReportArtifact
	-> PayrollCorrectionDelta

ConstructionProject
  -> ConstructionProjectAssignment
  -> ConstructionProjectWorkLog
  -> ConstructionProjectSettlement
```

Plain-language meaning:

- `Employee` is the person.
- `PayrollPolicy` is the company rulebook.
- `EmployeeCompensationProfile` is that person's pay setup.
- `EmployeeLeaveRecord` stores approved, rejected, and unapproved leave evidence.
- `AttendanceOvertimeDecision` stores whether potential overtime was approved, partially approved, or denied.
- `AttendanceOvertimeDecisionSegment` stores approved and denied sub-ranges inside a potential OT block when the user narrows it down.
- `AttendanceMonthlySummary` is the attendance fact sheet for one month after leave and overtime are resolved.
- `EmployeePayrollAdjustment` stores extra plus/minus items.
- project models track who worked on which project, how much labor cost was spent, and how much bonus is earned.
- `PayrollRun` is the monthly payroll batch, whether normal or correction.
- `PayrollRunEmployee` is one employee inside that batch.
- `PayrollComponent` is one line item inside that employee's payroll result.
- `PayrollMonthlySummary` stores management analytics for the whole workforce for that month.
- `PayrollReportArtifact` stores generated PDF and JPG report outputs.
- `PayrollCorrectionDelta` stores the difference between a correction run and the previous locked run.
- `EmployeePayrollCarryForwardBalance` stores future overpayment recoveries caused by correction runs.

Example flow:

1. Employee DONG has an `EmployeeCompensationProfile` for April 2026.
2. Management resolves DONG's leave and overtime decisions.
3. The system builds DONG's `AttendanceMonthlySummary` for April 2026.
4. The accounting team enters one `EmployeePayrollAdjustment` for a wage advance.
5. DONG also appears in project work logs and then in a `ConstructionProjectSettlement`.
6. The payroll engine creates a `PayrollRun` for April 2026.
7. Inside that run, it creates one `PayrollRunEmployee` row for DONG.
8. It then creates `PayrollComponent` rows such as monthly base wage, deduction amount, approved overtime pay, wage advance deduction, and project bonus.
9. After locking, it also creates a `PayrollMonthlySummary` and report artifacts for employees and management.

### B. Global payroll policy

Create a versioned payroll policy model so calculations are reproducible later.

Suggested model: `PayrollPolicy`

Fields:

- `policy_code`
- `name`
- `version_number`
- `effective_from`
- `effective_to`
- `rice_allowance_amount`
- `social_security_allowance_amount`
- `full_attendance_bonus_amount`
- `labor_pool_percent` default `0.10`
- `normal_work_hours_per_day` default `8`
- `salary_days_per_month` default `30`
- `overtime_multiplier` default `2.0`
- `late_grace_minutes` optional
- `rounding_unit_amount` default `1000`
- `rounding_rule` default `nearest_thousand`
- `unapproved_absence_incident_threshold` default `2`
- `status` values: `draft`, `active`, `archived`
- `cloned_from_policy` optional
- `archived_at` optional
- `currency`
- `is_active`

Purpose:

- stores the company-wide payroll rules
- allows rules to change over time without rewriting old payroll
- keeps rounding and disciplinary thresholds auditable as policy decisions

Recommended policy administration approach:

- staff should be able to create, modify, clone, activate, and archive policies through a settings UI
- hard delete should be allowed only for unused draft policies that are not referenced by any payroll run
- once a policy has been used by a payroll run, it should never be hard-deleted; archive it instead for audit safety
- major policy changes should usually be handled by cloning an existing policy and editing the new version, not by editing historical policy rows in place

Do staff need a developer to create a very different policy?

- not if the new policy still fits within the supported fields and rule schema of the payroll engine
- yes if the company wants a genuinely new calculation method, new workflow rule, or new rule type that the existing source code does not yet support

How modern payroll software usually handles this:

- policy rules are configuration data, not source-code constants
- staff manage policies through forms, versioning, effective dates, cloning, and preview tools
- historical policies are archived, not deleted, once used
- code changes are needed only when the business invents a new rule the system was never designed to model

Example use:

- In 2026 the rice allowance becomes `250,000` instead of `200,000`.
- You create a new `PayrollPolicy` starting from the new effective date.
- Old payroll runs still point to the old policy, so past months remain correct.

### C. Employee compensation profile

Suggested model: `EmployeeCompensationProfile`

Fields:

- `employee`
- `monthly_salary`
- `rice_allowance_amount` optional override if needed
- `social_security_allowance_amount` optional override if needed
- `eligible_for_social_security`
- `payroll_policy` optional override or inherited default
- `effective_from`
- `effective_to`

Purpose:

- stores employee-specific payroll settings for a date range
- determines how to compute that employee's `monthly_base_wage`
- allows salary changes without corrupting payroll history

Example use:

- Employee A earns `2,000,000` from January to June.
- From July onward the salary becomes `2,400,000`.
- Instead of editing one field and losing history, create a new profile effective from July.

### D. Monthly payroll run, line items, and placeholder actor fields

Suggested model: `PayrollRun`

Fields:

- `year`
- `month`
- `run_type` values: `normal`, `correction`
- `status` values: `draft`, `review`, `approved`, `locked`, `paid`
- `parent_run` optional
- `supersedes_run` optional
- `policy_used`
- `generated_at`
- `locked_at`
- `created_by_user` optional
- `approved_by_user` optional
- `authorized_by_user` optional
- `notes`

Purpose:

- acts as the monthly payroll container
- tells you whether payroll is still editable or already frozen
- records which policy version was used
- supports both normal runs and correction runs without rewriting history

Important note for v1:

- these actor fields are placeholders only
- any user can perform create, approve, authorize, or resolve actions
- the system should store who did the action, but should not enforce a real authorization layer yet

Suggested model: `PayrollRunEmployee`

Fields:

- `payroll_run`
- `employee`
- `monthly_base_wage_amount`
- `attendance_bonus_amount`
- `late_minutes_total`
- `absent_minutes_total`
- `approved_leave_minutes_total`
- `unapproved_leave_minutes_total`
- `approved_ot_minutes_total`
- `denied_ot_minutes_total`
- `deduction_amount`
- `overtime_pay_amount`
- `project_bonus_amount`
- `manual_adjustments_amount`
- `carry_forward_recovery_amount`
- `gross_before_rounding_amount`
- `rounding_adjustment_amount`
- `gross_payable_amount`
- `previous_run_delta_amount` optional
- `calc_snapshot` JSON for audit details

Purpose:

- stores the final monthly result for one employee inside one payroll run
- gives one row per employee per payroll month
- is the parent record for all line items on the payslip
- stores enough detail to compare one run against another in a correction workflow

Suggested model: `PayrollComponent`

Fields:

- `payroll_run_employee`
- `component_type`
- `code`
- `label`
- `amount`
- `quantity` optional
- `rate` optional
- `source_reference_type`
- `source_reference_id`
- `display_order`
- `notes`

Purpose:

- stores each line item separately
- makes the payroll explainable and auditable

Example line items for one employee:

- `monthly_base_wage_amount = +2,350,000`
- `full_attendance_bonus = +300,000`
- `deduction_amount = -19,583`
- `approved_overtime_pay = +58,750`
- `tips = +50,000`
- `wage_advance = -200,000`
- `project_bonus = +400,000`
- `rounding_adjustment = -167`

This gives a proper line-item ledger instead of a black-box total.

### E. Attendance resolution, leave, and monthly summary

Suggested model: `AttendanceOvertimeDecision`

Fields:

- `employee`
- `attendance_date`
- `attendance_shift` optional
- `roster_start_time`
- `roster_end_time`
- `actual_checkout_time`
- `potential_ot_minutes`
- `approved_ot_minutes`
- `denied_ot_minutes`
- `status` values: `pending`, `approved`, `denied`, `partially_approved`
- `decision_reason`
- `narrowed_decision_enabled` default `false`
- `resolved_by` optional
- `resolved_at`

Purpose:

- stores the blue overtime-resolution interaction from the attendance UI
- ensures overtime is auditable and not automatically paid
- keeps approval or denial reasons available for employee reports

Suggested model: `AttendanceOvertimeDecisionSegment`

Fields:

- `overtime_decision`
- `segment_start_time`
- `segment_end_time`
- `segment_minutes`
- `status` values: `approved`, `denied`
- `note` optional

Purpose:

- supports the `Narrow it down` OT review mode
- allows one blue potential OT block to be split into approved and denied chunks for audit
- keeps the approved and denied parts reconstructable in employee reports

Suggested model: `EmployeeLeaveRecord`

Fields:

- `employee`
- `leave_date`
- `leave_start_time` optional
- `leave_end_time` optional
- `submission_status` values: `draft`, `submitted`, `approved`, `rejected`, `recorded_unapproved`
- `duration_unit` values: `full_day`, `half_day`, `hour`, `custom_minutes`
- `duration_value`
- `leave_minutes`
- `employee_reason`
- `manager_note`
- `submitted_by` optional
- `submitted_at` optional
- `decision_by` optional
- `decision_at` optional
- `linked_attendance_shift` optional

Purpose:

- replaces the manual notepad process with an auditable record
- supports both the current offline workflow and a future multi-user employee-submits/HR-decides workflow
- stores the leave date and optional time range before attendance logs are imported at month end
- allows the accountant to compare leave approvals against attendance logs
- distinguishes approved leave from rejected or unapproved leave without hiding salary impact
- allows approved leave to be overlaid onto imported attendance so missing logs can become approved leave automatically

Do not calculate payroll directly from raw day cards each time in the UI. Create a service layer or summary model.

Suggested derived structure: `AttendanceMonthlySummary`

Fields or computed output:

- `employee`
- `year`
- `month`
- `scheduled_work_days`
- `actual_present_days`
- `scheduled_minutes_total`
- `worked_minutes_total`
- `late_minutes_total`
- `absent_minutes_total`
- `approved_leave_minutes_total`
- `unapproved_leave_minutes_total`
- `potential_ot_minutes_total`
- `approved_ot_minutes_total`
- `denied_ot_minutes_total`
- `full_attendance_eligible`
- `disciplinary_flags_json`

Purpose:

- converts raw attendance into payroll-ready facts
- prevents the payroll engine from re-reading every single day card every time
- stores the monthly attendance conclusion in one place
- separates late time, leave time, absence time, approved overtime, and denied overtime for audit

Example use:

- Employee B has `late_minutes_total = 42`, `approved_ot_minutes_total = 95`, `absent_minutes_total = 480`, `approved_leave_minutes_total = 0`.
- The payroll engine uses this summary to decide:
	- no full-attendance bonus because lateness is not zero
	- the absent full day is converted into deductible time
	- only the approved overtime minutes create overtime pay

This can be persisted or generated on demand and cached into the payroll run.

### F. Manual adjustments

Suggested model: `EmployeePayrollAdjustment`

Fields:

- `employee`
- `year`
- `month`
- `adjustment_type` values like `advance`, `tips`, `gardening`, `dog_feeding`, `manual_bonus`, `manual_deduction`
- `amount`
- `direction` or signed amount
- `notes`
- `created_by`
- `approved_by` optional
- `created_at`

Purpose:

- records one-off additions or deductions that are not generated from attendance
- gives accounting a controlled place to enter ad hoc payroll items
- keeps placeholder created-by and approved-by information for future role separation

Example use:

- wage advance: `-300,000`
- dog feeding allowance: `+50,000`
- gardening allowance: `+80,000`

### G. Project incentive tracking

Suggested models:

`ConstructionProject`

- `name`
- `project_code`
- `revenue_amount`
- `labor_pool_percent`
- `labor_pool_amount`
- `status` values: `planned`, `active`, `completed`, `settled`
- `start_date`
- `completed_date`
- `management_note` optional

Purpose:

- represents one construction job that can generate incentive money
- stores revenue and labor pool settings

`ConstructionProjectAssignment`

- `project`
- `employee`
- `role`
- `start_date`
- `end_date`
- `share_weight` optional for later versions

Purpose:

- records which employees belong to the project team
- defines who is allowed to earn bonus from that project

`ConstructionProjectWorkLog`

- `project`
- `employee`
- `work_date`
- `quantity_unit` values: `day`, `half_day`, `hour`
- `quantity_value`
- `normalized_hours`
- `day_equivalent`
- `attendance_record_reference` optional
- `daily_salary_rate_snapshot`
- `created_by` optional
- `notes`

Purpose:

- records who actually worked on the project on which day
- supports the accountant's real workflow of entering full days, half days, or custom hours
- uses raw number-of-hours entry for v1 instead of requiring exact time ranges
- captures the daily salary-rate snapshot used for weighted sharing and fund consumption
- treats accountant-entered quantities as trusted input in v1 instead of auto-blocking possible double booking

`ConstructionProjectSettlement`

- `project`
- `employee`
- `employee_project_reserved_hours`
- `employee_project_day_equivalent`
- `employee_project_labor_cost_amount`
- `total_actual_labor_cost_spend_snapshot`
- `weight_ratio`
- `bonus_share_amount`
- `settled_to_year`
- `settled_to_month`
- `snapshot`

Purpose:

- freezes the final project bonus result for each employee
- allows payroll to import settled project bonus without recalculating old projects
- stores the labor-cost weight used to calculate each employee's share

Example use:

- Project P is completed in June.
- The settlement creates one row per team member.
- July payroll can pull those settlement rows directly into payroll components.

This avoids recalculating historical project bonuses after salary changes.

### H. Workforce monthly summary and report artifacts

Suggested model: `PayrollMonthlySummary`

Fields:

- `payroll_run`
- `headcount_paid`
- `total_monthly_base_wages`
- `total_attendance_bonus_amount`
- `total_deduction_amount`
- `total_approved_overtime_pay_amount`
- `total_project_bonus_amount`
- `total_manual_adjustments_amount`
- `total_carry_forward_recovery_amount`
- `total_gross_before_rounding_amount`
- `total_rounding_adjustment_amount`
- `total_gross_payable_amount`
- `total_late_minutes`
- `total_absent_minutes`
- `total_leave_minutes`
- `total_approved_ot_minutes`
- `trend_snapshot_json` optional

Purpose:

- stores the monthly workforce summary in the database so trend charts can be generated later
- gives management a stable source for monthly payroll analytics
- supports time-series reporting across several months without re-deriving everything from raw components every time

Suggested model: `PayrollReportArtifact`

Fields:

- `payroll_run`
- `employee` optional
- `report_type` values: `employee`, `workforce_management`
- `format` values: `pdf`, `jpg`
- `file_path`
- `snapshot_hash`
- `generated_at`

Purpose:

- stores generated employee and management reports as auditable artifacts
- allows re-download without recalculating the whole report every time
- keeps the exact version of the report associated with a locked payroll run

### I. Correction deltas and overpayment recovery balances

Suggested model: `PayrollCorrectionDelta`

Fields:

- `current_run`
- `previous_run`
- `employee`
- `previous_gross_payable_amount`
- `corrected_gross_payable_amount`
- `delta_amount`
- `delta_direction` values: `employer_owes_employee`, `employee_owes_employer`, `no_change`
- `settlement_strategy` values: `pay_now`, `carry_forward_to_next_month`
- `settlement_strategy` values: `pay_now`, `carry_forward_recovery`
- `notes`

Purpose:

- stores the employee-by-employee difference between a correction run and the prior locked run
- makes underpayment and overpayment visible and auditable
- gives management a clean delta report instead of forcing them to compare two full runs manually

Suggested model: `EmployeePayrollCarryForwardBalance`

Fields:

- `employee`
- `origin_correction_delta`
- `amount`
- `direction` values: `recovery_from_employee`
- `apply_from_year`
- `apply_from_month`
- `remaining_amount`
- `status` values: `open`, `partially_applied`, `closed`

Purpose:

- stores money that must be recovered from a future payroll month
- supports your rule that overpaid salary is not repaid immediately, but deducted from the next month's pay
- keeps future payroll calculations connected to prior correction decisions

## 5. Backend Service Design

### A. Attendance resolution service

Suggested service: `attendance_resolution_service`

Plain-language purpose:

This service resolves the raw attendance month before payroll calculation starts. It handles missing logs, leave decisions, and overtime approval or rejection.

Responsibilities:

- compare clock logs against the employee roster
- detect missing clock-in or clock-out records
- load approved leave requests that were recorded earlier, before attendance import
- overlay approved leave dates and time ranges onto the imported attendance result
- replace what would otherwise be `No logs` with `Approved leave` when a matching approved leave record exists
- detect `potential_ot_minutes` when checkout is later than the rostered end time
- create overtime decision records that must be approved, partially approved, or denied by a user
- store denial reasons for overtime
- create and update leave records for full-day, half-day, or hour-based leave
- treat approved leave time as already resolved during attendance import so those cells do not remain red and unresolved at month end
- block payroll finalization until all attendance exceptions are resolved

Example of how it works:

1. The accountant records and approves a leave request for April 12 before the attendance file exists.
2. At month end, the service imports the raw attendance logs.
3. It finds no attendance logs for April 12, but it also finds the approved leave record for that date.
4. It overlays the leave onto the imported attendance result, so the day becomes `Approved leave` instead of `No logs`.
5. If another day has late checkout, it creates a blue overtime-resolution item with `potential_ot_minutes`.
6. A user opens it and approves, partially approves, or denies it, with a reason.
7. The month cannot be finalized while any overtime decision or unresolved non-leave attendance issue is still pending.

### B. Attendance summarizer service

Suggested service: `attendance_summary_service`

Plain-language purpose:

This service reads the resolved attendance month and converts it into payroll facts.

Responsibilities:

- read final attendance record for the month
- compare each day to the employee roster
- compute scheduled workdays
- compute lateness minutes precisely to the minute
- compute absent minutes precisely to the minute
- compute approved and denied overtime minutes precisely to the minute
- compute approved leave and unapproved leave minutes precisely to the minute
- flag full-attendance eligibility and disciplinary incidents

Example of how it works:

1. The service loads April 2026 final attendance for Employee A.
2. It checks the roster to know which days were expected work days.
3. It compares actual clock-in time to expected start time and sums late minutes.
4. It converts full-day absences and leave into deductible minutes.
5. It reads overtime decisions and sums only approved overtime minutes.
6. It flags absences and bonus eligibility.
7. It returns something like:

```json
{
	"employee_id": 15,
	"year": 2026,
	"month": 4,
	"scheduled_work_days": 26,
	"actual_present_days": 26,
	"late_minutes_total": 42,
	"absent_minutes_total": 480,
	"approved_leave_minutes_total": 0,
	"unapproved_leave_minutes_total": 0,
	"approved_ot_minutes_total": 95,
	"denied_ot_minutes_total": 60,
	"full_attendance_eligible": false
}
```

### C. Project labor settlement service

Suggested service: `project_bonus_service`

Plain-language purpose:

This service calculates how much project bonus is left after actual labor cost has been consumed, then splits that remaining amount among the team using each employee's share of total actual project labor cost.

Responsibilities:

- compute labor pool from revenue
- normalize work log entries from day, half day, or hours into reserved hours
- convert reserved hours into day-equivalent labor cost
- floor negative results at zero
- distribute remaining pool by each employee's share of total actual labor cost spend
- freeze settlement snapshot when project is completed and approved

Example of how it works:

1. Project revenue is `215,580,000` and labor pool percent is `10%`.
2. Labor pool becomes `21,558,000`.
3. The service reads all project work logs.
4. It normalizes full-day, half-day, and hour entries into reserved hours.
5. It calculates each employee's project labor cost:

`employee_project_labor_cost = employee_daily_salary_rate * employee_project_day_equivalent`

6. It sums all employee project labor cost amounts into `total_actual_labor_cost_spend`.
7. It divides each employee's project labor cost by that total to get the employee weight.
8. It multiplies that weight by the remaining bonus pool.
9. It writes frozen settlement rows.

Example output:

```json
{
	"project_id": 8,
	"labor_pool_amount": 21558000,
	"total_actual_labor_cost_spend": 11849000,
	"remaining_bonus_pool": 9709000,
	"employee_shares": [
		{"employee_id": 15, "project_labor_cost_amount": 4066660, "weight_ratio": 0.34, "bonus_share_amount": 3301000}
	]
}
```

### D. Payroll calculation engine

Suggested service: `payroll_calculation_service`

Plain-language purpose:

This is the main engine. It brings together attendance facts, compensation rules, project bonus, and manual adjustments, then writes the final payroll result.

Responsibilities:

- load active policy and employee compensation profile for the month
- load attendance summary
- load manual adjustments
- load settled project bonuses
- load open carry-forward recovery balances from prior correction runs
- calculate each payroll component
- calculate gross before rounding
- apply the final nearest-thousand rounding rule
- persist `PayrollRunEmployee` and `PayrollComponent`
- persist `PayrollMonthlySummary`
- support regenerate while run is still draft
- prevent mutation once locked

Example of how it works for one employee:

1. Load the employee compensation profile and calculate `monthly_base_wage`.
2. Load attendance summary for the month.
3. Convert `monthly_base_wage` into daily and hourly wage.
4. Convert late time, absence time, and leave time into deductible hours.
5. Convert approved overtime minutes into approved overtime pay.
6. Decide whether the employee gets full-attendance bonus.
7. Load manual adjustments.
8. Load project bonus settlements assigned to this payroll month.
9. Load any carry-forward overpayment recovery.
10. Round the final result only once at the end.
11. Write one `PayrollRunEmployee` and many `PayrollComponent` rows.

Worked example:

- `monthly_base_wage = 2,350,000`
- `deduction_amount = 19,583`
- `approved_overtime_pay = 58,750`
- `attendance_bonus = 0` because lateness is not zero
- `manual_adjustments = -150,000`
- `project_bonus = 400,000`
- `carry_forward_recovery_amount = 0`
- `gross_before_rounding = 2,639,167`
- `gross_payable = 2,639,000`

The report should also show the rounding line explicitly so the employee can see why the final amount changed.

### E. Report generation and workforce analytics service

Suggested service: `report_generation_service`

Plain-language purpose:

This service generates the auditable reports for employees and management from the final payroll run.

Responsibilities:

- build one employee report per employee for the month
- build one workforce summary report for management for the month
- render reports to PDF and JPG
- store generated artifacts in `PayrollReportArtifact`
- use `PayrollMonthlySummary` records to build workforce cost trend charts across several months

Recommended employee report content:

- employee identity and payroll month
- attendance audit table showing each late date and minute total
- approved overtime dates and approved minutes
- denied overtime dates and denial reasons
- leave dates, leave status, and deducted time
- full salary breakdown from components to final gross payable
- gross before rounding, rounding adjustment, and final rounded gross payable

Recommended workforce management report content:

- total workforce cost for the month
- headcount paid
- totals for base wages, approved overtime, deductions, bonuses, manual adjustments, carry-forward recoveries, and immediate correction payouts if this is a correction run
- total late minutes, absent minutes, leave minutes, and approved overtime minutes
- cost-per-employee ranking or outlier view
- time-series chart of workforce cost over recent months

Implementation note:

- the same structured data that drives the final payroll view should feed these reports
- reports can be rendered from HTML templates and exported to both PDF and JPG formats

### F. Correction run service

Suggested service: `correction_run_service`

Plain-language purpose:

This service creates a correction run after a payroll month has already been locked, compares it against the previous run, and records what money is still owed by the employer or recoverable from the employee.

Responsibilities:

- create a correction run linked to the previous locked run
- recalculate payroll using the corrected attendance or adjustment data
- compare corrected results employee by employee against the previous run
- write `PayrollCorrectionDelta` records
- if the employee was underpaid, create an immediate payout notice owed to the employee
- if the employee was overpaid, create a carry-forward recovery balance for the next month instead of demanding immediate repayment
- generate a delta summary report for management

Example of how it works:

1. April payroll was locked.
2. A later review finds that one employee had approved overtime that was mistakenly denied.
3. A correction run is created for April.
4. The new run is compared to the old run.
5. If the corrected April salary is higher, the system records `employer_owes_employee` for that delta and flags it for immediate payout.
6. If the corrected April salary is lower, the system creates a `recovery_from_employee` carry-forward balance for May.

Recommended default settlement logic:

- `delta > 0`: employer owes employee; show it as an immediate correction payout, not a carry-forward credit
- `delta < 0`: employee owes employer; do not demand immediate repayment, create next-month deduction instead
- `delta = 0`: no carry-forward action needed

### G. API surface

Recommended endpoints:

- `GET/POST /api/payroll/policies/`
- `GET /api/payroll/policies/active/`
- `PATCH /api/payroll/policies/{id}/`
- `POST /api/payroll/policies/{id}/clone/`
- `POST /api/payroll/policies/{id}/archive/`
- `DELETE /api/payroll/policies/{id}/` only for unused draft policies
- `GET /api/payroll/attendance-summary/?year=&month=`
- `GET/POST /api/payroll/attendance-resolutions/`
- `POST /api/payroll/attendance-resolutions/{id}/approve-ot/`
- `POST /api/payroll/attendance-resolutions/{id}/partial-approve-ot/`
- `POST /api/payroll/attendance-resolutions/{id}/deny-ot/`
- `GET/POST /api/payroll/leaves/`
- `POST /api/payroll/leaves/{id}/submit/`
- `POST /api/payroll/leaves/{id}/approve/`
- `POST /api/payroll/leaves/{id}/reject/`
- `POST /api/payroll/runs/generate/`
- `GET /api/payroll/runs/?year=&month=`
- `GET /api/payroll/runs/{id}/`
- `POST /api/payroll/runs/{id}/lock/`
- `POST /api/payroll/runs/{id}/approve/`
- `POST /api/payroll/runs/{id}/create-correction/`
- `GET /api/payroll/runs/{id}/deltas/`
- `GET/POST /api/payroll/adjustments/`
- `GET /api/payroll/monthly-summaries/?months=12`
- `GET /api/payroll/reports/employee/?year=&month=&employee=`
- `GET /api/payroll/reports/workforce/?year=&month=`
- `POST /api/payroll/reports/generate/`
- `GET/POST /api/projects/`
- `GET/POST /api/projects/{id}/assignments/`
- `GET/POST /api/projects/{id}/worklogs/`
- `POST /api/projects/{id}/settle-bonus/`

## 6. UI/UX Design Ideas

### A. Payroll command center

Create a dedicated payroll workspace with five main views:

1. `Attendance`
2. `Adjustments`
3. `Projects`
4. `Final Payroll`
5. `Reports`

Attendance and leave should stay closely connected, but leave requests must be recordable independently before the month-end attendance file is imported.

### B. Attendance view

Purpose:

- inspect the resolved attendance month
- confirm there are no unresolved days
- review late minutes, approved overtime minutes, denied overtime, leave, absences, and full-attendance eligibility

Recommended interactions:

- roster-aware monthly table
- red cells for missing logs
- blue chips for `Potential OT`
- leave request entry should also be accessible independently, without requiring the monthly attendance table to be open first
- leave badges for `Pending leave`, `Approved leave`, `Rejected leave`, and `Unapproved leave`
- employee summary badges such as `Late 27m`, `Approved OT 3h 15m`, `Absent 1 day`, `Approved leave 4h`
- click a blue OT chip to open a modal showing rostered end time, actual checkout time, potential OT minutes, decision action, and reason field
- default OT modal action should allow whole-block approve or whole-block deny
- add a toggle called `Narrow it down`
- when `Narrow it down` is enabled, let the user define approved and denied sub-ranges inside the blue OT block so only the approved chunk becomes payable
- for leave, the same UI component should support current offline proxy submission and future online employee self-submission
- in the current one-user mode, the user can submit on behalf of an employee and immediately approve it in a second step
- when month-end attendance is imported, approved leave should already appear as `Approved leave` on affected dates or time ranges instead of showing red `No logs`
- click an employee to open an audit drawer with day-by-day explanations precise to the minute
- disable month finalization until missing logs, leave decisions, and OT decisions are all resolved

### C. Adjustments view

Purpose:

- enter wage advances
- record tips and side-job earnings
- track approval and notes
- review carry-forward overpayment recoveries created by prior correction runs

Recommended interactions:

- month grid by employee
- quick-add chips for common adjustment types
- signed amount field
- approval state badge
- read-only carry-forward section showing which balances will be applied this month

### D. Projects view

Purpose:

- manage construction projects and incentive pools
- help the accountant tally project work in the exact way she already works
- see whether a project still has positive distributable bonus

Recommended interactions:

- project list with columns for revenue, labor pool, actual labor cost spend, remaining pool, status
- support multiple active projects at the same time
- click a project to open a daily tally sheet
- daily tally sheet rows = employees, columns = dates
- each cell should offer quick entry chips such as `1d`, `0.5d`, `2h`, `3h`, plus a custom input
- for hour-based entries in v1, use raw number of hours only and do not require start and end times
- do not automatically warn or block based on available work time for the day in v1
- if useful, show informational recorded totals only, without treating them as a conflict condition
- preview the employee project labor cost and the remaining bonus pool as the accountant records entries
- completion workflow should preview the final bonus settlement before confirming

### E. Final payroll view

Purpose:

- show each employee’s payroll breakdown in one place

Recommended row layout:

- employee name
- monthly base wage
- attendance bonus
- deduction amount
- approved overtime pay
- project bonus
- manual adjustments
- carry-forward recovery
- gross before rounding
- rounding adjustment
- final payable

Recommended detail drawer:

- exact formula used
- attendance summary
- denied overtime dates and reasons
- leave summary with approved and unapproved minutes
- project bonus explanation
- list of manual adjustments
- previous-run delta if this is a correction run
- policy version used

### F. Reports view

Purpose:

- generate employee-facing monthly payroll reports
- generate management-facing workforce summary reports
- export the same report data in PDF and JPG format

Recommended employee report sections:

- employee identity and payroll month
- attendance audit table showing each late date and minute total
- approved overtime dates and minute totals
- denied overtime dates and denial reasons
- leave dates, leave status, and deducted time
- salary breakdown showing each component and the path to final gross payable
- gross before rounding, rounding adjustment, and final rounded payable
- note explaining the final nearest-thousand rounding rule

Recommended management workforce report sections:

- total workforce cost for the month
- headcount paid
- totals for base wages, deductions, approved overtime, bonuses, manual adjustments, carry-forward recoveries, and immediate correction payouts where applicable
- workforce attendance analytics such as total late minutes, leave minutes, absence minutes, and approved overtime minutes
- employee outliers or exceptional cases
- time-series chart showing workforce cost across several months using `PayrollMonthlySummary`

Recommended interactions:

- preview report in the browser before export
- export to PDF and JPG
- filter by month and employee where applicable
- allow management to download the workforce report and employees to view only their own report once authorization is implemented later

### G. Approval, locking, and correction runs

Recommended workflow:

1. Generate draft payroll run.
2. Resolve missing logs, leave decisions, and overtime decisions.
3. Review issues and warnings.
4. Approve line items or adjustments.
5. Lock payroll run.
6. Generate employee and management reports.
7. If an error is found later, create a correction run rather than editing the locked run silently.

Important v1 authorization note:

- any user can perform create, approve, authorize, resolve, and lock actions
- the system should record those actor fields for audit, but should not enforce real role-based authorization yet

Correction-run UI recommendation:

- show the previous locked run and the new correction run side by side
- show employee-by-employee delta amounts
- show whether the employer owes the employee or the employee owes the employer
- if the employer owes the employee, clearly mark it as an immediate correction payout
- if overpaid, clearly mark the amount as a next-month deduction rather than an immediate repayment demand

### H. Suggested leave UX in the current system

Recommended approach:

- keep leave close to payroll, but allow leave requests to be entered independently from month-end attendance review
- allow the user to open a standalone leave request form and submit a leave request for a full day or a specific time range
- after submission, let the same user approve it in the current offline workflow, or let another user approve it in the future online workflow
- when attendance is later imported, overlay the approved leave onto the affected day or time range automatically
- show leave status directly on the attendance calendar after import so the accountant sees it while reviewing salary
- keep approved leave, rejected leave, and unapproved leave visually distinct
- use the leave date and optional time range as the source of truth for filling attendance gaps caused by approved leave
- turn repeated unapproved full-day absences into a strong management alert banner rather than a silent note

Why this is the best fit right now:

- it matches the current manual process closely
- it builds the same habit that will later work in a multi-user employee-and-HR workflow
- the accountant can compare leave notes directly against the attendance logs on the same screen
- it avoids building a separate complex HR module before the payroll workflow is stable

### I. Policy administration suggestions

Recommended approach:

- let staff manage payroll policies through a `Policies` admin/settings screen rather than asking a developer to edit source code
- let staff create a brand new policy by cloning an old one or by starting a blank draft
- let staff edit draft or future-effective policies before activation
- once a policy has been used in a payroll run, archive it instead of deleting it
- allow hard delete only for unused draft policies that have never been applied anywhere

How modern payroll software usually works:

- payroll policies are configuration records stored in the database
- staff manage them with forms, versioning, effective dates, previews, and archive actions
- developers are only needed when the company invents a new calculation type or rule that the existing engine cannot represent

Recommended UI elements:

- policy list with status `Draft`, `Active`, `Archived`
- `Clone policy` action
- `Preview impact` action showing how the policy would affect a sample payroll month
- `Archive policy` action instead of delete for anything already used historically

## 7. Calculation Order

Recommended order for each payroll run employee:

1. Resolve effective compensation profile.
2. Resolve payroll policy for the month.
3. Resolve missing logs, leave records, and overtime decisions.
4. Build attendance summary.
5. Compute full-attendance eligibility.
6. Compute `monthly_base_wage`, then compute daily and hourly wage from it.
7. Compute deduction amount from late minutes, absence minutes, and leave minutes.
8. Compute approved overtime pay from approved overtime minutes only.
9. Pull approved manual adjustments.
10. Calculate project labor-cost settlements and project bonus shares.
11. Apply carry-forward recoveries from prior overpayment correction runs.
12. Sum all components into `gross_before_rounding`.
13. Apply final nearest-thousand rounding.
14. Persist line items, monthly summary, report artifacts, and correction deltas if applicable.

## 8. Confirmed Rules

### A. Confirmed rules

These rules are now confirmed from your latest clarification:

1. Use `monthly_base_wage`, not `base_wage`, as the main compensation term.
2. `monthly_base_wage = monthly_salary + rice_allowance + social_security_allowance_if_eligible`.
3. `daily_salary_rate = monthly_base_wage / 30`.
4. `hourly_wage = daily_salary_rate / 8`.
5. Any lateness at all, even 1 minute, removes the full-attendance bonus.
6. Approved leave and unapproved leave both remove the full-attendance bonus.
7. Approved leave still deducts salary for the missed time.
8. A full-day absence is treated like missed working time and deducted using the same hourly wage logic as lateness.
9. Overtime must be manually approved by a user before it becomes payable.
10. OT approval is case by case, and the user must be able to fully approve, fully deny, or narrow the blue OT block down into approved and denied chunks.
11. Denied overtime must store a reason, and that reason should appear on the employee report.
12. One unapproved leave already requires management attention, and repeated unapproved full-day incidents should raise a strong warning but still require manual management confirmation.
13. Project daily cost should be based on the employee's monthly base wage converted to a daily rate.
14. Remaining project bonus pool should be split by each employee's share of the total actual labor cost spent on that project.
15. Project work can be recorded as full day, half day, or raw hours.
16. For v1 hour-based project entries, use raw hour quantities and do not require exact time ranges.
17. Do not automatically warn or block project entries based on available work time in v1; trust accountant-entered project quantities even when rush work or overtime is involved.
18. Social security eligibility is a manual employer decision in the compensation ledger. No payroll allowance changes automatically from a date-based status flag.
19. Rounding happens only once at the very end of payroll, to the nearest thousand kip.
20. The rounding note should appear on both employee and management reports.
21. If a correction run shows the employer underpaid the employee, the underpayment should be paid immediately and not carried forward.
22. Overpayment found by a correction run should be recovered from next month's pay rather than demanded immediately.
23. Any user can act in placeholder approval and authorization fields for v1; real role separation comes later.
24. Leave requests must be storable before month-end attendance import, using a leave date and optional time range.
25. Approved leave should automatically fill the relevant imported attendance gaps so covered periods do not remain red `No logs` cells.

## 9. Recommended Phased Rollout

### Phase 1. Stabilize attendance resolution

- finalize roster-aware attendance
- add missing-log resolution flow
- add standalone leave submission and approval flow
- add approved-leave overlay during month-end attendance import
- add overtime approval, denial, and narrowed partial-approval flow
- add monthly attendance summaries
- add full-attendance bonus rules
- add late, absence, leave, and approved-overtime calculations

### Phase 2. Add payroll core

- monthly base wage calculation
- deduction amount and approved overtime pay calculation
- wage advances
- tips and side jobs
- placeholder actor fields
- policy administration UI with clone and archive actions
- final nearest-thousand rounding rule

### Phase 3. Add project work logging and bonus settlement

- project setup
- team assignment
- day, half-day, and raw-hour tally UI
- trusted raw-hour entry without automatic available-time conflict enforcement
- bonus settlement preview and approval

### Phase 4. Add reports and workforce summaries

- employee payroll report in PDF and JPG
- management workforce summary report in PDF and JPG
- payroll monthly summary table in the database
- workforce cost trend charts over several months

### Phase 5. Add locking, correction runs, and overpayment recovery balances

- draft payroll generation
- employee breakdowns
- approval and locking
- correction delta comparison view
- immediate underpayment payout notices
- next-month overpayment recovery balances
- management correction reports

## 10. Recommended V1 Scope

To keep the first release manageable, start with:

- fixed monthly compensation
- full-attendance bonus
- resolved attendance with missing-log, leave, and overtime decisions
- deduction and approved overtime calculation
- wage advances and tips
- project work logging in day, half-day, and raw-hour units
- employee payroll report and management workforce summary report
- draft and locked payroll run with correction deltas and next-month overpayment recovery balances

If the first release needs further trimming, postpone only the more advanced automation such as real role-based authorization, automatic HR actions, and scheduled report delivery.






