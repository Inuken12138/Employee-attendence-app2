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
3. Enter the worker ID.
4. Save the employee.
5. Open Salary Studio.
6. Create a compensation profile with the monthly salary and any employee-specific payroll settings.

Notes:

1. Worker ID is mandatory for new employees.
2. Worker ID should match the ID used by the attendance device export.
3. Use the exact worker ID used in real attendance files. Do not invent temporary IDs unless you are deliberately correcting a legacy record and know what the attendance source uses.
4. Monthly salary is not entered in the employee record. It is maintained in the compensation ledger.

### Edit an employee

1. Find the employee in the directory table.
2. Click Edit.
3. Update the employee name, worker ID, department, or status.
4. Save the changes.

Important:

1. Active employees should always have a worker ID.
2. Inactive employees are excluded from payroll attendance matching.
3. Salary changes and payroll package changes should be made in the compensation ledger, not in the employee record.

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
3. Every employee who will be paid has an active compensation profile for the target month.
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
3. Create compensation profiles for employees. Compensation profiles are the payroll source of truth for monthly salary and employee-specific allowance settings.
4. Add payroll adjustments such as manual bonuses, manual deductions, advances, tips, gardening, or other signed entries.
5. Review carry-forward recovery balances created by prior correction runs.

Recommended order:

1. Confirm the active policy.
2. Confirm compensation profiles.
3. Add and approve payroll adjustments.
4. Review any carry-forward balances that will reduce payable salary.

Important:

1. Social security allowance is a manual employer decision in the compensation profile. It is never enabled automatically by a date-based rule.
2. Leave `Effective to` blank while the compensation package is still current.
3. When pay changes or employment ends, set the old profile `Effective to` date to its last valid day, then start the next profile on the following day so history remains continuous.

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

## Publishing Products to the Kitchen Designer

### Purpose

Use the Designer Settings page to enable a product in the live kitchen planner app, configure its 3D properties, upload a 3D model, validate it, and publish it to the catalog where users can see and insert it.

This is a multi-stage workflow with validation checkpoints. Products must pass validation and move through staging before they become available in the planner.

### Prerequisites

Before you publish a product to the designer, you must have:

1. Created the product in the ERP system.
2. Set the product name, product ID, price, and description.
3. Assigned the product to a category.
4. Prepared a `.glb` file (3D model) on your computer. This is a binary format used by the kitchen planner for 3D rendering.

**Important**: Do not proceed without a `.glb` file. The validation step requires it, and publishing will fail without it.

### Step 1: Open the Designer Settings page

1. Go to ERP > Products.
2. Find the product in the table or use search to locate it by product ID or name.
3. Click the product name to open its details.
4. At the bottom of the product details, find a link or button labeled "Go to Designer Settings" or navigate directly to the product's designer page.
5. You will see the Designer Settings form with the product name and current catalog state displayed.

### Step 2: Enable planner support

1. Locate the "Planner enabled" checkbox near the top of the form.
2. Check this box to enable the product in the planner system.
3. Once enabled, additional fields become visible and required.

**Caution**: Do not check this box until you have all the required information and a `.glb` file ready. Enabling early may create validation warnings.

### Step 3: Configure the planner role

1. In the "Planner role" dropdown, select the role that matches how this product will function in the kitchen:

   - **Base cabinet**: Products that sit on the floor and cannot move vertically (kitchen cabinets with drawers, doors, etc.).
   - **Wall cabinet**: Products mounted to walls and can move vertically (upper cupboards, open shelving).
   - **Tall cabinet**: Floor-to-ceiling products (pantry cabinets, tall appliance housings).
   - **Panel**: End panels, filler pieces, decorative panels.
   - **Benchtop**: Countertops and work surfaces.
   - **Appliance**: Integrated or standalone appliances (ovens, dishwashers, refrigerators).
   - **Accessory**: Small items and decorative elements.

