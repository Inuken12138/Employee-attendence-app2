# ERP User Manual

## Purpose

This manual explains how to operate the main parts of the ERP system in this repository. It is written for managers and operators who use the web interface day to day.

The system currently covers these main areas:

1. Employee management
2. Attendance and payroll processing
3. Inventory management
4. Product and category management for the ecommerce catalog

## Before You Start

### Access the system

1. Start the backend and frontend.
2. Open the frontend in the browser.
3. Sign in with a valid account if login is enabled in your environment.

### Important payroll rule

Every active employee must have a worker ID.

Why this matters:

1. Attendance imports match employees by worker ID.
2. Missing worker IDs cause imported attendance rows to be skipped.
3. Payroll generation depends on finalized attendance coverage for all active employees.

Before each payroll cycle, review the employee directory and make sure all active employees have the correct worker ID from the attendance machine.

## Navigation Overview

### ERP dashboard

The ERP dashboard is the landing area for operational work. Use the sidebar or the dashboard cards to open:

1. People Hub
2. Inventory
3. Products
4. Salary Studio

## Employee Management

### Purpose

Use the employee module to create employees, maintain worker IDs, update salaries, manage active or inactive status, and assign roster templates.

### Open the employee directory

1. Go to ERP.
2. Open People Hub.
3. Open Employee Records.

### Create a new employee

1. Open the Add New Employee panel.
2. Enter the employee name.
3. Enter the base salary.
4. Enter the worker ID.
5. Save the employee.

Notes:

1. Worker ID is mandatory for new employees.
2. Worker ID should match the ID used by the attendance device export.
3. Use the exact worker ID used in real attendance files. Do not invent temporary IDs unless you are deliberately correcting a legacy record and know what the attendance source uses.

### Edit an employee

1. Find the employee in the directory table.
2. Click Edit.
3. Update the employee name, worker ID, salary, or status.
4. Save the changes.

Important:

1. Active employees should always have a worker ID.
2. Inactive employees are excluded from payroll attendance matching.

### Assign a roster

Use the Roster tab inside the employee editor to assign expected working patterns.

You can:

1. Pick an existing saved roster template.
2. Set the cycle start date.
3. Assign the selected roster.
4. Build a new roster template if needed.

Use roster templates when employees work repeating patterns such as:

1. Monday to Saturday
2. All week
3. Alternating Sunday off

## Payroll End-to-End

### Overview

The recommended payroll workflow is centered on Salary Studio. It combines these five views:

1. Attendance
2. Adjustments
3. Projects
4. Final Payroll
5. Reports

### Step 1: Prepare master data before the month closes

Before running payroll, confirm these items:

1. All active employees exist in the employee directory.
2. All active employees have the correct worker ID.
3. Employee salaries and compensation profiles are up to date.
4. The correct payroll policy exists and is active for the target month.
5. Roster assignments are correct for staff who use rotating schedules.

### Step 2: Record leave requests during the month

Open the Attendance view inside Salary Studio or the attendance resolution page from People Hub.

Use the Leave Requests section to:

1. Select the employee.
2. Choose the leave date.
3. Choose full day, half day, hours, or custom minutes.
4. Set the leave status.
5. Save the record.

Recommended usage:

1. Use draft or submitted while waiting for approval.
2. Use approved for accepted leave.
3. Use recorded unapproved for unapproved leave that must still appear in payroll.

Important:

1. Pending leave decisions block final attendance save for the month.
2. Approved and unapproved leave automatically overlay the attendance grid.

### Step 3: Import attendance for the payroll month

In the Attendance view:

1. Select the year and month.
2. Upload the attendance file exported from the attendance machine.
3. Review parsed employees and daily records.
4. Resolve missing shifts.
5. Review any overtime decision chips that appear.

Important:

1. If an employee in the machine export does not have a matching active worker ID in the employee directory, that attendance row will not match correctly.
2. Fix the employee record first if worker IDs are missing or wrong.

### Step 4: Resolve overtime decisions

If a shift runs beyond the expected roster end time, the system surfaces an overtime review item.

For each overtime item:

1. Open the overtime review.
2. Approve all overtime, deny it, or partially approve it.
3. Add a reason when any time is denied.
4. Save the decision.

Important:

1. Pending overtime decisions block final attendance save.
2. Finalized attendance should only be saved after all overtime reviews are resolved.

### Step 5: Save finalized attendance

When the month is fully reviewed:

1. Save the attendance month as final.

The system requires finalized attendance coverage for every active employee before payroll can be generated.

### Step 6: Review policy, compensation, and adjustments

