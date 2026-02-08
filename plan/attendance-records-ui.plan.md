# Attendance Records UI Plan (ERP Payroll Page)

Goal: Parse uploaded attendance .xls files, display per-employee daily time logs on the ERP payroll page, allow HR to fill missing shifts, and persist completed monthly records in the database. Support viewing and editing previously saved monthly records.

## 1) Findings from existing parsing logic

### Notebook logic (`attendence/app.ipynb`)
- Uses `pandas` to read a sheet with header rows containing `工号` and `姓名`.
- Finds the row with `工号`, then the next row contains day numbers.
- Detects the current month days by scanning for the first `1` and continuing until the next `1`.
- Builds a `column_to_date_mapping` between Excel columns and day numbers.
- Iterates each employee block:
  - Reads `工号` / `姓名` / `部门` from the header row.
  - Collects daily time logs from subsequent rows until the next `工号` row.
  - Each day cell may contain 0–4 log entries separated by line breaks.
- Output: a cleaned DataFrame with columns `[Employee ID, Employee Name, Department, Day 1..Day N]`, where each day cell is a newline-joined list of time logs.

### Backend parser (`django_backend/core/views.py`)
- `_parse_attendance_sheet()` currently calculates `valid_days` only (requires 4 logs) and computes `monthly_salary` using a fixed base (2,000,000).
- Output payload is payroll summary only, no per-day records.

### Recommendation (evaluation)
- Delete the existing payroll summary parser and replace it with a records parser based on the notebook approach.
- The notebook logic is closer to the required per-day, per-shift view and handles variable log counts.
- The UI must rely on the records parser because it retains per-day logs.

## 2) Desired output
Replace the “monthly payroll results” panel in the ERP payroll page with an attendance records view that supports manual completion and saving.

UI should show, for the selected month:
- Employee ID, name, department
- For each day in the month: two subcells (morning shift, afternoon shift)
- Missing shift subcell in red with click-to-resolve popup
- Any day with log count != 4 (including 2 logs) or more than 4 logs merges into a single red cell; user must resolve morning then afternoon before the cell returns to normal
- When all missing shifts and abnormal cells are resolved, allow saving to DB
- If unresolved items exist, block final save and show a popup with a clear warning
- Allow saving an incomplete month as a draft for later continuation

## 3) Proposed backend changes

### A) Add a new parsing function
- New helper: `_parse_attendance_sheet_records(file_obj, year, month)`
- Use the notebook’s approach:
  - Find row containing `工号`.
  - Next row is day numbers row.
  - Map Excel columns to days for the current month.
  - Parse employee blocks until the next `工号` row.
  - Collect logs as arrays in each day.
- Keep raw logs per day; UI will split into morning/afternoon or abnormal merged cells based on log count.

### B) New API endpoints
- `POST /api/payroll/attendance-records/parse`:
  - Accept uploaded file only (no default file path).
  - Parse and return records for UI display.
  - After parsing, delete the uploaded file (no storage of source file).
- `POST /api/payroll/attendance-records/save`:
  - Persist resolved logs to DB (month/year + per-employee shifts).
- `POST /api/payroll/attendance-records/save-draft`:
  - Persist partially resolved logs as a draft for later continuation.
- `GET /api/payroll/attendance-records/?year=YYYY&month=MM`:
  - Fetch saved monthly records for view/edit.
- `GET /api/payroll/attendance-records/drafts/?year=YYYY&month=MM`:
  - Fetch draft for the month (overwrite behavior).
- Response shape for parse/fetch/drafts:
  - `year`, `month`, `days`
  - `employees`: array of
    - `employee_id`, `employee_name`, `department`, `worker_id`
    - `day_logs`: map `Day N => [time1, time2, ...]`

### C) Upload-only behavior
- No default file path; always parse from uploaded file.
- After parsing, delete the uploaded file and only return parsed data to the UI.

## 4) Frontend changes (ERP payroll page)

### A) Replace the results panel
- Remove the “monthly payroll results” block in `nextjs_frontend/songfei/src/app/erp/employees/payroll/page.tsx`.
- Add a new attendance records table/grid:
  - Header row: Day 1..Day N
  - Each cell split into two subcells: Morning / Afternoon
  - If a shift pair is missing, show red background + click to resolve
  - If log count is odd or > 4, show a single merged red cell containing all logs and require two-step resolution (morning then afternoon)
  - Popup options:
    - “Manual edit” (enter in/out times)
    - “Mark as absent” (clears warning, counts as missing)
  - Block final save when unresolved and show a popup that explains why
  - Add Draft section and Save Draft button

### B) Data source
- Keep upload form for parsing new files.
- Add month/year selector + “Load saved records” button.
- Add “Load draft” button and a draft summary block.
- Same UI renders parsed data or saved data.
- Add “Edit mode” toggle with local confirm (no auth gate yet; future permission gate).

## 5) Data model changes
### A) Employee model
- Add `worker_id` field (for `工号`), unique + required, editable for recovery scenarios.
- Add `is_active` flag for current staff.
- Filter out inactive employees when displaying records.

### B) Attendance storage
- Add `AttendanceRecord` (monthly header) and `AttendanceShift` (per-employee per-day shift pair) normalized tables.
- Store both raw logs and normalized morning/afternoon pairs.
- Track resolution status (missing, manually filled, absent).
- Draft records overwrite previous draft for the same month and are shared across HR users.

## 6) Implementation steps
1. Add `worker_id` and `is_active` to `Employee` (migration required).
2. Implement the records parser in `django_backend/core/views.py` using the notebook logic.
3. Add APIs for parse, save, save-draft, fetch, and fetch-draft monthly attendance records.
4. Add DB models for monthly records and shift pairs.
5. Update ERP payroll page to render the split-shift grid and editing popup.
6. Add “Edit mode” toggle and save button.

## 7) Validation checklist
- Confirm parsing works for uploaded December XLS.
- Ensure 2-log days show missing afternoon shift.
- Ensure inactive employees are filtered out (based on `worker_id` + `is_active`).
- Verify edit popup writes updates into UI state.
- Verify save persists and fetch rehydrates the same view.