**Caution**: Choose the correct role carefully. The role determines how the product behaves in the 3D planner:
- Base cabinets cannot be lifted vertically by users.
- Wall cabinets can be moved up and down only if you also enable "Allow vertical movement" (see Step 5).
- Once published, changing the role requires unpublishing and revalidating.

### Step 4: Select the planner category path

1. In the "Planner root category" dropdown, select the top-level category that contains this product. Common options are:
   - Cabinets
   - Appliances
   - Dining
   - Kitchen extras

2. Once you select a root category, the "Planner group category" dropdown becomes active.

3. In the "Planner group category" dropdown, select the subcategory:
   - For Cabinets:
     - Base cabinets
     - Wall cabinets
     - High cabinets
   - For other root categories, select the appropriate group.

4. Once you select a group category, the "Planner leaf category" dropdown becomes active.

5. In the "Planner leaf category" dropdown, select the specific product type. Examples:
   - For Base cabinets: "With door", "With drawers", "For corner", "For sink", etc.
   - For Wall cabinets: "With glass doors", "For rangehood", "Open cupboards", etc.

**Important**: The complete category path (root → group → leaf) must be selected. This determines where the product appears in the kitchen designer's product drawer and who can find it. Choose a path that makes sense for the product's function.

### Step 5: Configure movement and placement rules

1. Upload a correctly scaled `.glb` model. The planner now uses the model's native meter scale automatically when the product is inserted into the 3D scene.

2. Do not enter manual width, depth, or height overrides for `.glb` products. Those manual size fields are no longer used for planner imports.

3. If this product should be able to move vertically in the 3D planner (e.g., wall cabinets that can be positioned at different heights), check the "Allow vertical movement in 3D designer" checkbox.

4. If this product requires a wall, check "Requires wall attachment".

5. Use the other constraint checkboxes as needed:
   - "Requires benchtop": Product must sit on a benchtop (e.g., sink, cooktop).
   - "Supports left/right end panel": Marks that this cabinet can have end panels attached.

**Caution**: Validate the real scale in your `.glb` before publishing. If the model itself is authored at the wrong size, the planner will import that wrong size exactly as-is.

### Step 6: Enter pricing and rotation settings

1. Set the **Default rotation (deg)** (degrees) if the product should start at a non-zero angle when placed. Most products use 0 degrees.

2. If using a product-specific price (different from the general product price set in the product details), select **Pricing mode** as "Override" and enter the **Override price**.

   - Leave pricing mode as "Use product price" if you want the standard product price to apply in the planner.