Open the Adjustments view.

In this view you can:

1. Create or edit payroll policy versions.
2. Activate the correct policy for the month.
3. Create compensation profiles for employees.
4. Add payroll adjustments such as manual bonuses, manual deductions, advances, tips, gardening, or other signed entries.
5. Review carry-forward recovery balances created by prior correction runs.

Recommended order:

1. Confirm the active policy.
2. Confirm compensation profiles.
3. Add and approve payroll adjustments.
4. Review any carry-forward balances that will reduce payable salary.

### Step 7: Record project work and settle bonuses

Open the Projects view.

Use it to:

1. Create a project.
2. Assign employees to the project.
3. Record daily or hourly work in the tally grid.
4. Review the labor pool preview.
5. Settle the project bonus for the payroll month.

Notes:

1. Project settlement calculates how the remaining labor pool bonus is distributed.
2. Settled project bonuses flow into payroll runs for that month.

### Step 8: Generate payroll

Open Final Payroll.

To generate the main monthly payroll run:

1. Confirm the year and month.
2. Choose Normal run.
3. Select a policy if you want a specific version, or use the active policy.
4. Generate the payroll run.

The run will calculate:

1. Monthly base wage
2. Attendance bonus
3. Deductions from lateness, absence, and leave impact
4. Approved overtime pay
5. Approved manual adjustments
6. Project bonus amounts
7. Carry-forward recoveries
8. Final rounded gross payable amount

### Step 9: Review, approve, and lock payroll

Still in Final Payroll:

1. Open the generated run.
2. Review employee breakdowns and components.
3. Approve the run when it is correct.
4. Lock the run when it is final.

Locking a run should be treated as the month-end freeze point.

### Step 10: Create a correction run if required

If a locked payroll run must be corrected:

1. Select the source run.
2. Create a correction run.
3. Review the correction deltas.
4. Confirm whether the employer owes the employee or the employee owes the employer.
5. Review any carry-forward recovery generated for the next month.

### Step 11: Preview and export reports

Open Reports.

Use this view to:

1. Review the multi-month workforce trend chart.
2. Preview the management report in-browser.
3. Preview the employee report in-browser.
4. Generate report artifacts.
5. Open exported PDF and JPG files for both management and employee outputs.

Typical final steps:

1. Generate the workforce management report.
2. Generate each employee report.
3. Export or open the resulting files.
4. Deliver employee-facing reports and retain the management summary.

## Inventory Management

### Purpose

Use the inventory module to track stock on hand and monitor low-stock thresholds.

### Main tasks

1. Open ERP > Inventory.
2. Review the live stock table.
3. Add a new inventory item when a new stock line is introduced.
4. Enter item code, name, quantity, threshold, unit, and optional image.
5. Save the item.
6. Delete an item only when it should be removed from the system.

Operational note:

Use consistent item codes so inventory records remain easy to search and reconcile.

## Product and Category Management

### Purpose

Use the products module to manage the ecommerce catalog, including categories, subcategories, product details, and product media.

### Main tasks

1. Open ERP > Products.
2. Browse or drill into categories.
3. Create subcategories where needed.
4. Upload category images if required.
5. Create products inside the selected category.
6. Edit existing product details.
7. Remove products that should no longer be sold.

Typical product fields include:

1. Product ID
2. Product name
3. Price
4. Description
5. Category
6. Colour
7. Material
8. Best seller flag
9. New arrival flag

Recommended practice:

1. Keep category structure tidy before adding large numbers of products.
2. Use stable product IDs for internal and store operations.

## Good Operating Habits

1. Update worker IDs as soon as a new employee is created.
2. Keep inactive employees marked inactive so payroll does not expect attendance from them.
3. Approve or reject leave and overtime before month-end.
4. Finalize attendance before generating payroll.
5. Review adjustments and project settlements before locking a payroll run.
6. Treat locked payroll runs as final and use correction runs for post-lock changes.

## Troubleshooting

### Payroll generation is blocked

Check the following:

1. Attendance for the month is finalized.
2. Every active employee has attendance coverage.
3. Every active employee has a valid worker ID.
4. Pending leave decisions are resolved.
5. Pending overtime decisions are resolved.
6. A payroll policy exists for the month.

### Attendance import does not match an employee

Check the following:

1. The employee is active.
2. The worker ID in the employee directory matches the attendance machine export exactly.
3. The worker ID field is not blank.

### Employee report or management report is missing

Check the following:

1. A payroll run is selected.
2. The run contains the employee you are previewing.
3. Report artifacts have been generated for that run.