3. Choose the **Origin anchor** (where the model's origin point is located):
   - "Floor back left" (default): The model's origin is at floor level, back-left corner.
   - "Floor back center": Origin at floor level, centered depth-wise.
   - "Center": Origin at the geometric center of the object.

### Step 7: Upload the 3D model (.glb file)

1. Locate the "Planner .glb asset" upload button.

2. Click the button and select the `.glb` file from your computer.

3. The file will upload and be stored in the system. Once uploaded, you should see a confirmation message.

**Cautions**:
- Only `.glb` files are accepted. If you have a 3D model in another format (FBX, OBJ, GLTF), convert it to `.glb` using a 3D modeling tool before uploading.
- Keep the file size reasonable (typically under 10 MB) to avoid slow loading in the planner.
- The `.glb` file must have correct scale and orientation. Test it in the planner preview after validation to ensure it looks correct.

### Step 8: Save the current settings

1. Before running validation, click the "Save settings" button to persist all configuration changes.

2. You should see a confirmation message.

**Important**: Saving is no longer mandatory before validation. The "Run asset validation" action now saves the current form automatically before checking the asset. Use "Save settings" when you want to keep changes without validating yet, or before leaving the page.

### Step 9: Run asset validation

1. Click the "Run asset validation" button.

2. The system first saves the current Designer Settings form, including any new planner metadata or newly selected `.glb` file.

3. After the save completes, the system analyzes the uploaded `.glb` file and checks all configuration fields against planner requirements.

4. Wait for validation to complete. You should see a "Latest asset validation" section appear below with:
   - **Status**: Whether validation passed or failed.
   - **Format**: The detected 3D format (should be glTF or glb).
   - **Size**: The file size in KB.
   - **Warnings**: Configuration issues that must be fixed (but do not block staging).
   - **Errors**: Critical issues that must be fixed before publishing.

**Important**: If validation reports save-related errors first, correct those issues and run validation again. Validation only checks the saved version of the profile.

**What to do if validation fails**:

- Review all warnings and errors.
- Common errors include:
  - "Upload a .glb file" (if no file was uploaded).
  - "Complete width, depth, and height values" (if dimension fields are empty).
  - "Select a planner role" (if role dropdown is not set).
  - "Pick a complete planner category path" (if any category level is not selected).
  - "Planner product is not enabled yet" (check the "Planner enabled" checkbox).
- Correct the issue and save again.
- Re-run validation.
- Repeat until validation passes or fails only on non-critical warnings.

### Step 10: Move the product to staging

1. Once validation passes (or passes with non-critical warnings), click the "Move to staging" button.

2. The product's catalog state will change from "draft" to "staging".

3. You should see a confirmation message.

**Caution**: Staging means the product is being prepared for publication but is not yet visible in the live planner. This is the last review checkpoint before going live.

### Step 11: Review and publish

1. Review the product one more time:
   - Check the category path is correct.
   - Verify dimensions and pricing.
   - Ensure the `.glb` file is the correct version.

2. If you are confident everything is correct, click the "Publish" button.

3. The product's catalog state will change from "staging" to "published".

4. The product now appears in the live kitchen planner app. Users can:
   - Find it by browsing the correct category path in the planner's product drawer.
   - Select it and place it in their kitchen design.
   - Use the product's configured constraints (vertical movement, wall attachment, etc.) during placement.

**Important**: Publishing is a public action. Once published, the product is live in the kitchen planner and can be used by customers or internal testers. Test thoroughly in staging before publishing.

### Step 12: Unpublishing (if needed)

If a published product must be removed from the live planner:

1. Click the "Unpublish" button.
2. The product moves to "archived" state and is no longer visible in the kitchen planner.
3. Customers cannot add the product to new designs, but existing designs that use it are not affected.

**Caution**: Unpublishing is not the same as deletion. The product remains in the ERP system and can be re-published later. Use unpublishing for temporary maintenance or for products that should not appear in the planner.

### Troubleshooting the publish workflow

**Problem**: Validation fails with "Upload a .glb file"

- Solution: Click the "Planner .glb asset" button and select a `.glb` file from your computer. Re-run validation.

**Problem**: Validation fails with "Complete width, depth, and height values"

- Solution: Enter the product dimensions in millimeters. All three fields are required. Re-run validation.

**Problem**: Validation fails with "Select a planner role" or "Pick a complete planner category path"

- Solution: Ensure the planner role and all three category levels (root, group, leaf) are selected from their dropdowns. Re-run validation.

**Problem**: Staging or publishing fails

- Solution: Ensure validation has passed (status shows "passed", not "failed"). Correct any errors and re-run validation before trying to stage or publish.

**Problem**: Published product does not appear in the kitchen planner

- Solution:
  - Confirm the product's catalog state shows "published" (not "staging" or "draft").
  - Reload the kitchen planner app in the browser.
  - Navigate to the category path you assigned. The product should appear in the product drawer.
  - If still not visible, check the category path is correct and try refreshing the page.

### Quick checklist before publishing

Use this checklist to verify everything is ready before clicking publish:

- [ ] "Planner enabled" checkbox is checked.
- [ ] Planner role is selected.
- [ ] Root category is selected.
- [ ] Group category is selected.
- [ ] Leaf category is selected.
- [ ] Width, depth, and height are entered in millimeters.
- [ ] `.glb` file is uploaded.
- [ ] Asset validation passed.
- [ ] Product is in "staging" state.
- [ ] Price and pricing mode are correct.
- [ ] Constraint checkboxes (vertical movement, wall attachment, etc.) are set correctly.
- [ ] Origin anchor is set correctly.

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
