'use client';

/**
 * Payroll feature module used by the ERP salary workspace.
 *
 * It contains the richer payroll workflow UI and its helper logic so the route file can stay small and focused on routing.
 */

import { Cormorant_Garamond, IBM_Plex_Sans } from 'next/font/google';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';

const displayFont = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'] });
const bodyFont = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

const API_BASE = 'http://localhost:8000/api';
const PAYROLL_API_BASE = `${API_BASE}/payroll`;
const EMPLOYEES_API_BASE = `${API_BASE}/employees/`;
const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];
const ADJUSTMENT_TYPE_OPTIONS = [
  { value: 'advance', label: 'Wage advance' },
  { value: 'tips', label: 'Tips and extra jobs' },
  { value: 'gardening', label: 'Gardening' },
  { value: 'dog_feeding', label: 'Dog feeding' },
  { value: 'manual_bonus', label: 'Manual bonus' },
  { value: 'manual_deduction', label: 'Manual deduction' },
  { value: 'other', label: 'Other' },
];
const SALARY_VIEW_OPTIONS = [
  { value: 'attendance', label: 'Attendance', helper: 'Resolve logs, leave, and overtime.' },
  { value: 'adjustments', label: 'Adjustments', helper: 'Policies, compensation, extras, and recoveries.' },
  { value: 'projects', label: 'Projects', helper: 'Daily tally sheets and bonus pool previews.' },
  { value: 'final_payroll', label: 'Final Payroll', helper: 'Generate, approve, lock, and correct runs.' },
  { value: 'reports', label: 'Reports', helper: 'Preview reports, trends, and export artifacts.' },
] as const;
const PROJECT_TALLY_QUICK_OPTIONS = [
  { label: '1d', quantityUnit: 'day', quantityValue: '1' },
  { label: '0.5d', quantityUnit: 'half_day', quantityValue: '1' },
  { label: '2h', quantityUnit: 'hour', quantityValue: '2' },
  { label: '3h', quantityUnit: 'hour', quantityValue: '3' },
] as const;

type SalaryStudioView = (typeof SALARY_VIEW_OPTIONS)[number]['value'];
type PolicyStatus = 'draft' | 'active' | 'archived';
type CompensationFormMode = 'create' | 'edit' | 'terminate';
type AttendanceWorkRuleFormMode = 'create' | 'edit' | 'terminate';
type PayrollRunType = 'normal' | 'correction';
type PayrollRunStatus = 'draft' | 'review' | 'approved' | 'locked' | 'paid';
type ProjectStatus = 'planned' | 'active' | 'completed' | 'settled';
type QuantityUnit = 'day' | 'half_day' | 'hour';
type AttendanceWorkRule = 'standard' | 'driver_time_bank';

interface RecordsEnvelope<T> {
  records: T[];
}

interface EmployeeOption {
  id: number;
  name: string;
  worker_id?: string | null;
  is_active?: boolean;
}

interface PayrollPolicyRecord {
  id: number;
  policy_code: string;
  name: string;
  version_number: number;
  effective_from: string;
  effective_to: string | null;
  rice_allowance_amount: string;
  social_security_allowance_amount: string;
  full_attendance_bonus_amount: string;
  labor_pool_percent: string;
  normal_work_hours_per_day: string;
  salary_days_per_month: number;
  overtime_multiplier: string;
  overtime_grace_minutes: number;
  late_grace_minutes: number | null;
  rounding_unit_amount: number;
  rounding_rule: string;
  unapproved_absence_incident_threshold: number;
  status: PolicyStatus;
  currency: string;
  is_active: boolean;
  cloned_from_policy?: number | null;
  cloned_from_policy_code?: string | null;
}

interface CompensationProfileRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  monthly_salary: string;
  rice_allowance_amount: string | null;
  social_security_allowance_amount: string | null;
  eligible_for_social_security: boolean;
  payroll_policy: number | null;
  payroll_policy_name?: string | null;
  effective_from: string;
  effective_to: string | null;
}

type CompensationProfileTiming = 'selected-month' | 'future' | 'ended';

interface AttendanceWorkRuleProfileRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  work_rule: AttendanceWorkRule;
  effective_from: string;
  effective_to: string | null;
  notes: string;
}

interface AttendanceSummaryRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  year: number;
  month: number;
  scheduled_work_days: number;
  actual_present_days: number;
  scheduled_minutes_total: number;
  worked_minutes_total: number;
  late_minutes_total: number;
  early_departure_minutes_total: number;
  absent_minutes_total: number;
  time_bank_minutes_total: number;
  approved_leave_minutes_total: number;
  unapproved_leave_minutes_total: number;
  potential_ot_minutes_total: number;
  approved_ot_minutes_total: number;
  denied_ot_minutes_total: number;
  full_attendance_eligible: boolean;
  disciplinary_flags_json?: {
    unapproved_full_day_incidents?: number;
    termination_review_alert?: boolean;
  };
}

interface AdjustmentRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  year: number;
  month: number;
  adjustment_type: string;
  amount: string;
  approval_status: 'pending' | 'approved';
  notes: string;
}

interface ProjectAssignmentRecord {
  id: number;
  project: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  role: string;
  start_date: string | null;
  end_date: string | null;
  share_weight: string | null;
}

interface ProjectSettlementRecord {
  id: number;
  project: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  employee_project_reserved_hours: string;
  employee_project_day_equivalent: string;
  employee_project_labor_cost_amount: string;
  total_actual_labor_cost_spend_snapshot: string;
  weight_ratio: string;
  bonus_share_amount: string;
  settled_to_year: number;
  settled_to_month: number;
}

interface ProjectRecord {
  id: number;
  name: string;
  project_code: string;
  revenue_amount: string;
  labor_pool_percent: string;
  labor_pool_amount: string;
  status: ProjectStatus;
  start_date: string;
  completed_date: string | null;
  management_note: string;
  assignments: ProjectAssignmentRecord[];
  settlements: ProjectSettlementRecord[];
  total_bonus_distributed: string;
}

interface WorkLogRecord {
  id: number;
  project: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  work_date: string;
  quantity_unit: QuantityUnit;
  quantity_value: string;
  normalized_hours: string;
  day_equivalent: string;
  daily_salary_rate_snapshot: string;
  notes: string;
}

interface PayrollRunBriefRecord {
  id: number;
  year: number;
  month: number;
  run_type: PayrollRunType;
  status: PayrollRunStatus;
  policy_name: string;
  headcount_paid: number;
  total_gross_payable_amount: string;
  generated_at: string | null;
  locked_at: string | null;
  notes: string;
}

interface PayrollComponentRecord {
  id: number;
  component_type: string;
  code: string;
  label: string;
  amount: string;
  quantity: string | null;
  rate: string | null;
  notes: string;
}

interface PayrollRunEmployeeRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  monthly_base_wage_amount: string;
  attendance_bonus_amount: string;
  late_minutes_total: number;
  early_departure_minutes_total: number;
  absent_minutes_total: number;
  time_bank_minutes_total: number;
  opening_time_bank_minutes_total: number;
  settled_time_bank_minutes_total: number;
  closing_time_bank_minutes_total: number;
  approved_leave_minutes_total: number;
  unapproved_leave_minutes_total: number;
  approved_ot_minutes_total: number;
  approved_ot_offset_minutes_total: number;
  payable_ot_minutes_total: number;
  denied_ot_minutes_total: number;
  deductible_minutes_total: number;
  deduction_amount: string;
  overtime_pay_amount: string;
  project_bonus_amount: string;
  manual_adjustments_amount: string;
  carry_forward_recovery_amount: string;
  gross_before_rounding_amount: string;
  rounding_adjustment_amount: string;
  gross_payable_amount: string;
  previous_run_delta_amount: string | null;
  components: PayrollComponentRecord[];
}

interface PayrollMonthlySummaryRecord {
  id?: number;
  payroll_run?: number;
  headcount_paid: number;
  total_monthly_base_wages: string;
  total_attendance_bonus_amount: string;
  total_deduction_amount: string;
  total_approved_overtime_pay_amount: string;
  total_project_bonus_amount: string;
  total_manual_adjustments_amount: string;
  total_carry_forward_recovery_amount: string;
  total_gross_before_rounding_amount: string;
  total_rounding_adjustment_amount: string;
  total_gross_payable_amount: string;
  total_late_minutes: number;
  total_early_departure_minutes: number;
  total_absent_minutes: number;
  total_time_bank_minutes: number;
  total_leave_minutes: number;
  total_approved_ot_minutes: number;
  total_approved_ot_offset_minutes: number;
  total_payable_ot_minutes: number;
}

interface PayrollMonthlyTrendRecord extends PayrollMonthlySummaryRecord {
  year: number;
  month: number;
  run_status: PayrollRunStatus;
  run_type: PayrollRunType;
  policy_name: string;
}

interface PayrollCorrectionDeltaRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  previous_gross_payable_amount: string;
  corrected_gross_payable_amount: string;
  delta_amount: string;
  delta_direction: string;
  settlement_strategy: string;
}

interface PayrollReportArtifactRecord {
  id: number;
  report_type: string;
  format: 'pdf' | 'jpg';
  file_path: string;
  url: string;
  employee: number | null;
  employee_name?: string | null;
  generated_at: string;
}

interface PayrollRunDetailRecord {
  id: number;
  year: number;
  month: number;
  run_type: PayrollRunType;
  status: PayrollRunStatus;
  policy_used: number;
  policy_name: string;
  notes: string;
  employees: PayrollRunEmployeeRecord[];
  monthly_summary: PayrollMonthlySummaryRecord | null;
  correction_deltas: PayrollCorrectionDeltaRecord[];
  report_artifacts: PayrollReportArtifactRecord[];
}

interface CarryForwardBalanceRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  amount: string;
  apply_from_year: number;
  apply_from_month: number;
  remaining_amount: string;
  status: string;
}

interface WorkforceReportPreviewRecord {
  report_title: string;
  payroll_run: {
    id: number;
    year: number;
    month: number;
    run_type: PayrollRunType;
    status: PayrollRunStatus;
  };
  monthly_summary: PayrollMonthlySummaryRecord;
  employee_rows: Array<{
    employee_name: string;
    gross_payable_amount: string;
    late_minutes_total: number;
    approved_ot_minutes_total: number;
    approved_ot_offset_minutes_total: number;
    payable_ot_minutes_total: number;
    closing_time_bank_minutes_total: number;
    project_bonus_amount: string;
  }>;
  rounding_note: string;
}

interface EmployeeReportPreviewRecord {
  report_title: string;
  employee: {
    id: number;
    name: string;
    worker_id?: string | null;
  };
  payroll_run: {
    id: number;
    year: number;
    month: number;
    run_type: PayrollRunType;
    status: PayrollRunStatus;
  };
  attendance_summary: {
    late_minutes_total: number;
    early_departure_minutes_total: number;
    absent_minutes_total: number;
    time_bank_minutes_total: number;
    approved_leave_minutes_total: number;
    unapproved_leave_minutes_total: number;
    approved_ot_minutes_total: number;
    approved_ot_offset_minutes_total: number;
    payable_ot_minutes_total: number;
    opening_time_bank_minutes_total: number;
    settled_time_bank_minutes_total: number;
    closing_time_bank_minutes_total: number;
    denied_ot_minutes_total: number;
    full_attendance_eligible: boolean;
  };
  leave_records: Array<{
    leave_date: string;
    submission_status: string;
    leave_minutes: number;
    employee_reason?: string | null;
    manager_note?: string | null;
  }>;
  overtime_decisions: Array<{
    attendance_date: string;
    attendance_shift?: string | null;
    approved_ot_minutes: number;
    denied_ot_minutes: number;
    status: string;
    decision_reason?: string | null;
  }>;
  components: Array<{
    label: string;
    amount: string;
    code: string;
    notes: string;
  }>;
  gross_before_rounding_amount: string;
  rounding_adjustment_amount: string;
  gross_payable_amount: string;
  rounding_note: string;
}

interface PolicyImpactPreviewRow {
  employee: number;
  employee_name: string;
  worker_id?: string | null;
  monthly_base_wage: number;
  attendance_bonus: number;
  deduction_amount: number;
  overtime_pay_amount: number;
  approved_ot_offset_minutes_total: number;
  payable_ot_minutes_total: number;
  opening_time_bank_minutes_total: number;
  time_bank_minutes_total: number;
  closing_time_bank_minutes_total: number;
  manual_adjustments_amount: number;
  project_bonus_amount: number;
  carry_forward_recovery_amount: number;
  gross_before_rounding_amount: number;
  rounding_adjustment_amount: number;
  gross_payable_amount: number;
}

interface PolicyImpactPreviewRecord {
  policy: PayrollPolicyRecord;
  rows: PolicyImpactPreviewRow[];
  totals: {
    headcount: number;
    gross_payable_amount: number;
    deduction_amount: number;
    overtime_pay_amount: number;
    attendance_bonus_amount: number;
  };
  missing_profiles: string[];
}

interface ProjectLaborPreviewRow {
  employee: number;
  employee_name: string;
  worker_id?: string | null;
  reserved_hours: number;
  day_equivalent: number;
  labor_cost_amount: number;
  projected_bonus_amount: number;
}

interface ProjectLaborPreviewRecord {
  labor_pool_amount: number;
  total_actual_labor_cost_spend: number;
  remaining_bonus_pool: number;
  rows: ProjectLaborPreviewRow[];
}

interface TallyEditorState {
  employee: number;
  workDate: string;
  quantityUnit: QuantityUnit;
  quantityValue: string;
  notes: string;
}

interface PolicyFormState {
  id: number | null;
  policyCode: string;
  name: string;
  versionNumber: string;
  effectiveFrom: string;
  effectiveTo: string;
  riceAllowanceAmount: string;
  socialSecurityAllowanceAmount: string;
  fullAttendanceBonusAmount: string;
  laborPoolPercent: string;
  normalWorkHoursPerDay: string;
  salaryDaysPerMonth: string;
  overtimeMultiplier: string;
  overtimeGraceMinutes: string;
  lateGraceMinutes: string;
  roundingUnitAmount: string;
  unapprovedAbsenceIncidentThreshold: string;
  status: PolicyStatus;
  currency: string;
  isActive: boolean;
}

interface CompensationFormState {
  id: number | null;
  employee: string;
  monthlySalary: string;
  riceAllowanceAmount: string;
  socialSecurityAllowanceAmount: string;
  eligibleForSocialSecurity: boolean;
  payrollPolicy: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface AttendanceWorkRuleFormState {
  id: number | null;
  employee: string;
  workRule: AttendanceWorkRule;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

interface AdjustmentFormState {
  id: number | null;
  employee: string;
  year: string;
  month: string;
  adjustmentType: string;
  amount: string;
  notes: string;
  repeatUntil: string;
}

interface ProjectFormState {
  name: string;
  projectCode: string;
  revenueAmount: string;
  laborPoolPercent: string;
  status: ProjectStatus;
  startDate: string;
  completedDate: string;
  managementNote: string;
}

interface AssignmentFormState {
  employee: string;
  role: string;
  startDate: string;
  endDate: string;
  shareWeight: string;
}

interface RunFormState {
  runType: PayrollRunType;
  policyId: string;
  sourceRunId: string;
  notes: string;
}

interface ReportFormState {
  reportType: 'workforce_management' | 'employee';
  employeeId: string;
}

/** Builds the iso date used by this module. */
const buildIsoDate = (year: number, month: number, day: number) => (
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

/** Returns the today iso date for the current input. */
const getTodayIsoDate = () => {
  const now = new Date();
  return buildIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

/** Helper used by this module to manage shift iso date. */
const shiftIsoDate = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split('-').map((segment) => Number(segment));
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + days);
  return buildIsoDate(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
};

/** Creates the policy form used by this module. */
const createPolicyForm = (year: number, month: number): PolicyFormState => ({
  id: null,
  policyCode: 'PAYROLL',
  name: `Payroll policy ${year}-${String(month).padStart(2, '0')}`,
  versionNumber: '1',
  effectiveFrom: buildIsoDate(year, month, 1),
  effectiveTo: '',
  riceAllowanceAmount: '0',
  socialSecurityAllowanceAmount: '0',
  fullAttendanceBonusAmount: '0',
  laborPoolPercent: '0.10',
  normalWorkHoursPerDay: '8',
  salaryDaysPerMonth: '30',
  overtimeMultiplier: '2',
  overtimeGraceMinutes: '0',
  lateGraceMinutes: '0',
  roundingUnitAmount: '1000',
  unapprovedAbsenceIncidentThreshold: '2',
  status: 'draft',
  currency: 'LAK',
  isActive: false,
});

/** Creates the compensation form used by this module. */
const createCompensationForm = (year: number, month: number): CompensationFormState => ({
  id: null,
  employee: '',
  monthlySalary: '',
  riceAllowanceAmount: '',
  socialSecurityAllowanceAmount: '',
  eligibleForSocialSecurity: true,
  payrollPolicy: '',
  effectiveFrom: buildIsoDate(year, month, 1),
  effectiveTo: '',
});

/** Creates the attendance work rule form used by this module. */
const createAttendanceWorkRuleForm = (year: number, month: number): AttendanceWorkRuleFormState => ({
  id: null,
  employee: '',
  workRule: 'standard',
  effectiveFrom: buildIsoDate(year, month, 1),
  effectiveTo: '',
  notes: '',
});

/** Creates the adjustment form used by this module. */
const createAdjustmentForm = (year: number, month: number): AdjustmentFormState => ({
  id: null,
  employee: '',
  year: String(year),
  month: String(month),
  adjustmentType: 'manual_bonus',
  amount: '',
  notes: '',
  repeatUntil: '',
});

/** Creates the project form used by this module. */
const createProjectForm = (year: number, month: number): ProjectFormState => ({
  name: '',
  projectCode: '',
  revenueAmount: '',
  laborPoolPercent: '0.10',
  status: 'planned',
  startDate: buildIsoDate(year, month, 1),
  completedDate: '',
  managementNote: '',
});

/** Creates the assignment form used by this module. */
const createAssignmentForm = (year: number, month: number): AssignmentFormState => ({
  employee: '',
  role: '',
  startDate: buildIsoDate(year, month, 1),
  endDate: '',
  shareWeight: '',
});

/** Creates the run form used by this module. */
const createRunForm = (): RunFormState => ({
  runType: 'normal',
  policyId: '',
  sourceRunId: '',
  notes: '',
});

/** Creates the report form used by this module. */
const createReportForm = (): ReportFormState => ({
  reportType: 'workforce_management',
  employeeId: '',
});

/** Formats the money into display-ready text. */
const formatMoney = (value: string | number | null | undefined) => {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    return '0 LAK';
  }

  return `${numericValue.toLocaleString('en-US', {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} LAK`;
};

/** Formats the minutes into display-ready text. */
const formatMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0m';
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) {
    return `${hours}h ${remainder}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainder}m`;
};

/** Formats the month year into display-ready text. */
const formatMonthYear = (year: number, month: number) => {
  const monthLabel = MONTH_OPTIONS.find((option) => option.value === month)?.label || String(month);
  return `${monthLabel} ${year}`;
};

/** Returns the days in payroll month for the current input. */
const getDaysInPayrollMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Formats the month token into display-ready text. */
const formatMonthToken = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Helper used by this module to manage date matches month. */
const dateMatchesMonth = (value: string, year: number, month: number) => value.startsWith(`${formatMonthToken(year, month)}-`);

/** Returns whether the adjustment should reduce payroll. */
const adjustmentTypeBehavesAsDeduction = (adjustmentType: string) => (
  adjustmentType === 'advance' || adjustmentType === 'manual_deduction'
);

/** Formats the adjustment type label into display-ready text. */
const formatAdjustmentTypeLabel = (adjustmentType: string) => {
  return ADJUSTMENT_TYPE_OPTIONS.find((option) => option.value === adjustmentType)?.label
    || adjustmentType.replaceAll('_', ' ');
};

/** Builds the recurring adjustment periods used by this module. */
const buildRecurringAdjustmentPeriods = (startYear: number, startMonth: number, repeatUntil: string) => {
  const periods = [{ year: startYear, month: startMonth }];
  if (!repeatUntil) {
    return periods;
  }

  const [endYearText, endMonthText] = repeatUntil.split('-');
  const endYear = Number(endYearText);
  const endMonth = Number(endMonthText);
  if (!Number.isInteger(endYear) || !Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12) {
    throw new Error('Repeat-until date must be a valid calendar month.');
  }
  if (endYear < startYear || (endYear === startYear && endMonth < startMonth)) {
    throw new Error('Repeat-until date must be in the selected payroll month or later.');
  }

  let nextYear = startYear;
  let nextMonth = startMonth;
  while (nextYear < endYear || (nextYear === endYear && nextMonth < endMonth)) {
    nextMonth += 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    periods.push({ year: nextYear, month: nextMonth });
  }

  return periods;
};

/** Returns the compensation profile timing for the current input. */
const getCompensationProfileTiming = (
  profile: CompensationProfileRecord,
  year: number,
  month: number,
): { tone: CompensationProfileTiming; label: string } => {
  const monthStart = buildIsoDate(year, month, 1);
  const monthEnd = buildIsoDate(year, month, getDaysInPayrollMonth(year, month));

  if (profile.effective_from > monthEnd) {
    return { tone: 'future', label: 'Starts later' };
  }

  if (profile.effective_to && profile.effective_to < monthStart) {
    return { tone: 'ended', label: 'Ended earlier' };
  }

  return { tone: 'selected-month', label: 'Applies in selected month' };
};

/** Returns the attendance work rule timing for the current input. */
const getAttendanceWorkRuleTiming = (
  profile: AttendanceWorkRuleProfileRecord,
  year: number,
  month: number,
): { tone: CompensationProfileTiming; label: string } => {
  const monthStart = buildIsoDate(year, month, 1);
  const monthEnd = buildIsoDate(year, month, getDaysInPayrollMonth(year, month));

  if (profile.effective_from > monthEnd) {
    return { tone: 'future', label: 'Starts later' };
  }

  if (profile.effective_to && profile.effective_to < monthStart) {
    return { tone: 'ended', label: 'Ended earlier' };
  }

  return { tone: 'selected-month', label: 'Applies in selected month' };
};

/** Formats the attendance work rule label into display-ready text. */
const formatAttendanceWorkRuleLabel = (workRule: AttendanceWorkRule) => {
  if (workRule === 'driver_time_bank') {
    return 'Driver time bank';
  }
  return 'Standard';
};

/** Helper used by this module to manage to number. */
const toNumber = (value: string | number | null | undefined) => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

/** Rounds the to unit to the precision used by this module. */
const roundToUnit = (value: number, unit: number) => {
  if (!Number.isFinite(unit) || unit <= 0) {
    return value;
  }
  return Math.round(value / unit) * unit;
};

/** Formats the signed money into display-ready text. */
const formatSignedMoney = (value: string | number | null | undefined) => {
  const numericValue = toNumber(value);
  const tone = numericValue >= 0 ? '+' : '-';
  return `${tone}${formatMoney(Math.abs(numericValue))}`;
};

/** Builds the project cell key used by this module. */
const buildProjectCellKey = (employeeId: number, workDate: string) => `${employeeId}:${workDate}`;

/** Formats the work log chip into display-ready text. */
const formatWorkLogChip = (log: WorkLogRecord) => {
  if (log.quantity_unit === 'day') {
    return `${log.quantity_value}d`;
  }
  if (log.quantity_unit === 'half_day') {
    return `${toNumber(log.quantity_value) * 0.5}d`;
  }
  return `${log.quantity_value}h`;
};

/** Normalizes the report url into the shape expected by this module. */
const normalizeReportUrl = (url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `http://localhost:8000${url.startsWith('/') ? url : `/${url}`}`;
};

/** Helper used by this module to manage status tone class. */
const statusToneClass = (status: string) => {
  switch (status) {
    case 'active':
    case 'approved':
    case 'settled':
    case 'locked':
      return 'salary-studio-badge-positive';
    case 'archived':
    case 'rejected':
    case 'employee_owes_employer':
      return 'salary-studio-badge-danger';
    case 'pending':
    case 'draft':
    case 'planned':
      return 'salary-studio-badge-muted';
    default:
      return 'salary-studio-badge-accent';
  }
};

/** Extracts the api error message from a larger response or payload. */
const extractApiErrorMessage = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const firstMessage = value.map(extractApiErrorMessage).find(Boolean);
    return firstMessage || null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.error === 'string') {
      return record.error;
    }
    if (record.error) {
      return extractApiErrorMessage(record.error);
    }
    if (typeof record.detail === 'string') {
      return record.detail;
    }
    const nestedMessage = Object.values(record).map(extractApiErrorMessage).find(Boolean);
    return nestedMessage || null;
  }
  return null;
};

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const responseText = await response.text();
  let parsedBody: unknown = null;
  if (responseText) {
    try {
      parsedBody = JSON.parse(responseText);
    } catch {
      parsedBody = responseText;
    }
  }

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(parsedBody) || `Request failed with status ${response.status}.`);
  }

  return parsedBody as T;
}

async function safeRequest<T>(input: string): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await requestJson<T>(input), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown request failure.',
    };
  }
}

/** Renders the metric card component used by this module. */
function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'accent' | 'positive' }) {
  return (
    <article className={`salary-studio-metric salary-studio-metric-${tone}`}>
      <div className="salary-studio-metric-label">{label}</div>
      <div className="salary-studio-metric-value">{value}</div>
    </article>
  );
}

/** Renders the section title component used by this module. */
function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="salary-studio-section-heading">
      <div className="salary-studio-eyebrow">{eyebrow}</div>
      <h2 className={`salary-studio-section-title ${displayFont.className}`}>{title}</h2>
      <p className="salary-studio-section-copy">{copy}</p>
    </div>
  );
}

/** Renders the workspace view button component used by this module. */
function WorkspaceViewButton({
  label,
  isActive,
  helper,
  onClick,
}: {
  label: string;
  isActive: boolean;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`salary-studio-view-button ${isActive ? 'salary-studio-view-button-active' : ''}`}
      type="button"
      onClick={onClick}
    >
      <strong>{label}</strong>
      <span>{helper}</span>
    </button>
  );
}

/** Renders the salary trend chart component used by this module. */
function SalaryTrendChart({ records }: { records: PayrollMonthlyTrendRecord[] }) {
  if (records.length === 0) {
    return <div className="salary-studio-empty-state">Lock payroll runs to build a multi-month workforce trend.</div>;
  }

  const orderedRecords = [...records].sort((left, right) => (
    left.year === right.year ? left.month - right.month : left.year - right.year
  ));
  const maxGross = Math.max(...orderedRecords.map((record) => toNumber(record.total_gross_payable_amount)), 1);

  return (
    <div className="salary-studio-trend-chart" role="img" aria-label="Workforce cost trend chart">
      {orderedRecords.map((record) => {
        const grossValue = toNumber(record.total_gross_payable_amount);
        const barHeight = Math.max((grossValue / maxGross) * 100, 8);
        return (
          <div key={`${record.year}-${record.month}`} className="salary-studio-trend-column">
            <div className="salary-studio-trend-bar-shell">
              <div className="salary-studio-trend-bar" style={{ height: `${barHeight}%` }} />
            </div>
            <div className="salary-studio-trend-value">{formatMoney(grossValue)}</div>
            <div className="salary-studio-trend-label">{formatMonthYear(record.year, record.month)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders the salary studio component used by this module. */
export default function SalaryStudio() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const { showErrorPopup } = useErrorPopup();

  const [activeView, setActiveView] = useState<SalaryStudioView>('attendance');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [policies, setPolicies] = useState<PayrollPolicyRecord[]>([]);
  const [currentPolicy, setCurrentPolicy] = useState<PayrollPolicyRecord | null>(null);
  const [compensationProfiles, setCompensationProfiles] = useState<CompensationProfileRecord[]>([]);
  const [attendanceWorkRuleProfiles, setAttendanceWorkRuleProfiles] = useState<AttendanceWorkRuleProfileRecord[]>([]);
  const [attendanceSummaries, setAttendanceSummaries] = useState<AttendanceSummaryRecord[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectWorkLogs, setProjectWorkLogs] = useState<WorkLogRecord[]>([]);
  const [runs, setRuns] = useState<PayrollRunBriefRecord[]>([]);
  const [selectedRunDetail, setSelectedRunDetail] = useState<PayrollRunDetailRecord | null>(null);
  const [monthlySummaries, setMonthlySummaries] = useState<PayrollMonthlyTrendRecord[]>([]);
  const [workforceReportPreview, setWorkforceReportPreview] = useState<WorkforceReportPreviewRecord | null>(null);
  const [employeeReportPreview, setEmployeeReportPreview] = useState<EmployeeReportPreviewRecord | null>(null);
  const [policyPreviewTargetId, setPolicyPreviewTargetId] = useState<number | null>(null);
  const [tallyEditor, setTallyEditor] = useState<TallyEditorState | null>(null);
  const [carryForwardBalances, setCarryForwardBalances] = useState<CarryForwardBalanceRecord[]>([]);
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(createPolicyForm(currentYear, currentMonth));
  const [compensationForm, setCompensationForm] = useState<CompensationFormState>(createCompensationForm(currentYear, currentMonth));
  const [compensationFormMode, setCompensationFormMode] = useState<CompensationFormMode>('create');
  const [attendanceWorkRuleForm, setAttendanceWorkRuleForm] = useState<AttendanceWorkRuleFormState>(createAttendanceWorkRuleForm(currentYear, currentMonth));
  const [attendanceWorkRuleFormMode, setAttendanceWorkRuleFormMode] = useState<AttendanceWorkRuleFormMode>('create');
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(createAdjustmentForm(currentYear, currentMonth));
  const [projectForm, setProjectForm] = useState<ProjectFormState>(createProjectForm(currentYear, currentMonth));
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(createAssignmentForm(currentYear, currentMonth));
  const [runForm, setRunForm] = useState<RunFormState>(createRunForm());
  const [reportForm, setReportForm] = useState<ReportFormState>(createReportForm());
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadIssues, setLoadIssues] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const requestedView = new URLSearchParams(window.location.search).get('view');
    if (requestedView && SALARY_VIEW_OPTIONS.some((viewOption) => viewOption.value === requestedView)) {
      setActiveView(requestedView as SalaryStudioView);
    }
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [activeProjectId, projects],
  );

  const employeeOptions = useMemo(
    () => employees.filter((employee) => employee.is_active !== false),
    [employees],
  );

  const selectedRunEmployees = useMemo(() => selectedRunDetail?.employees || [], [selectedRunDetail]);
  const selectedRunSummary = useMemo(() => selectedRunDetail?.monthly_summary || null, [selectedRunDetail]);
  const selectedMonthDays = useMemo(
    () => Array.from({ length: getDaysInPayrollMonth(selectedYear, selectedMonth) }, (_, index) => index + 1),
    [selectedMonth, selectedYear],
  );

  const approvedAdjustmentsByEmployee = useMemo(() => {
    const totals = new Map<number, number>();
    adjustments
      .filter((adjustment) => adjustment.approval_status === 'approved')
      .forEach((adjustment) => {
        totals.set(adjustment.employee, (totals.get(adjustment.employee) || 0) + toNumber(adjustment.amount));
      });
    return totals;
  }, [adjustments]);

  const projectSettlementsByEmployee = useMemo(() => {
    const totals = new Map<number, number>();
    projects.forEach((project) => {
      project.settlements
        .filter((settlement) => settlement.settled_to_year === selectedYear && settlement.settled_to_month === selectedMonth)
        .forEach((settlement) => {
          totals.set(settlement.employee, (totals.get(settlement.employee) || 0) + toNumber(settlement.bonus_share_amount));
        });
    });
    return totals;
  }, [projects, selectedMonth, selectedYear]);

  const carryForwardRecoveryByEmployee = useMemo(() => {
    const totals = new Map<number, number>();
    carryForwardBalances
      .filter((balance) => balance.status !== 'closed')
      .filter((balance) => (
        balance.apply_from_year < selectedYear
        || (balance.apply_from_year === selectedYear && balance.apply_from_month <= selectedMonth)
      ))
      .forEach((balance) => {
        totals.set(balance.employee, (totals.get(balance.employee) || 0) + toNumber(balance.remaining_amount));
      });
    return totals;
  }, [carryForwardBalances, selectedMonth, selectedYear]);

  const openingTimeBankByEmployee = useMemo(() => {
    return new Map<number, number>();
  }, []);

  const policyPreviewTarget = useMemo(
    () => policies.find((policy) => policy.id === policyPreviewTargetId) || currentPolicy || null,
    [currentPolicy, policies, policyPreviewTargetId],
  );

  const policyImpactPreview = useMemo<PolicyImpactPreviewRecord | null>(() => {
    if (!policyPreviewTarget) {
      return null;
    }

    const missingProfiles: string[] = [];
    const rows: PolicyImpactPreviewRow[] = [];
    attendanceSummaries.forEach((summary) => {
      const profile = compensationProfiles.find((candidate) => candidate.employee === summary.employee);
      if (!profile) {
        missingProfiles.push(summary.employee_name || `Employee ${summary.employee}`);
        return;
      }

      const riceAllowance = profile.rice_allowance_amount === null
        ? toNumber(policyPreviewTarget.rice_allowance_amount)
        : toNumber(profile.rice_allowance_amount);
      const socialSecurityAllowance = profile.eligible_for_social_security
        ? (profile.social_security_allowance_amount === null
          ? toNumber(policyPreviewTarget.social_security_allowance_amount)
          : toNumber(profile.social_security_allowance_amount))
        : 0;
      const monthlyBaseWage = toNumber(profile.monthly_salary) + riceAllowance + socialSecurityAllowance;
      const dailySalaryRate = monthlyBaseWage / Math.max(toNumber(policyPreviewTarget.salary_days_per_month), 1);
      const hourlyWage = dailySalaryRate / Math.max(toNumber(policyPreviewTarget.normal_work_hours_per_day), 1);
      const approvedOtOffsetMinutes = Math.min(
        summary.approved_ot_minutes_total,
        summary.late_minutes_total + summary.absent_minutes_total,
      );
      const remainingOtMinutes = summary.approved_ot_minutes_total - approvedOtOffsetMinutes;
      const openingTimeBankMinutes = openingTimeBankByEmployee.get(summary.employee) || 0;
      const settledTimeBankMinutes = Math.min(
        remainingOtMinutes,
        openingTimeBankMinutes + summary.time_bank_minutes_total,
      );
      const payableOtMinutes = remainingOtMinutes - settledTimeBankMinutes;
      const deductibleHours = (
        summary.late_minutes_total
        + summary.absent_minutes_total
        - approvedOtOffsetMinutes
        + summary.approved_leave_minutes_total
        + summary.unapproved_leave_minutes_total
      ) / 60;
      const deductionAmount = deductibleHours * hourlyWage;
      const overtimePayAmount = (payableOtMinutes / 60) * hourlyWage * Math.max(toNumber(policyPreviewTarget.overtime_multiplier), 1);
      const attendanceBonus = summary.full_attendance_eligible ? toNumber(policyPreviewTarget.full_attendance_bonus_amount) : 0;
      const manualAdjustmentsAmount = approvedAdjustmentsByEmployee.get(summary.employee) || 0;
      const projectBonusAmount = projectSettlementsByEmployee.get(summary.employee) || 0;
      const carryForwardRecoveryAmount = carryForwardRecoveryByEmployee.get(summary.employee) || 0;
      const grossBeforeRoundingAmount = monthlyBaseWage + attendanceBonus + overtimePayAmount - deductionAmount + manualAdjustmentsAmount + projectBonusAmount - carryForwardRecoveryAmount;
      const grossPayableAmount = roundToUnit(grossBeforeRoundingAmount, toNumber(policyPreviewTarget.rounding_unit_amount));
      const roundingAdjustmentAmount = grossPayableAmount - grossBeforeRoundingAmount;

      rows.push({
        employee: summary.employee,
        employee_name: summary.employee_name || 'Employee',
        worker_id: summary.worker_id,
        monthly_base_wage: monthlyBaseWage,
        attendance_bonus: attendanceBonus,
        deduction_amount: deductionAmount,
        overtime_pay_amount: overtimePayAmount,
        approved_ot_offset_minutes_total: approvedOtOffsetMinutes,
        payable_ot_minutes_total: payableOtMinutes,
        opening_time_bank_minutes_total: openingTimeBankMinutes,
        time_bank_minutes_total: summary.time_bank_minutes_total,
        closing_time_bank_minutes_total: openingTimeBankMinutes + summary.time_bank_minutes_total - settledTimeBankMinutes,
        manual_adjustments_amount: manualAdjustmentsAmount,
        project_bonus_amount: projectBonusAmount,
        carry_forward_recovery_amount: carryForwardRecoveryAmount,
        gross_before_rounding_amount: grossBeforeRoundingAmount,
        rounding_adjustment_amount: roundingAdjustmentAmount,
        gross_payable_amount: grossPayableAmount,
      });
    });

    return {
      policy: policyPreviewTarget,
      rows,
      totals: {
        headcount: rows.length,
        gross_payable_amount: rows.reduce((sum, row) => sum + row.gross_payable_amount, 0),
        deduction_amount: rows.reduce((sum, row) => sum + row.deduction_amount, 0),
        overtime_pay_amount: rows.reduce((sum, row) => sum + row.overtime_pay_amount, 0),
        attendance_bonus_amount: rows.reduce((sum, row) => sum + row.attendance_bonus, 0),
      },
      missing_profiles: missingProfiles,
    };
  }, [attendanceSummaries, approvedAdjustmentsByEmployee, carryForwardRecoveryByEmployee, compensationProfiles, openingTimeBankByEmployee, policyPreviewTarget, projectSettlementsByEmployee]);

  const activeProjectMonthLogs = useMemo(
    () => projectWorkLogs.filter((log) => dateMatchesMonth(log.work_date, selectedYear, selectedMonth)),
    [projectWorkLogs, selectedMonth, selectedYear],
  );

  const activeProjectLogMap = useMemo(() => {
    const recordMap = new Map<string, WorkLogRecord[]>();
    activeProjectMonthLogs.forEach((log) => {
      const key = buildProjectCellKey(log.employee, log.work_date);
      const existing = recordMap.get(key) || [];
      existing.push(log);
      recordMap.set(key, existing);
    });
    return recordMap;
  }, [activeProjectMonthLogs]);

  const activeProjectPreview = useMemo<ProjectLaborPreviewRecord | null>(() => {
    if (!activeProject || !currentPolicy) {
      return null;
    }

    const normalWorkHours = Math.max(toNumber(currentPolicy.normal_work_hours_per_day), 1);
    const salaryDaysPerMonth = Math.max(toNumber(currentPolicy.salary_days_per_month), 1);
    const laborPoolAmount = toNumber(activeProject.revenue_amount) * toNumber(activeProject.labor_pool_percent || currentPolicy.labor_pool_percent);

    const rows = activeProject.assignments.map((assignment) => {
      const employeeLogs = activeProjectMonthLogs.filter((log) => log.employee === assignment.employee);
      const profile = compensationProfiles.find((candidate) => candidate.employee === assignment.employee);
      const riceAllowance = profile?.rice_allowance_amount === null || profile?.rice_allowance_amount === undefined
        ? toNumber(currentPolicy.rice_allowance_amount)
        : toNumber(profile.rice_allowance_amount);
      const socialSecurityAllowance = profile?.eligible_for_social_security === false
        ? 0
        : (profile?.social_security_allowance_amount === null || profile?.social_security_allowance_amount === undefined
          ? toNumber(currentPolicy.social_security_allowance_amount)
          : toNumber(profile.social_security_allowance_amount));
      const monthlyBaseWage = toNumber(profile?.monthly_salary) + riceAllowance + socialSecurityAllowance;
      const dailySalaryRate = monthlyBaseWage / salaryDaysPerMonth;
      const reservedHours = employeeLogs.reduce((sum, log) => {
        if (log.quantity_unit === 'day') {
          return sum + (toNumber(log.quantity_value) * normalWorkHours);
        }
        if (log.quantity_unit === 'half_day') {
          return sum + (toNumber(log.quantity_value) * (normalWorkHours / 2));
        }
        return sum + toNumber(log.quantity_value);
      }, 0);
      const dayEquivalent = reservedHours / normalWorkHours;
      const laborCostAmount = dailySalaryRate * dayEquivalent;

      return {
        employee: assignment.employee,
        employee_name: assignment.employee_name || 'Employee',
        worker_id: assignment.worker_id,
        reserved_hours: reservedHours,
        day_equivalent: dayEquivalent,
        labor_cost_amount: laborCostAmount,
        projected_bonus_amount: 0,
      } satisfies ProjectLaborPreviewRow;
    });

    const totalActualLaborCostSpend = rows.reduce((sum, row) => sum + row.labor_cost_amount, 0);
    const remainingBonusPool = Math.max(laborPoolAmount - totalActualLaborCostSpend, 0);

    return {
      labor_pool_amount: laborPoolAmount,
      total_actual_labor_cost_spend: totalActualLaborCostSpend,
      remaining_bonus_pool: remainingBonusPool,
      rows: rows.map((row) => ({
        ...row,
        projected_bonus_amount: totalActualLaborCostSpend > 0
          ? remainingBonusPool * (row.labor_cost_amount / totalActualLaborCostSpend)
          : 0,
      })),
    };
  }, [activeProject, activeProjectMonthLogs, compensationProfiles, currentPolicy]);

  const previewEmployeeId = useMemo(() => {
    const requestedId = Number(reportForm.employeeId || 0);
    if (requestedId > 0 && selectedRunEmployees.some((employeeRun) => employeeRun.employee === requestedId)) {
      return requestedId;
    }
    return selectedRunEmployees[0]?.employee || null;
  }, [reportForm.employeeId, selectedRunEmployees]);

  const refreshStudio = useCallback(async () => {
    setIsLoading(true);
    const year = selectedYear;
    const month = selectedMonth;

    const [
      employeesResult,
      policiesResult,
      currentPolicyResult,
      profilesResult,
      workRuleProfilesResult,
      summariesResult,
      adjustmentsResult,
      projectsResult,
      runsResult,
      monthlySummariesResult,
      carryForwardResult,
    ] = await Promise.all([
      safeRequest<EmployeeOption[]>(EMPLOYEES_API_BASE),
      safeRequest<RecordsEnvelope<PayrollPolicyRecord>>(`${PAYROLL_API_BASE}/policies/`),
      safeRequest<PayrollPolicyRecord>(`${PAYROLL_API_BASE}/policies/active/?year=${year}&month=${month}`),
      safeRequest<RecordsEnvelope<CompensationProfileRecord>>(
        `${PAYROLL_API_BASE}/compensation-profiles/`,
      ),
      safeRequest<RecordsEnvelope<AttendanceWorkRuleProfileRecord>>(
        `${PAYROLL_API_BASE}/attendance-work-rule-profiles/`,
      ),
      safeRequest<RecordsEnvelope<AttendanceSummaryRecord>>(
        `${PAYROLL_API_BASE}/attendance-summaries/?year=${year}&month=${month}`,
      ),
      safeRequest<RecordsEnvelope<AdjustmentRecord>>(`${PAYROLL_API_BASE}/adjustments/?year=${year}&month=${month}`),
      safeRequest<RecordsEnvelope<ProjectRecord>>(`${PAYROLL_API_BASE}/projects/`),
      safeRequest<RecordsEnvelope<PayrollRunBriefRecord>>(`${PAYROLL_API_BASE}/runs/?year=${year}&month=${month}`),
      safeRequest<RecordsEnvelope<PayrollMonthlyTrendRecord>>(`${PAYROLL_API_BASE}/monthly-summaries/?months=12`),
      safeRequest<RecordsEnvelope<CarryForwardBalanceRecord>>(`${PAYROLL_API_BASE}/carry-forward-balances/?status=open`),
    ]);

    const issues = [
      currentPolicyResult.error,
      summariesResult.error,
      carryForwardResult.error,
    ].filter((issue): issue is string => Boolean(issue));

    startTransition(() => {
      setEmployees(employeesResult.data || []);
      setPolicies(policiesResult.data?.records || []);
      setCurrentPolicy(currentPolicyResult.data || null);
      setCompensationProfiles(profilesResult.data?.records || []);
      setAttendanceWorkRuleProfiles(workRuleProfilesResult.data?.records || []);
      setAttendanceSummaries(summariesResult.data?.records || []);
      setAdjustments(adjustmentsResult.data?.records || []);
      setProjects(projectsResult.data?.records || []);
      setRuns(runsResult.data?.records || []);
      setMonthlySummaries(monthlySummariesResult.data?.records || []);
      setCarryForwardBalances(carryForwardResult.data?.records || []);
      setLoadIssues(issues);
    });

    setIsLoading(false);
  }, [selectedMonth, selectedYear]);

  const loadRunDetail = useCallback(async (runId: number) => {
    const result = await safeRequest<PayrollRunDetailRecord>(`${PAYROLL_API_BASE}/runs/${runId}/`);
    if (result.error) {
      setSelectedRunDetail(null);
      showErrorPopup(result.error);
      return;
    }
    setSelectedRunDetail(result.data);
  }, [showErrorPopup]);

  const loadProjectWorkLogs = useCallback(async (projectId: number) => {
    const result = await safeRequest<RecordsEnvelope<WorkLogRecord>>(`${PAYROLL_API_BASE}/projects/${projectId}/work-logs/`);
    if (result.error) {
      setProjectWorkLogs([]);
      showErrorPopup(result.error);
      return;
    }
    setProjectWorkLogs(result.data?.records || []);
  }, [showErrorPopup]);

  const loadWorkforceReportPreview = useCallback(async (runId: number) => {
    const result = await safeRequest<WorkforceReportPreviewRecord>(`${PAYROLL_API_BASE}/reports/workforce/?run_id=${runId}`);
    if (result.error) {
      setWorkforceReportPreview(null);
      showErrorPopup(result.error);
      return;
    }
    setWorkforceReportPreview(result.data);
  }, [showErrorPopup]);

  const loadEmployeeReportPreview = useCallback(async (runId: number, employeeId: number) => {
    const result = await safeRequest<EmployeeReportPreviewRecord>(
      `${PAYROLL_API_BASE}/reports/employee/?run_id=${runId}&employee=${employeeId}`,
    );
    if (result.error) {
      setEmployeeReportPreview(null);
      showErrorPopup(result.error);
      return;
    }
    setEmployeeReportPreview(result.data);
  }, [showErrorPopup]);

  useEffect(() => {
    void refreshStudio();
  }, [refreshStudio]);

  useEffect(() => {
    setPolicyForm((previous) => {
      if (previous.id !== null) {
        return previous;
      }
      return {
        ...previous,
        effectiveFrom: buildIsoDate(selectedYear, selectedMonth, 1),
        name: `Payroll policy ${selectedYear}-${String(selectedMonth).padStart(2, '0')}`,
      };
    });
    setCompensationForm((previous) => (
      previous.id !== null
        ? previous
        : { ...previous, effectiveFrom: buildIsoDate(selectedYear, selectedMonth, 1) }
    ));
    setAttendanceWorkRuleForm((previous) => (
      previous.id !== null
        ? previous
        : { ...previous, effectiveFrom: buildIsoDate(selectedYear, selectedMonth, 1) }
    ));
    setAdjustmentForm((previous) => ({ ...previous, year: String(selectedYear), month: String(selectedMonth) }));
    setProjectForm((previous) => ({ ...previous, startDate: previous.startDate || buildIsoDate(selectedYear, selectedMonth, 1) }));
    setAssignmentForm((previous) => ({ ...previous, startDate: previous.startDate || buildIsoDate(selectedYear, selectedMonth, 1) }));
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (projects.length === 0) {
      setActiveProjectId(null);
      setProjectWorkLogs([]);
      return;
    }
    if (activeProjectId === null || !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(projects[0].id);
    }
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (activeProjectId !== null) {
      void loadProjectWorkLogs(activeProjectId);
    }
  }, [activeProjectId, loadProjectWorkLogs]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(null);
      setSelectedRunDetail(null);
      return;
    }
    if (selectedRunId === null || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (selectedRunId !== null) {
      void loadRunDetail(selectedRunId);
    }
  }, [selectedRunId, loadRunDetail]);

  useEffect(() => {
    if (policyPreviewTargetId === null && currentPolicy) {
      setPolicyPreviewTargetId(currentPolicy.id);
      return;
    }
    if (policyPreviewTargetId !== null && !policies.some((policy) => policy.id === policyPreviewTargetId)) {
      setPolicyPreviewTargetId(currentPolicy?.id || null);
    }
  }, [currentPolicy, policies, policyPreviewTargetId]);

  useEffect(() => {
    if (selectedRunEmployees.length === 0) {
      setReportForm((previous) => ({ ...previous, employeeId: '' }));
      return;
    }
    if (reportForm.employeeId && selectedRunEmployees.some((employeeRun) => String(employeeRun.employee) === reportForm.employeeId)) {
      return;
    }
    setReportForm((previous) => ({ ...previous, employeeId: String(selectedRunEmployees[0].employee) }));
  }, [reportForm.employeeId, selectedRunEmployees]);

  useEffect(() => {
    if (selectedRunId === null) {
      setWorkforceReportPreview(null);
      return;
    }
    void loadWorkforceReportPreview(selectedRunId);
  }, [loadWorkforceReportPreview, selectedRunId]);

  useEffect(() => {
    if (selectedRunId === null || previewEmployeeId === null) {
      setEmployeeReportPreview(null);
      return;
    }
    void loadEmployeeReportPreview(selectedRunId, previewEmployeeId);
  }, [loadEmployeeReportPreview, previewEmployeeId, selectedRunId]);

  /** Helper used by this module to manage perform action. */
  const performAction = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);
    setSuccessMessage(null);
    try {
      await action();
    } catch (error) {
      showErrorPopup(error instanceof Error ? error.message : 'Unexpected action failure.');
    } finally {
      setBusyLabel(null);
    }
  };

  /** Helper used by this module to manage reset policy editor. */
  const resetPolicyEditor = () => setPolicyForm(createPolicyForm(selectedYear, selectedMonth));
  /** Helper used by this module to manage reset compensation editor. */
  const resetCompensationEditor = () => {
    setCompensationFormMode('create');
    setCompensationForm(createCompensationForm(selectedYear, selectedMonth));
  };
  /** Helper used by this module to manage reset attendance work rule editor. */
  const resetAttendanceWorkRuleEditor = () => {
    setAttendanceWorkRuleFormMode('create');
    setAttendanceWorkRuleForm(createAttendanceWorkRuleForm(selectedYear, selectedMonth));
  };
  /** Helper used by this module to manage reset adjustment editor. */
  const resetAdjustmentEditor = () => setAdjustmentForm(createAdjustmentForm(selectedYear, selectedMonth));
  /** Helper used by this module to manage reset project editor. */
  const resetProjectEditor = () => setProjectForm(createProjectForm(selectedYear, selectedMonth));
  /** Helper used by this module to manage reset assignment editor. */
  const resetAssignmentEditor = () => setAssignmentForm(createAssignmentForm(selectedYear, selectedMonth));

  /** Helper used by this module to manage activate policy. */
  const activatePolicy = async (policyId: number) => {
    await requestJson(`${PAYROLL_API_BASE}/policies/${policyId}/activate/`, { method: 'POST' });
    await refreshStudio();
    setPolicyPreviewTargetId(policyId);
    setSuccessMessage('Payroll policy activated.');
  };

  /** Helper used by this module to manage archive policy. */
  const archivePolicy = async (policyId: number) => {
    await requestJson(`${PAYROLL_API_BASE}/policies/${policyId}/archive/`, { method: 'POST' });
    await refreshStudio();
    setSuccessMessage('Payroll policy archived.');
  };

  /** Clones the policy so later edits do not mutate the original value. */
  const clonePolicy = async (policyId: number) => {
    const clonedPolicy = await requestJson<PayrollPolicyRecord>(`${PAYROLL_API_BASE}/policies/${policyId}/clone/`, {
      method: 'POST',
      body: JSON.stringify({ effective_from: buildIsoDate(selectedYear, selectedMonth, 1) }),
    });
    await refreshStudio();
    setPolicyPreviewTargetId(clonedPolicy.id);
    editPolicy(clonedPolicy);
    setSuccessMessage('Payroll policy cloned into a new draft version.');
  };

  /** Helper used by this module to manage delete policy. */
  const deletePolicy = async (policyId: number) => {
    await requestJson(`${PAYROLL_API_BASE}/policies/${policyId}/`, { method: 'DELETE' });
    await refreshStudio();
    if (policyForm.id === policyId) {
      resetPolicyEditor();
    }
    setSuccessMessage('Unused draft policy deleted.');
  };

  /** Helper used by this module to manage save policy. */
  const savePolicy = async () => {
    const payload = {
      policy_code: policyForm.policyCode,
      name: policyForm.name,
      version_number: Number(policyForm.versionNumber || 1),
      effective_from: policyForm.effectiveFrom,
      effective_to: policyForm.effectiveTo || null,
      rice_allowance_amount: policyForm.riceAllowanceAmount || '0',
      social_security_allowance_amount: policyForm.socialSecurityAllowanceAmount || '0',
      full_attendance_bonus_amount: policyForm.fullAttendanceBonusAmount || '0',
      labor_pool_percent: policyForm.laborPoolPercent || '0.10',
      normal_work_hours_per_day: policyForm.normalWorkHoursPerDay || '8',
      salary_days_per_month: Number(policyForm.salaryDaysPerMonth || 30),
      overtime_multiplier: policyForm.overtimeMultiplier || '2',
      overtime_grace_minutes: Number(policyForm.overtimeGraceMinutes || 0),
      late_grace_minutes: policyForm.lateGraceMinutes ? Number(policyForm.lateGraceMinutes) : null,
      rounding_unit_amount: Number(policyForm.roundingUnitAmount || 1000),
      rounding_rule: 'nearest_thousand',
      unapproved_absence_incident_threshold: Number(policyForm.unapprovedAbsenceIncidentThreshold || 2),
      status: policyForm.status,
      currency: policyForm.currency || 'LAK',
      is_active: policyForm.isActive,
    };
    const endpoint = policyForm.id === null
      ? `${PAYROLL_API_BASE}/policies/`
      : `${PAYROLL_API_BASE}/policies/${policyForm.id}/`;
    const savedPolicy = await requestJson<PayrollPolicyRecord>(endpoint, {
      method: policyForm.id === null ? 'POST' : 'PATCH',
      body: JSON.stringify(payload),
    });
    await refreshStudio();
    setPolicyPreviewTargetId(savedPolicy.id);
    resetPolicyEditor();
    setSuccessMessage('Payroll policy saved.');
  };

  /** Helper used by this module to manage save compensation profile. */
  const saveCompensationProfile = async () => {
    const payload = {
      employee: Number(compensationForm.employee),
      monthly_salary: compensationForm.monthlySalary || '0',
      rice_allowance_amount: compensationForm.riceAllowanceAmount || null,
      social_security_allowance_amount: compensationForm.socialSecurityAllowanceAmount || null,
      eligible_for_social_security: compensationForm.eligibleForSocialSecurity,
      payroll_policy: compensationForm.payrollPolicy ? Number(compensationForm.payrollPolicy) : null,
      effective_from: compensationForm.effectiveFrom,
      effective_to: compensationForm.effectiveTo || null,
    };
    const endpoint = compensationForm.id === null
      ? `${PAYROLL_API_BASE}/compensation-profiles/`
      : `${PAYROLL_API_BASE}/compensation-profiles/${compensationForm.id}/`;
    await requestJson(endpoint, {
      method: compensationForm.id === null ? 'POST' : 'PATCH',
      body: JSON.stringify(payload),
    });
    await refreshStudio();
    resetCompensationEditor();
    if (compensationFormMode === 'terminate') {
      setSuccessMessage('Compensation profile end date saved.');
    } else if (compensationForm.id === null) {
      setSuccessMessage('Compensation profile saved.');
    } else {
      setSuccessMessage('Compensation profile updated.');
    }
  };

  /** Helper used by this module to manage save attendance work rule profile. */
  const saveAttendanceWorkRuleProfile = async () => {
    const payload = {
      employee: Number(attendanceWorkRuleForm.employee),
      work_rule: attendanceWorkRuleForm.workRule,
      effective_from: attendanceWorkRuleForm.effectiveFrom,
      effective_to: attendanceWorkRuleForm.effectiveTo || null,
      notes: attendanceWorkRuleForm.notes,
    };
    const endpoint = attendanceWorkRuleForm.id === null
      ? `${PAYROLL_API_BASE}/attendance-work-rule-profiles/`
      : `${PAYROLL_API_BASE}/attendance-work-rule-profiles/${attendanceWorkRuleForm.id}/`;
    await requestJson(endpoint, {
      method: attendanceWorkRuleForm.id === null ? 'POST' : 'PATCH',
      body: JSON.stringify(payload),
    });
    await refreshStudio();
    resetAttendanceWorkRuleEditor();
    if (attendanceWorkRuleFormMode === 'terminate') {
      setSuccessMessage('Attendance work-rule end date saved.');
    } else if (attendanceWorkRuleForm.id === null) {
      setSuccessMessage('Attendance work-rule profile saved.');
    } else {
      setSuccessMessage('Attendance work-rule profile updated.');
    }
  };

  /** Helper used by this module to manage save adjustment. */
  const saveAdjustment = async () => {
    const buildPayload = (year: number, month: number) => ({
      employee: Number(adjustmentForm.employee),
      year,
      month,
      adjustment_type: adjustmentForm.adjustmentType,
      amount: adjustmentForm.amount,
      notes: adjustmentForm.notes,
    });

    if (adjustmentForm.id !== null) {
      await requestJson(`${PAYROLL_API_BASE}/adjustments/${adjustmentForm.id}/`, {
        method: 'PATCH',
        body: JSON.stringify(buildPayload(Number(adjustmentForm.year), Number(adjustmentForm.month))),
      });
    } else {
      const recurringPeriods = buildRecurringAdjustmentPeriods(
        Number(adjustmentForm.year),
        Number(adjustmentForm.month),
        adjustmentForm.repeatUntil,
      );
      for (const period of recurringPeriods) {
        await requestJson(`${PAYROLL_API_BASE}/adjustments/`, {
          method: 'POST',
          body: JSON.stringify(buildPayload(period.year, period.month)),
        });
      }
    }

    await refreshStudio();
    resetAdjustmentEditor();
    if (adjustmentForm.id !== null) {
      setSuccessMessage('Payroll adjustment updated.');
      return;
    }

    if (adjustmentForm.repeatUntil) {
      const [endYearText, endMonthText] = adjustmentForm.repeatUntil.split('-');
      setSuccessMessage(`Payroll adjustments created through ${formatMonthYear(Number(endYearText), Number(endMonthText))}.`);
      return;
    }

    setSuccessMessage('Payroll adjustment created.');
  };

  /** Helper used by this module to manage approve adjustment. */
  const approveAdjustment = async (adjustmentId: number) => {
    await requestJson(`${PAYROLL_API_BASE}/adjustments/${adjustmentId}/approve/`, { method: 'POST' });
    await refreshStudio();
    setSuccessMessage('Payroll adjustment approved.');
  };

  /** Helper used by this module to manage edit adjustment. */
  const editAdjustment = (adjustment: AdjustmentRecord) => {
    const rawAmount = toNumber(adjustment.amount);
    setAdjustmentForm({
      id: adjustment.id,
      employee: String(adjustment.employee),
      year: String(adjustment.year),
      month: String(adjustment.month),
      adjustmentType: adjustment.adjustment_type,
      amount: adjustmentTypeBehavesAsDeduction(adjustment.adjustment_type) ? String(Math.abs(rawAmount)) : String(adjustment.amount),
      notes: adjustment.notes,
      repeatUntil: '',
    });
  };

  /** Helper used by this module to manage delete adjustment. */
  const deleteAdjustment = async (adjustmentId: number) => {
    await requestJson(`${PAYROLL_API_BASE}/adjustments/${adjustmentId}/`, { method: 'DELETE' });
    await refreshStudio();
    if (adjustmentForm.id === adjustmentId) {
      resetAdjustmentEditor();
    }
    setSuccessMessage('Payroll adjustment deleted.');
  };

  /** Helper used by this module to manage save project. */
  const saveProject = async () => {
    const project = await requestJson<ProjectRecord>(`${PAYROLL_API_BASE}/projects/`, {
      method: 'POST',
      body: JSON.stringify({
        name: projectForm.name,
        project_code: projectForm.projectCode,
        revenue_amount: projectForm.revenueAmount || '0',
        labor_pool_percent: projectForm.laborPoolPercent || '0.10',
        status: projectForm.status,
        start_date: projectForm.startDate,
        completed_date: projectForm.completedDate || null,
        management_note: projectForm.managementNote,
      }),
    });
    await refreshStudio();
    setActiveProjectId(project.id);
    resetProjectEditor();
    setSuccessMessage('Project created.');
  };

  /** Helper used by this module to manage save assignment. */
  const saveAssignment = async () => {
    if (activeProjectId === null) {
      throw new Error('Select a project before adding assignments.');
    }
    await requestJson(`${PAYROLL_API_BASE}/projects/${activeProjectId}/assignments/`, {
      method: 'POST',
      body: JSON.stringify({
        employee: Number(assignmentForm.employee),
        role: assignmentForm.role,
        start_date: assignmentForm.startDate || null,
        end_date: assignmentForm.endDate || null,
        share_weight: assignmentForm.shareWeight || null,
      }),
    });
    await refreshStudio();
    resetAssignmentEditor();
    setSuccessMessage('Project assignment added.');
  };

  /** Creates the project work log used by this module. */
  const createProjectWorkLog = async ({
    employee,
    workDate,
    quantityUnit,
    quantityValue,
    notes,
  }: {
    employee: number;
    workDate: string;
    quantityUnit: QuantityUnit;
    quantityValue: string;
    notes: string;
  }) => {
    if (activeProjectId === null) {
      throw new Error('Select a project before recording work logs.');
    }

    await requestJson(`${PAYROLL_API_BASE}/projects/${activeProjectId}/work-logs/`, {
      method: 'POST',
      body: JSON.stringify({
        employee,
        work_date: workDate,
        quantity_unit: quantityUnit,
        quantity_value: quantityValue,
        notes,
      }),
    });
    await loadProjectWorkLogs(activeProjectId);
    await refreshStudio();
  };

  /** Helper used by this module to manage delete project work log. */
  const deleteProjectWorkLog = async (workLogId: number) => {
    await requestJson(`${PAYROLL_API_BASE}/project-work-logs/${workLogId}/`, { method: 'DELETE' });
    if (activeProjectId !== null) {
      await loadProjectWorkLogs(activeProjectId);
    }
    await refreshStudio();
    setSuccessMessage('Project tally entry removed.');
  };

  /** Helper used by this module to manage save quick tally entry. */
  const saveQuickTallyEntry = async (employee: number, workDate: string, quantityUnit: QuantityUnit, quantityValue: string) => {
    await createProjectWorkLog({
      employee,
      workDate,
      quantityUnit,
      quantityValue,
      notes: 'Quick tally entry',
    });
    setSuccessMessage('Project tally updated.');
  };

  /** Helper used by this module to manage save custom tally entry. */
  const saveCustomTallyEntry = async () => {
    if (!tallyEditor) {
      return;
    }

    await createProjectWorkLog({
      employee: tallyEditor.employee,
      workDate: tallyEditor.workDate,
      quantityUnit: tallyEditor.quantityUnit,
      quantityValue: tallyEditor.quantityValue,
      notes: tallyEditor.notes,
    });
    setTallyEditor(null);
    setSuccessMessage('Custom project tally saved.');
  };

  /** Sets the tle project for the current workflow. */
  const settleProject = async () => {
    if (activeProjectId === null) {
      throw new Error('Select a project before settlement.');
    }
    await requestJson(`${PAYROLL_API_BASE}/projects/${activeProjectId}/settle/`, {
      method: 'POST',
      body: JSON.stringify({
        settled_to_year: selectedYear,
        settled_to_month: selectedMonth,
      }),
    });
    await refreshStudio();
    await loadProjectWorkLogs(activeProjectId);
    setSuccessMessage('Project bonus settlement completed.');
  };

  /** Helper used by this module to manage generate run. */
  const generateRun = async () => {
    const run = await requestJson<PayrollRunDetailRecord>(`${PAYROLL_API_BASE}/runs/generate/`, {
      method: 'POST',
      body: JSON.stringify({
        year: selectedYear,
        month: selectedMonth,
        run_type: runForm.runType,
        policy_id: runForm.policyId ? Number(runForm.policyId) : null,
        source_run_id: runForm.sourceRunId ? Number(runForm.sourceRunId) : null,
        notes: runForm.notes,
      }),
    });
    await refreshStudio();
    setSelectedRunId(run.id);
    setSelectedRunDetail(run);
    setRunForm(createRunForm());
    setSuccessMessage('Payroll run generated.');
  };

  /** Creates the correction run used by this module. */
  const createCorrectionRun = async () => {
    if (selectedRunId === null) {
      throw new Error('Select a payroll run before creating a correction run.');
    }
    const run = await requestJson<PayrollRunDetailRecord>(`${PAYROLL_API_BASE}/runs/${selectedRunId}/create-correction/`, {
      method: 'POST',
      body: JSON.stringify({
        policy_id: runForm.policyId ? Number(runForm.policyId) : null,
        notes: runForm.notes,
      }),
    });
    await refreshStudio();
    setSelectedRunId(run.id);
    setSelectedRunDetail(run);
    setRunForm(createRunForm());
    setSuccessMessage('Correction payroll run created.');
  };

  /** Helper used by this module to manage approve run. */
  const approveRun = async () => {
    if (selectedRunId === null) {
      throw new Error('Select a payroll run before approving.');
    }
    const run = await requestJson<PayrollRunDetailRecord>(`${PAYROLL_API_BASE}/runs/${selectedRunId}/approve/`, { method: 'POST' });
    setSelectedRunDetail(run);
    await refreshStudio();
    setSuccessMessage('Payroll run approved.');
  };

  /** Helper used by this module to manage lock run. */
  const lockRun = async () => {
    if (selectedRunId === null) {
      throw new Error('Select a payroll run before locking.');
    }
    const run = await requestJson<PayrollRunDetailRecord>(`${PAYROLL_API_BASE}/runs/${selectedRunId}/lock/`, { method: 'POST' });
    setSelectedRunDetail(run);
    await refreshStudio();
    setSuccessMessage('Payroll run locked.');
  };

  /** Helper used by this module to manage rebuild summaries. */
  const rebuildSummaries = async () => {
    await requestJson<RecordsEnvelope<AttendanceSummaryRecord>>(
      `${PAYROLL_API_BASE}/attendance-summaries/?year=${selectedYear}&month=${selectedMonth}&rebuild=true`,
    );
    await refreshStudio();
    setSuccessMessage('Attendance summaries rebuilt for the selected month.');
  };

  /** Helper used by this module to manage generate report. */
  const generateReport = async () => {
    if (selectedRunId === null) {
      throw new Error('Select a payroll run before generating reports.');
    }
    await requestJson(`${PAYROLL_API_BASE}/reports/generate/`, {
      method: 'POST',
      body: JSON.stringify({
        run_id: selectedRunId,
        report_type: reportForm.reportType,
        employee_id: reportForm.reportType === 'employee' ? Number(reportForm.employeeId) : null,
      }),
    });
    await loadRunDetail(selectedRunId);
    await refreshStudio();
    setSuccessMessage('Report artifacts generated.');
  };

  /** Helper used by this module to manage edit policy. */
  const editPolicy = (policy: PayrollPolicyRecord) => {
    setPolicyPreviewTargetId(policy.id);
    setPolicyForm({
      id: policy.id,
      policyCode: policy.policy_code,
      name: policy.name,
      versionNumber: String(policy.version_number),
      effectiveFrom: policy.effective_from,
      effectiveTo: policy.effective_to || '',
      riceAllowanceAmount: policy.rice_allowance_amount,
      socialSecurityAllowanceAmount: policy.social_security_allowance_amount,
      fullAttendanceBonusAmount: policy.full_attendance_bonus_amount,
      laborPoolPercent: policy.labor_pool_percent,
      normalWorkHoursPerDay: policy.normal_work_hours_per_day,
      salaryDaysPerMonth: String(policy.salary_days_per_month),
      overtimeMultiplier: policy.overtime_multiplier,
      overtimeGraceMinutes: String(policy.overtime_grace_minutes || 0),
      lateGraceMinutes: policy.late_grace_minutes === null ? '' : String(policy.late_grace_minutes),
      roundingUnitAmount: String(policy.rounding_unit_amount),
      unapprovedAbsenceIncidentThreshold: String(policy.unapproved_absence_incident_threshold),
      status: policy.status,
      currency: policy.currency,
      isActive: policy.is_active,
    });
  };

  /** Helper used by this module to manage edit compensation profile. */
  const editCompensationProfile = (profile: CompensationProfileRecord) => {
    setCompensationFormMode('edit');
    setCompensationForm({
      id: profile.id,
      employee: String(profile.employee),
      monthlySalary: profile.monthly_salary,
      riceAllowanceAmount: profile.rice_allowance_amount || '',
      socialSecurityAllowanceAmount: profile.social_security_allowance_amount || '',
      eligibleForSocialSecurity: profile.eligible_for_social_security,
      payrollPolicy: profile.payroll_policy ? String(profile.payroll_policy) : '',
      effectiveFrom: profile.effective_from,
      effectiveTo: profile.effective_to || '',
    });
  };

  /** Helper used by this module to manage edit attendance work rule profile. */
  const editAttendanceWorkRuleProfile = (profile: AttendanceWorkRuleProfileRecord) => {
    setAttendanceWorkRuleFormMode('edit');
    setAttendanceWorkRuleForm({
      id: profile.id,
      employee: String(profile.employee),
      workRule: profile.work_rule,
      effectiveFrom: profile.effective_from,
      effectiveTo: profile.effective_to || '',
      notes: profile.notes,
    });
  };

  /** Helper used by this module to manage begin compensation termination. */
  const beginCompensationTermination = (profile: CompensationProfileRecord) => {
    setCompensationFormMode('terminate');
    setCompensationForm({
      id: profile.id,
      employee: String(profile.employee),
      monthlySalary: profile.monthly_salary,
      riceAllowanceAmount: profile.rice_allowance_amount || '',
      socialSecurityAllowanceAmount: profile.social_security_allowance_amount || '',
      eligibleForSocialSecurity: profile.eligible_for_social_security,
      payrollPolicy: profile.payroll_policy ? String(profile.payroll_policy) : '',
      effectiveFrom: profile.effective_from,
      effectiveTo: profile.effective_to || getTodayIsoDate(),
    });
  };

  /** Helper used by this module to manage begin attendance work rule termination. */
  const beginAttendanceWorkRuleTermination = (profile: AttendanceWorkRuleProfileRecord) => {
    setAttendanceWorkRuleFormMode('terminate');
    setAttendanceWorkRuleForm({
      id: profile.id,
      employee: String(profile.employee),
      workRule: profile.work_rule,
      effectiveFrom: profile.effective_from,
      effectiveTo: profile.effective_to || getTodayIsoDate(),
      notes: profile.notes,
    });
  };

  /** Creates the compensation successor used by this module. */
  const createCompensationSuccessor = (profile: CompensationProfileRecord) => {
    if (!profile.effective_to) {
      throw new Error('End the current compensation profile before creating its successor.');
    }

    setCompensationFormMode('create');
    setCompensationForm({
      id: null,
      employee: String(profile.employee),
      monthlySalary: profile.monthly_salary,
      riceAllowanceAmount: profile.rice_allowance_amount || '',
      socialSecurityAllowanceAmount: profile.social_security_allowance_amount || '',
      eligibleForSocialSecurity: profile.eligible_for_social_security,
      payrollPolicy: profile.payroll_policy ? String(profile.payroll_policy) : '',
      effectiveFrom: shiftIsoDate(profile.effective_to, 1),
      effectiveTo: '',
    });
  };

  /** Creates the attendance work rule successor used by this module. */
  const createAttendanceWorkRuleSuccessor = (profile: AttendanceWorkRuleProfileRecord) => {
    if (!profile.effective_to) {
      throw new Error('End the current attendance work-rule profile before creating its successor.');
    }

    setAttendanceWorkRuleFormMode('create');
    setAttendanceWorkRuleForm({
      id: null,
      employee: String(profile.employee),
      workRule: profile.work_rule,
      effectiveFrom: shiftIsoDate(profile.effective_to, 1),
      effectiveTo: '',
      notes: profile.notes,
    });
  };

  const latestGrossPay = selectedRunSummary ? formatMoney(selectedRunSummary.total_gross_payable_amount) : 'No run yet';
  const headcountValue = selectedRunSummary ? String(selectedRunSummary.headcount_paid) : String(attendanceSummaries.length);
  const bonusPoolValue = activeProject ? formatMoney(activeProject.labor_pool_amount) : formatMoney(0);
  const pendingAdjustments = adjustments.filter((adjustment) => adjustment.approval_status === 'pending').length;
  const openCarryForwardCount = carryForwardBalances.filter((balance) => balance.status !== 'closed').length;
  const outstandingCarryForwardAmount = formatMoney(
    carryForwardBalances.reduce((total, balance) => total + Number(balance.remaining_amount), 0),
  );

  return (
    <div className={`${bodyFont.className} salary-studio-shell`}>
      <section className="salary-studio-hero card">
        <div className="salary-studio-hero-copy">
          <div className="salary-studio-eyebrow">Payroll workspace</div>
          <h1 className={`salary-studio-hero-title ${displayFont.className}`}>Five views, one payroll room.</h1>
          <p className="salary-studio-hero-text">
            Work through {formatMonthYear(selectedYear, selectedMonth)} in the same place: resolve attendance, manage policy and compensation,
            tally project work, freeze the run, and preview/export the reports without leaving the salary workspace.
          </p>
          <div className="salary-studio-hero-actions">
            <button className="btn btn-primary" type="button" onClick={() => void performAction('Rebuilding attendance summaries', rebuildSummaries)}>
              Rebuild attendance summaries
            </button>
            <button className="btn btn-outline" type="button" onClick={() => void refreshStudio()}>
              Refresh workspace
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setActiveView('final_payroll')}>
              Jump to final payroll
            </button>
          </div>
        </div>

        <div className="salary-studio-hero-side">
          <div className="salary-studio-period-card">
            <label className="salary-studio-field">
              <span>Year</span>
              <input className="input" type="number" min={2020} max={2100} value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} />
            </label>
            <label className="salary-studio-field">
              <span>Month</span>
              <select className="input" value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="salary-studio-period-copy">
              <strong>{currentPolicy ? currentPolicy.name : 'No active policy'}</strong>
              <span>
                {currentPolicy
                  ? `${currentPolicy.policy_code} v${currentPolicy.version_number} · ${activeView.replace('_', ' ')}`
                  : 'Create or activate a policy version for this month.'}
              </span>
            </div>
          </div>

          <div className="salary-studio-metric-grid">
            <MetricCard label="Gross payroll" value={latestGrossPay} tone="accent" />
            <MetricCard label="Headcount tracked" value={headcountValue} />
            <MetricCard label="Pending adjustments" value={String(pendingAdjustments)} />
            <MetricCard label="Bonus pool in play" value={bonusPoolValue} tone="positive" />
          </div>
        </div>
      </section>

      {(busyLabel || successMessage || loadIssues.length > 0) && (
        <section className="salary-studio-message-row">
          {busyLabel ? <div className="salary-studio-message-card salary-studio-message-busy">{busyLabel}</div> : null}
          {successMessage ? <div className="salary-studio-message-card salary-studio-message-success">{successMessage}</div> : null}
          {loadIssues.length > 0 ? (
            <div className="salary-studio-message-card salary-studio-message-muted">
              {loadIssues.join(' ')}
            </div>
          ) : null}
        </section>
      )}

      <section className="salary-studio-view-switcher card card-glass">
        <div className="salary-studio-view-switcher-copy">
          <div className="salary-studio-eyebrow">Five-view flow</div>
          <h2 className={`salary-studio-section-title ${displayFont.className}`}>The workspace follows the planning document literally.</h2>
          <p className="salary-studio-section-copy">
            Attendance, Adjustments, Projects, Final Payroll, and Reports stay in one route so the month-end workflow is auditable end to end.
          </p>
        </div>
        <div className="salary-studio-view-switcher-grid">
          {SALARY_VIEW_OPTIONS.map((viewOption) => (
            <WorkspaceViewButton
              key={viewOption.value}
              label={viewOption.label}
              helper={viewOption.helper}
              isActive={activeView === viewOption.value}
              onClick={() => setActiveView(viewOption.value)}
            />
          ))}
        </div>
      </section>

      {activeView === 'attendance' ? (
        <section className="salary-studio-view-stack">
          <article className="salary-studio-panel card card-glass">
            <SectionTitle
              eyebrow="Attendance view"
              title="Resolve the month before payroll can move."
              copy="Leave entry stays beside the attendance calendar, blue overtime decisions remain reviewable, and final attendance can be saved without leaving the salary route."
            />
            <div className="salary-studio-record-stats">
              <span>{attendanceSummaries.length} attendance summaries currently stored for this payroll month</span>
              <span>{currentPolicy ? `Using ${currentPolicy.policy_code} v${currentPolicy.version_number}` : 'No active policy yet'}</span>
              <span>{pendingAdjustments} pending adjustments waiting in parallel</span>
            </div>
          </article>
          <div className="salary-studio-embedded-attendance">
            <iframe
              key={`${selectedYear}-${selectedMonth}`}
              className="salary-studio-attendance-frame"
              title="Attendance workspace"
              src={`/erp/employees/payroll?year=${selectedYear}&month=${selectedMonth}`}
            />
          </div>
        </section>
      ) : null}

      {activeView === 'adjustments' ? (
        <section className="salary-studio-main-grid">
          <div className="salary-studio-column-main">
            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Policy studio"
                title="Version, preview, activate, and archive the rulebook."
                copy="Policies remain configurable data. Preview the month impact before activation, then archive historical versions instead of deleting used rules."
              />
              <form
                className="salary-studio-form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void performAction(policyForm.id === null ? 'Saving payroll policy' : 'Updating payroll policy', savePolicy);
                }}
              >
                <label className="salary-studio-field"><span>Policy code</span><input className="input" value={policyForm.policyCode} onChange={(event) => setPolicyForm({ ...policyForm, policyCode: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Name</span><input className="input" value={policyForm.name} onChange={(event) => setPolicyForm({ ...policyForm, name: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Version</span><input className="input" type="number" min={1} value={policyForm.versionNumber} onChange={(event) => setPolicyForm({ ...policyForm, versionNumber: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Effective from</span><input className="input" type="date" value={policyForm.effectiveFrom} onChange={(event) => setPolicyForm({ ...policyForm, effectiveFrom: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Effective to</span><input className="input" type="date" value={policyForm.effectiveTo} onChange={(event) => setPolicyForm({ ...policyForm, effectiveTo: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Rice allowance</span><input className="input" value={policyForm.riceAllowanceAmount} onChange={(event) => setPolicyForm({ ...policyForm, riceAllowanceAmount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Social security allowance</span><input className="input" value={policyForm.socialSecurityAllowanceAmount} onChange={(event) => setPolicyForm({ ...policyForm, socialSecurityAllowanceAmount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Full attendance bonus</span><input className="input" value={policyForm.fullAttendanceBonusAmount} onChange={(event) => setPolicyForm({ ...policyForm, fullAttendanceBonusAmount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Labor pool percent</span><input className="input" value={policyForm.laborPoolPercent} onChange={(event) => setPolicyForm({ ...policyForm, laborPoolPercent: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Work hours per day</span><input className="input" value={policyForm.normalWorkHoursPerDay} onChange={(event) => setPolicyForm({ ...policyForm, normalWorkHoursPerDay: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Salary days per month</span><input className="input" value={policyForm.salaryDaysPerMonth} onChange={(event) => setPolicyForm({ ...policyForm, salaryDaysPerMonth: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Overtime multiplier</span><input className="input" value={policyForm.overtimeMultiplier} onChange={(event) => setPolicyForm({ ...policyForm, overtimeMultiplier: event.target.value })} /></label>
                <label className="salary-studio-field"><span>OT grace minutes</span><input className="input" value={policyForm.overtimeGraceMinutes} onChange={(event) => setPolicyForm({ ...policyForm, overtimeGraceMinutes: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Late grace minutes</span><input className="input" value={policyForm.lateGraceMinutes} onChange={(event) => setPolicyForm({ ...policyForm, lateGraceMinutes: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Rounding unit</span><input className="input" value={policyForm.roundingUnitAmount} onChange={(event) => setPolicyForm({ ...policyForm, roundingUnitAmount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Absence threshold</span><input className="input" value={policyForm.unapprovedAbsenceIncidentThreshold} onChange={(event) => setPolicyForm({ ...policyForm, unapprovedAbsenceIncidentThreshold: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Status</span><select className="input" value={policyForm.status} onChange={(event) => setPolicyForm({ ...policyForm, status: event.target.value as PolicyStatus })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
                <label className="salary-studio-field"><span>Currency</span><input className="input" value={policyForm.currency} onChange={(event) => setPolicyForm({ ...policyForm, currency: event.target.value })} /></label>
                <label className="salary-studio-checkbox"><input type="checkbox" checked={policyForm.isActive} onChange={(event) => setPolicyForm({ ...policyForm, isActive: event.target.checked })} /><span>Mark as active after save</span></label>
                <div className="salary-studio-form-actions">
                  <button className="btn btn-primary" type="submit">{policyForm.id === null ? 'Save policy' : 'Update policy'}</button>
                  <button className="btn btn-outline" type="button" onClick={resetPolicyEditor}>Clear editor</button>
                </div>
              </form>

              <div className="salary-studio-policy-preview card card-glass">
                <div className="salary-studio-record-topline">
                  <div>
                    <strong>Preview impact</strong>
                    <div className="salary-studio-record-meta">Estimate the selected month using resolved attendance, approved adjustments, project settlements, and open recoveries.</div>
                  </div>
                  <label className="salary-studio-field salary-studio-field-inline">
                    <span>Policy preview target</span>
                    <select className="input" value={policyPreviewTargetId || ''} onChange={(event) => setPolicyPreviewTargetId(Number(event.target.value) || null)}>
                      <option value="">Select policy</option>
                      {policies.map((policy) => (
                        <option key={policy.id} value={policy.id}>{policy.policy_code} v{policy.version_number} · {policy.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {policyImpactPreview ? (
                  <>
                    <div className="salary-studio-metric-grid salary-studio-metric-grid-tight">
                      <MetricCard label="Preview headcount" value={String(policyImpactPreview.totals.headcount)} />
                      <MetricCard label="Preview gross" value={formatMoney(policyImpactPreview.totals.gross_payable_amount)} tone="accent" />
                      <MetricCard label="Preview deductions" value={formatMoney(policyImpactPreview.totals.deduction_amount)} />
                      <MetricCard label="Preview overtime" value={formatMoney(policyImpactPreview.totals.overtime_pay_amount)} tone="positive" />
                    </div>
                    {policyImpactPreview.missing_profiles.length > 0 ? (
                      <div className="salary-studio-message-card salary-studio-message-muted">
                        Missing compensation profiles: {policyImpactPreview.missing_profiles.join(', ')}
                      </div>
                    ) : null}
                    <div className="salary-studio-table-shell">
                      <table className="salary-studio-table">
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>Base wage</th>
                            <th>OT pay</th>
                            <th>Deductions</th>
                            <th>Attendance bonus</th>
                            <th>Final payable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {policyImpactPreview.rows.map((row) => (
                            <tr key={row.employee}>
                              <td>{row.employee_name}<span className="salary-studio-table-meta">{row.worker_id || 'No worker id'}</span></td>
                              <td>{formatMoney(row.monthly_base_wage)}</td>
                              <td>{formatMoney(row.overtime_pay_amount)}<span className="salary-studio-table-meta">Payable {formatMinutes(row.payable_ot_minutes_total)}</span></td>
                              <td>{formatMoney(row.deduction_amount)}<span className="salary-studio-table-meta">OT offset {formatMinutes(row.approved_ot_offset_minutes_total)}</span></td>
                              <td>{formatMoney(row.attendance_bonus)}</td>
                              <td>{formatMoney(row.gross_payable_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="salary-studio-empty-state">Choose a policy version to preview the payroll impact for this month.</div>
                )}
              </div>

              <div className="salary-studio-card-list">
                {policies.map((policy) => (
                  <article key={policy.id} className="salary-studio-record-card">
                    <div className="salary-studio-record-topline">
                      <div>
                        <strong>{policy.name}</strong>
                        <div className="salary-studio-record-meta">{policy.policy_code} v{policy.version_number} · {policy.effective_from}</div>
                      </div>
                      <span className={`salary-studio-badge ${statusToneClass(policy.status)}`}>{policy.is_active ? 'Active' : policy.status}</span>
                    </div>
                    <div className="salary-studio-record-stats">
                      <span>Attendance bonus {formatMoney(policy.full_attendance_bonus_amount)}</span>
                      <span>OT x{policy.overtime_multiplier}</span>
                      <span>Pool {(Number(policy.labor_pool_percent) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="salary-studio-inline-actions">
                      <button className="btn btn-outline" type="button" onClick={() => editPolicy(policy)}>Edit</button>
                      <button className="btn btn-outline" type="button" onClick={() => setPolicyPreviewTargetId(policy.id)}>Preview impact</button>
                      <button className="btn btn-outline" type="button" onClick={() => void performAction('Activating payroll policy', async () => activatePolicy(policy.id))} disabled={policy.is_active}>Activate</button>
                      <button className="btn btn-outline" type="button" onClick={() => void performAction('Cloning payroll policy', async () => clonePolicy(policy.id))}>Clone</button>
                      {policy.status !== 'archived' ? (
                        <button className="btn btn-outline" type="button" onClick={() => void performAction('Archiving payroll policy', async () => archivePolicy(policy.id))}>Archive</button>
                      ) : null}
                      {policy.status === 'draft' ? (
                        <button className="btn btn-outline" type="button" onClick={() => void performAction('Deleting draft policy', async () => deletePolicy(policy.id))}>Delete</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Compensation ledger"
                title="Bind employee packages to the month window."
                copy="Compensation profiles are the payroll source of truth for effective-dated salary changes, discretionary social security decisions, and continuous package history."
              />
              <div className="salary-studio-message-card salary-studio-message-muted">
                Leave end date blank while a package is still current. Use Terminate on a live row to prefill today, or choose a custom end date before saving. Successor profiles should begin on the very next day so the ledger stays continuous.
              </div>
              <div className="salary-studio-message-card salary-studio-message-muted">
                The ledger table below shows past, current, and future scheduled packages. Future rows can block a new open-ended profile even if they do not apply in {formatMonthYear(selectedYear, selectedMonth)} yet.
              </div>
              <form
                className="salary-studio-form-grid salary-studio-form-grid-compact"
                onSubmit={(event) => {
                  event.preventDefault();
                  void performAction(
                    compensationFormMode === 'create'
                      ? 'Saving compensation profile'
                      : compensationFormMode === 'terminate'
                        ? 'Saving compensation end date'
                        : 'Updating compensation profile',
                    saveCompensationProfile,
                  );
                }}
              >
                <label className="salary-studio-field"><span>Employee</span><select className="input" value={compensationForm.employee} onChange={(event) => setCompensationForm({ ...compensationForm, employee: event.target.value })} disabled={compensationForm.id !== null}><option value="">Select employee</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.worker_id ? ` (${employee.worker_id})` : ''}</option>)}</select></label>
                <label className="salary-studio-field"><span>Monthly salary</span><input className="input" value={compensationForm.monthlySalary} onChange={(event) => setCompensationForm({ ...compensationForm, monthlySalary: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Rice allowance override</span><input className="input" value={compensationForm.riceAllowanceAmount} onChange={(event) => setCompensationForm({ ...compensationForm, riceAllowanceAmount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Social security override</span><input className="input" value={compensationForm.socialSecurityAllowanceAmount} onChange={(event) => setCompensationForm({ ...compensationForm, socialSecurityAllowanceAmount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Policy version</span><select className="input" value={compensationForm.payrollPolicy} onChange={(event) => setCompensationForm({ ...compensationForm, payrollPolicy: event.target.value })}><option value="">Use active period policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.policy_code} v{policy.version_number}</option>)}</select></label>
                <label className="salary-studio-field"><span>Effective from</span><input className="input" type="date" value={compensationForm.effectiveFrom} onChange={(event) => setCompensationForm({ ...compensationForm, effectiveFrom: event.target.value })} /></label>
                <label className="salary-studio-field"><span>End date</span><input className="input" type="date" value={compensationForm.effectiveTo} onChange={(event) => setCompensationForm({ ...compensationForm, effectiveTo: event.target.value })} /></label>
                <label className="salary-studio-checkbox"><input type="checkbox" checked={compensationForm.eligibleForSocialSecurity} onChange={(event) => setCompensationForm({ ...compensationForm, eligibleForSocialSecurity: event.target.checked })} /><span>Eligible for social security allowance (manual decision)</span></label>
                <div className="salary-studio-form-actions">
                  <button className="btn btn-primary" type="submit">{compensationFormMode === 'create' ? 'Save profile' : compensationFormMode === 'terminate' ? 'Save end date' : 'Update profile'}</button>
                  <button className="btn btn-outline" type="button" onClick={resetCompensationEditor}>Clear editor</button>
                </div>
              </form>

              <div className="salary-studio-table-shell">
                <table className="salary-studio-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Monthly salary</th>
                      <th>Policy</th>
                      <th>Ledger state</th>
                      <th>Window</th>
                      <th>SS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {compensationProfiles.map((profile) => {
                      const timing = getCompensationProfileTiming(profile, selectedYear, selectedMonth);

                      return (
                        <tr key={profile.id}>
                          <td>{profile.employee_name || 'Employee'}<span className="salary-studio-table-meta">{profile.worker_id || 'No worker id'}</span></td>
                          <td>{formatMoney(profile.monthly_salary)}</td>
                          <td>{profile.payroll_policy_name || 'Active period policy'}</td>
                          <td>
                            <span className={`salary-studio-badge ${timing.tone === 'selected-month' ? 'status-tone-positive' : timing.tone === 'future' ? 'status-tone-warning' : 'status-tone-muted'}`}>
                              {timing.label}
                            </span>
                          </td>
                          <td>{profile.effective_from}{profile.effective_to ? ` to ${profile.effective_to}` : ' onward'}</td>
                          <td>{profile.eligible_for_social_security ? 'Eligible' : 'Excluded'}</td>
                          <td>
                            <div className="salary-studio-inline-actions">
                              <button className="btn btn-outline salary-studio-mini-button" type="button" onClick={() => editCompensationProfile(profile)}>Edit</button>
                              {profile.effective_to ? (
                                <button className="btn btn-outline salary-studio-mini-button" type="button" onClick={() => createCompensationSuccessor(profile)}>Successor</button>
                              ) : (
                                <button className="btn btn-outline salary-studio-mini-button" type="button" onClick={() => beginCompensationTermination(profile)}>Terminate</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Attendance work rules"
                title="Choose when early leave becomes absence or driver time bank."
                copy="Without any profile, the employee follows the default standard rule. Late minutes still consume approved OT first for everyone; the driver rule only changes how early departures are treated."
              />
              <div className="salary-studio-message-card salary-studio-message-muted">
                Use Standard when early leave should count as absence. Use Driver time bank when approved early release should create time debt that same-month approved OT must repay before any OT pay is released. Any unpaid debt is forgiven when the next month starts.
              </div>
              <form
                className="salary-studio-form-grid salary-studio-form-grid-compact"
                onSubmit={(event) => {
                  event.preventDefault();
                  void performAction(
                    attendanceWorkRuleFormMode === 'create'
                      ? 'Saving attendance work-rule profile'
                      : attendanceWorkRuleFormMode === 'terminate'
                        ? 'Saving attendance work-rule end date'
                        : 'Updating attendance work-rule profile',
                    saveAttendanceWorkRuleProfile,
                  );
                }}
              >
                <label className="salary-studio-field"><span>Employee</span><select className="input" value={attendanceWorkRuleForm.employee} onChange={(event) => setAttendanceWorkRuleForm({ ...attendanceWorkRuleForm, employee: event.target.value })} disabled={attendanceWorkRuleForm.id !== null}><option value="">Select employee</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.worker_id ? ` (${employee.worker_id})` : ''}</option>)}</select></label>
                <label className="salary-studio-field"><span>Rule</span><select className="input" value={attendanceWorkRuleForm.workRule} onChange={(event) => setAttendanceWorkRuleForm({ ...attendanceWorkRuleForm, workRule: event.target.value as AttendanceWorkRule })}><option value="standard">Standard</option><option value="driver_time_bank">Driver time bank</option></select></label>
                <label className="salary-studio-field"><span>Effective from</span><input className="input" type="date" value={attendanceWorkRuleForm.effectiveFrom} onChange={(event) => setAttendanceWorkRuleForm({ ...attendanceWorkRuleForm, effectiveFrom: event.target.value })} /></label>
                <label className="salary-studio-field"><span>End date</span><input className="input" type="date" value={attendanceWorkRuleForm.effectiveTo} onChange={(event) => setAttendanceWorkRuleForm({ ...attendanceWorkRuleForm, effectiveTo: event.target.value })} /></label>
                <label className="salary-studio-field salary-studio-field-wide"><span>Notes</span><input className="input" value={attendanceWorkRuleForm.notes} onChange={(event) => setAttendanceWorkRuleForm({ ...attendanceWorkRuleForm, notes: event.target.value })} placeholder="Optional reason or operating note" /></label>
                <div className="salary-studio-form-actions">
                  <button className="btn btn-primary" type="submit">{attendanceWorkRuleFormMode === 'create' ? 'Save rule profile' : attendanceWorkRuleFormMode === 'terminate' ? 'Save end date' : 'Update rule profile'}</button>
                  <button className="btn btn-outline" type="button" onClick={resetAttendanceWorkRuleEditor}>Clear editor</button>
                </div>
              </form>

              <div className="salary-studio-table-shell">
                <table className="salary-studio-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Rule</th>
                      <th>Ledger state</th>
                      <th>Window</th>
                      <th>Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceWorkRuleProfiles.map((profile) => {
                      const timing = getAttendanceWorkRuleTiming(profile, selectedYear, selectedMonth);

                      return (
                        <tr key={profile.id}>
                          <td>{profile.employee_name || 'Employee'}<span className="salary-studio-table-meta">{profile.worker_id || 'No worker id'}</span></td>
                          <td>{formatAttendanceWorkRuleLabel(profile.work_rule)}</td>
                          <td>
                            <span className={`salary-studio-badge ${timing.tone === 'selected-month' ? 'status-tone-positive' : timing.tone === 'future' ? 'status-tone-warning' : 'status-tone-muted'}`}>
                              {timing.label}
                            </span>
                          </td>
                          <td>{profile.effective_from}{profile.effective_to ? ` to ${profile.effective_to}` : ' onward'}</td>
                          <td>{profile.notes || '—'}</td>
                          <td>
                            <div className="salary-studio-inline-actions">
                              <button className="btn btn-outline salary-studio-mini-button" type="button" onClick={() => editAttendanceWorkRuleProfile(profile)}>Edit</button>
                              {profile.effective_to ? (
                                <button className="btn btn-outline salary-studio-mini-button" type="button" onClick={() => createAttendanceWorkRuleSuccessor(profile)}>Successor</button>
                              ) : (
                                <button className="btn btn-outline salary-studio-mini-button" type="button" onClick={() => beginAttendanceWorkRuleTermination(profile)}>Terminate</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="salary-studio-table-shell">
                <table className="salary-studio-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Opening bank</th>
                      <th>Current month debt</th>
                      <th>Open balance now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceSummaries
                      .filter((summary) => (openingTimeBankByEmployee.get(summary.employee) || 0) > 0 || summary.time_bank_minutes_total > 0)
                      .map((summary) => {
                        const openingMinutes = openingTimeBankByEmployee.get(summary.employee) || 0;
                        const openBalance = openingMinutes + summary.time_bank_minutes_total;
                        return (
                          <tr key={`time-bank-${summary.employee}`}>
                            <td>{summary.employee_name || 'Employee'}<span className="salary-studio-table-meta">{summary.worker_id || 'No worker id'}</span></td>
                            <td>{formatMinutes(openingMinutes)}<span className="salary-studio-table-meta">Resets monthly</span></td>
                            <td>{formatMinutes(summary.time_bank_minutes_total)}</td>
                            <td>{formatMinutes(openBalance)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {attendanceSummaries.filter((summary) => (openingTimeBankByEmployee.get(summary.employee) || 0) > 0 || summary.time_bank_minutes_total > 0).length === 0 ? (
                  <div className="salary-studio-empty-state">No open driver time-bank debt around the selected month.</div>
                ) : null}
              </div>
            </article>
          </div>

          <div className="salary-studio-column-side">
            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Adjustments view"
                title="Enter extras, advances, and signed payroll changes."
                copy="Quick-add chips keep common adjustment types close, while approvals stay visible before the month is frozen."
              />
              <div className="salary-studio-chip-strip">
                {ADJUSTMENT_TYPE_OPTIONS.map((option) => (
                  <button key={option.value} className={`salary-studio-chip-button ${adjustmentForm.adjustmentType === option.value ? 'salary-studio-chip-button-active' : ''}`} type="button" onClick={() => setAdjustmentForm({ ...adjustmentForm, adjustmentType: option.value })}>
                    {option.label}
                  </button>
                ))}
              </div>
              <form
                className="salary-studio-form-grid salary-studio-form-grid-compact"
                onSubmit={(event) => {
                  event.preventDefault();
                  void performAction(
                    adjustmentForm.id === null ? 'Saving payroll adjustment' : 'Updating payroll adjustment',
                    saveAdjustment,
                  );
                }}
              >
                <label className="salary-studio-field"><span>Employee</span><select className="input" value={adjustmentForm.employee} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, employee: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                <label className="salary-studio-field"><span>Type</span><select className="input" value={adjustmentForm.adjustmentType} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustmentType: event.target.value })}>{ADJUSTMENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="salary-studio-field"><span>Amount</span><input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })} /></label>
                <label className="salary-studio-field"><span>Repeat monthly until</span><input className="input" type="date" value={adjustmentForm.repeatUntil} disabled={adjustmentForm.id !== null} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, repeatUntil: event.target.value })} /></label>
                <label className="salary-studio-field salary-studio-field-wide"><span>Notes</span><input className="input" value={adjustmentForm.notes} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, notes: event.target.value })} /></label>
                <div className="muted" style={{ gridColumn: '1 / -1' }}>
                  {adjustmentTypeBehavesAsDeduction(adjustmentForm.adjustmentType)
                    ? 'Wage advances and manual deductions reduce approved pay. Enter the face value only; payroll stores the deduction sign for you.'
                    : 'Set a repeat-until month only when you want the same adjustment pre-seeded across future payroll months. Blank keeps this as a one-off item.'}
                </div>
                <div className="muted" style={{ gridColumn: '1 / -1' }}>
                  Open-ended or infinite recurrence is not stored yet. If a task keeps repeating, set the next stop month and reseed again later if needed.
                </div>
                <div className="salary-studio-form-actions">
                  <button className="btn btn-primary" type="submit">{adjustmentForm.id === null ? 'Add adjustment' : 'Update adjustment'}</button>
                  <button className="btn btn-outline" type="button" onClick={resetAdjustmentEditor}>Clear</button>
                </div>
              </form>

              <div className="salary-studio-table-shell">
                <table className="salary-studio-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Approved net</th>
                      <th>Pending items</th>
                      <th>Latest note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeOptions.map((employee) => {
                      const employeeAdjustments = adjustments.filter((adjustment) => adjustment.employee === employee.id);
                      const approvedAdjustments = employeeAdjustments.filter((adjustment) => adjustment.approval_status === 'approved');
                      const pendingAdjustments = employeeAdjustments.filter((adjustment) => adjustment.approval_status === 'pending');
                      const latestNote = employeeAdjustments[0]?.notes || 'No items yet';
                      return (
                        <tr key={employee.id}>
                          <td>{employee.name}<span className="salary-studio-table-meta">{employee.worker_id || 'No worker id'}</span></td>
                          <td>
                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                              <span>{formatMoney(approvedAdjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount), 0))}</span>
                              {approvedAdjustments.length > 0 ? (
                                <details>
                                  <summary style={{ cursor: 'pointer' }}>{approvedAdjustments.length} approved {approvedAdjustments.length === 1 ? 'item' : 'items'}</summary>
                                  <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.5rem' }}>
                                    {approvedAdjustments.map((adjustment) => (
                                      <div key={adjustment.id} style={{ display: 'grid', gap: '0.15rem' }}>
                                        <span>{formatAdjustmentTypeLabel(adjustment.adjustment_type)} · {formatSignedMoney(adjustment.amount)}</span>
                                        <span className="salary-studio-table-meta">{adjustment.notes || formatMonthYear(adjustment.year, adjustment.month)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              ) : (
                                <span className="salary-studio-table-meta">No approved items</span>
                              )}
                            </div>
                          </td>
                          <td>{pendingAdjustments.length}</td>
                          <td>{latestNote}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="salary-studio-card-list salary-studio-card-list-tight">
                {adjustments.map((adjustment) => (
                  <article key={adjustment.id} className="salary-studio-record-card">
                    <div className="salary-studio-record-topline">
                      <div>
                        <strong>{adjustment.employee_name || 'Employee'}</strong>
                        <div className="salary-studio-record-meta">{formatAdjustmentTypeLabel(adjustment.adjustment_type)}</div>
                      </div>
                      <span className={`salary-studio-badge ${statusToneClass(adjustment.approval_status)}`}>{adjustment.approval_status}</span>
                    </div>
                    <div className="salary-studio-record-stats">
                      <span>{formatMonthYear(adjustment.year, adjustment.month)}</span>
                      <span>{formatSignedMoney(adjustment.amount)}</span>
                    </div>
                    <p className="salary-studio-record-note">{adjustment.notes || 'No notes provided.'}</p>
                    <div className="salary-studio-inline-actions">
                      {adjustment.approval_status === 'pending' ? (
                        <button className="btn btn-outline" type="button" onClick={() => void performAction('Approving adjustment', async () => approveAdjustment(adjustment.id))}>Approve</button>
                      ) : null}
                      <button className="btn btn-outline" type="button" onClick={() => editAdjustment(adjustment)}>Edit</button>
                      <button className="btn btn-outline" type="button" onClick={() => {
                        if (!window.confirm(`Delete ${formatAdjustmentTypeLabel(adjustment.adjustment_type)} for ${adjustment.employee_name || 'this employee'}?`)) {
                          return;
                        }
                        void performAction('Deleting adjustment', async () => deleteAdjustment(adjustment.id));
                      }}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Carry-forward ledger"
                title="See what the next payroll month will recover."
                copy="Overpayment balances stay read-only here so the month shows exactly which recoveries are open before payroll generation."
              />
              <div className="salary-studio-table-shell">
                <table className="salary-studio-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Apply from</th>
                      <th>Remaining</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carryForwardBalances.map((balance) => (
                      <tr key={balance.id}>
                        <td>{balance.employee_name || 'Employee'}<span className="salary-studio-table-meta">{balance.worker_id || 'No worker id'}</span></td>
                        <td>{formatMonthYear(balance.apply_from_year, balance.apply_from_month)}</td>
                        <td>{formatMoney(balance.remaining_amount)}</td>
                        <td><span className={`salary-studio-badge ${statusToneClass(balance.status)}`}>{balance.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="salary-studio-record-stats">
                <span>{openCarryForwardCount} open balances</span>
                <span>{outstandingCarryForwardAmount}</span>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activeView === 'projects' ? (
        <section className="salary-studio-view-stack">
          <article className="salary-studio-panel card card-glass">
            <SectionTitle
              eyebrow="Projects view"
              title="Open a project, then tally work day by day."
              copy="The table mirrors the accountant’s workflow: employees on rows, dates on columns, and quick chips for day, half-day, or raw-hour entries without auto-blocking double booking."
            />
            <form
              className="salary-studio-form-grid salary-studio-form-grid-compact"
              onSubmit={(event) => {
                event.preventDefault();
                void performAction('Creating project', saveProject);
              }}
            >
              <label className="salary-studio-field"><span>Project name</span><input className="input" value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} /></label>
              <label className="salary-studio-field"><span>Project code</span><input className="input" value={projectForm.projectCode} onChange={(event) => setProjectForm({ ...projectForm, projectCode: event.target.value })} /></label>
              <label className="salary-studio-field"><span>Revenue amount</span><input className="input" value={projectForm.revenueAmount} onChange={(event) => setProjectForm({ ...projectForm, revenueAmount: event.target.value })} /></label>
              <label className="salary-studio-field"><span>Labor pool percent</span><input className="input" value={projectForm.laborPoolPercent} onChange={(event) => setProjectForm({ ...projectForm, laborPoolPercent: event.target.value })} /></label>
              <label className="salary-studio-field"><span>Status</span><select className="input" value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as ProjectStatus })}><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option><option value="settled">Settled</option></select></label>
              <label className="salary-studio-field"><span>Start date</span><input className="input" type="date" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} /></label>
              <label className="salary-studio-field salary-studio-field-wide"><span>Management note</span><input className="input" value={projectForm.managementNote} onChange={(event) => setProjectForm({ ...projectForm, managementNote: event.target.value })} /></label>
              <div className="salary-studio-form-actions"><button className="btn btn-primary" type="submit">Create project</button><button className="btn btn-outline" type="button" onClick={resetProjectEditor}>Clear</button></div>
            </form>

            <div className="salary-studio-table-shell">
              <table className="salary-studio-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Revenue</th>
                    <th>Labor pool</th>
                    <th>Remaining pool</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const isActiveProject = project.id === activeProjectId;
                    const preview = isActiveProject ? activeProjectPreview : null;
                    const remainingPool = preview ? preview.remaining_bonus_pool : Math.max(toNumber(project.labor_pool_amount) - toNumber(project.total_bonus_distributed), 0);
                    return (
                      <tr key={project.id} className={isActiveProject ? 'salary-studio-table-row-active' : ''} onClick={() => setActiveProjectId(project.id)}>
                        <td>{project.name}<span className="salary-studio-table-meta">{project.project_code}</span></td>
                        <td>{formatMoney(project.revenue_amount)}</td>
                        <td>{formatMoney(project.labor_pool_amount)}</td>
                        <td>{formatMoney(remainingPool)}</td>
                        <td><span className={`salary-studio-badge ${statusToneClass(project.status)}`}>{project.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="salary-studio-panel card card-glass">
            {activeProject ? (
              <>
                <div className="salary-studio-record-topline">
                  <div>
                    <strong>{activeProject.name}</strong>
                    <div className="salary-studio-record-meta">{activeProject.project_code} · {formatMonthYear(selectedYear, selectedMonth)} tally sheet</div>
                  </div>
                  <span className={`salary-studio-badge ${statusToneClass(activeProject.status)}`}>{activeProject.status}</span>
                </div>

                {activeProjectPreview ? (
                  <div className="salary-studio-metric-grid salary-studio-metric-grid-tight">
                    <MetricCard label="Labor pool" value={formatMoney(activeProjectPreview.labor_pool_amount)} />
                    <MetricCard label="Actual labor spend" value={formatMoney(activeProjectPreview.total_actual_labor_cost_spend)} />
                    <MetricCard label="Remaining pool" value={formatMoney(activeProjectPreview.remaining_bonus_pool)} tone="accent" />
                    <MetricCard label="Assignments" value={String(activeProject.assignments.length)} tone="positive" />
                  </div>
                ) : null}

                <form className="salary-studio-form-grid salary-studio-form-grid-compact" onSubmit={(event) => { event.preventDefault(); void performAction('Adding project assignment', saveAssignment); }}>
                  <label className="salary-studio-field"><span>Assign employee</span><select className="input" value={assignmentForm.employee} onChange={(event) => setAssignmentForm({ ...assignmentForm, employee: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                  <label className="salary-studio-field"><span>Role</span><input className="input" value={assignmentForm.role} onChange={(event) => setAssignmentForm({ ...assignmentForm, role: event.target.value })} /></label>
                  <label className="salary-studio-field"><span>Share weight</span><input className="input" value={assignmentForm.shareWeight} onChange={(event) => setAssignmentForm({ ...assignmentForm, shareWeight: event.target.value })} /></label>
                  <div className="salary-studio-form-actions"><button className="btn btn-outline" type="submit">Add assignment</button></div>
                </form>

                {tallyEditor ? (
                  <div className="salary-studio-tally-editor card card-glass">
                    <div className="salary-studio-record-topline">
                      <strong>Custom tally entry</strong>
                      <span>{employeeOptions.find((employee) => employee.id === tallyEditor.employee)?.name || 'Employee'} · {tallyEditor.workDate}</span>
                    </div>
                    <div className="salary-studio-form-grid salary-studio-form-grid-compact">
                      <label className="salary-studio-field"><span>Quantity</span><input className="input" value={tallyEditor.quantityValue} onChange={(event) => setTallyEditor({ ...tallyEditor, quantityValue: event.target.value })} /></label>
                      <label className="salary-studio-field"><span>Unit</span><select className="input" value={tallyEditor.quantityUnit} onChange={(event) => setTallyEditor({ ...tallyEditor, quantityUnit: event.target.value as QuantityUnit })}><option value="day">Day</option><option value="half_day">Half day</option><option value="hour">Hour</option></select></label>
                      <label className="salary-studio-field salary-studio-field-wide"><span>Notes</span><input className="input" value={tallyEditor.notes} onChange={(event) => setTallyEditor({ ...tallyEditor, notes: event.target.value })} placeholder="Optional tally note" /></label>
                    </div>
                    <div className="salary-studio-inline-actions">
                      <button className="btn btn-primary" type="button" onClick={() => void performAction('Saving custom project tally', saveCustomTallyEntry)}>Save custom entry</button>
                      <button className="btn btn-outline" type="button" onClick={() => setTallyEditor(null)}>Cancel</button>
                    </div>
                  </div>
                ) : null}

                <div className="salary-studio-tally-shell">
                  <table className="salary-studio-tally-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        {selectedMonthDays.map((day) => (
                          <th key={day}>{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeProject.assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="salary-studio-tally-employee-cell">
                            <strong>{assignment.employee_name || 'Employee'}</strong>
                            <span className="salary-studio-table-meta">{assignment.role || 'No role set'}</span>
                          </td>
                          {selectedMonthDays.map((day) => {
                            const workDate = buildIsoDate(selectedYear, selectedMonth, day);
                            const cellLogs = activeProjectLogMap.get(buildProjectCellKey(assignment.employee, workDate)) || [];
                            return (
                              <td key={`${assignment.id}-${day}`}>
                                <div className="salary-studio-tally-cell">
                                  <div className="salary-studio-tally-chip-row">
                                    {cellLogs.map((log) => (
                                      <button key={log.id} type="button" className="salary-studio-tally-log-pill" onClick={() => void performAction('Removing tally entry', async () => deleteProjectWorkLog(log.id))}>
                                        {formatWorkLogChip(log)}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="salary-studio-tally-actions">
                                    {PROJECT_TALLY_QUICK_OPTIONS.map((option) => (
                                      <button key={option.label} type="button" className="salary-studio-tally-action" onClick={() => void performAction('Saving quick tally entry', async () => saveQuickTallyEntry(assignment.employee, workDate, option.quantityUnit, option.quantityValue))}>
                                        {option.label}
                                      </button>
                                    ))}
                                    <button type="button" className="salary-studio-tally-action salary-studio-tally-action-muted" onClick={() => setTallyEditor({ employee: assignment.employee, workDate, quantityUnit: 'hour', quantityValue: '1', notes: '' })}>
                                      Custom
                                    </button>
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="salary-studio-table-shell">
                  <table className="salary-studio-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Reserved hours</th>
                        <th>Day-equivalent</th>
                        <th>Labor cost</th>
                        <th>Projected bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeProjectPreview?.rows || []).map((row) => (
                        <tr key={row.employee}>
                          <td>{row.employee_name}<span className="salary-studio-table-meta">{row.worker_id || 'No worker id'}</span></td>
                          <td>{row.reserved_hours.toFixed(2)}h</td>
                          <td>{row.day_equivalent.toFixed(2)}d</td>
                          <td>{formatMoney(row.labor_cost_amount)}</td>
                          <td>{formatMoney(row.projected_bonus_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="salary-studio-inline-actions">
                  <button className="btn btn-primary" type="button" onClick={() => void performAction('Settling project bonus', settleProject)}>Preview complete, settle bonus pool</button>
                </div>
              </>
            ) : (
              <div className="salary-studio-empty-state">Create or select a project to open the daily tally grid.</div>
            )}
          </article>
        </section>
      ) : null}

      {activeView === 'final_payroll' ? (
        <section className="salary-studio-main-grid">
          <div className="salary-studio-column-main">
            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Attendance intelligence"
                title="See the payroll facts before you generate the run."
                copy="This summary reflects resolved attendance, approved leave overlays, and overtime decisions. It is the payroll-ready fact sheet for the selected month."
              />
              <div className="salary-studio-table-shell">
                <table className="salary-studio-table salary-studio-wide-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Scheduled</th>
                      <th>Present</th>
                      <th>Late</th>
                      <th>Early leave</th>
                      <th>Absent</th>
                      <th>Time bank</th>
                      <th>Approved leave</th>
                      <th>Unapproved leave</th>
                      <th>Approved OT</th>
                      <th>Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceSummaries.map((summary) => (
                      <tr key={summary.id}>
                        <td>{summary.employee_name || 'Employee'}<span className="salary-studio-table-meta">{summary.worker_id || 'No worker id'}</span></td>
                        <td>{summary.scheduled_work_days} days</td>
                        <td>{summary.actual_present_days} days</td>
                        <td>{formatMinutes(summary.late_minutes_total)}</td>
                        <td>{formatMinutes(summary.early_departure_minutes_total)}</td>
                        <td>{formatMinutes(summary.absent_minutes_total)}</td>
                        <td>{formatMinutes(summary.time_bank_minutes_total)}</td>
                        <td>{formatMinutes(summary.approved_leave_minutes_total)}</td>
                        <td>{formatMinutes(summary.unapproved_leave_minutes_total)}</td>
                        <td>{formatMinutes(summary.approved_ot_minutes_total)}</td>
                        <td><span className={`salary-studio-badge ${summary.full_attendance_eligible ? 'salary-studio-badge-positive' : 'salary-studio-badge-muted'}`}>{summary.full_attendance_eligible ? 'Eligible' : 'No bonus'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Final payroll view"
                title="Generate, review, lock, and correct the month."
                copy="Draft runs can be regenerated. Once locked, use a correction run so every delta remains visible and recoveries stay auditable."
              />
              <form
                className="salary-studio-form-grid salary-studio-form-grid-compact"
                onSubmit={(event) => {
                  event.preventDefault();
                  void performAction('Generating payroll run', generateRun);
                }}
              >
                <label className="salary-studio-field"><span>Run type</span><select className="input" value={runForm.runType} onChange={(event) => setRunForm({ ...runForm, runType: event.target.value as PayrollRunType })}><option value="normal">Normal</option><option value="correction">Correction</option></select></label>
                <label className="salary-studio-field"><span>Policy override</span><select className="input" value={runForm.policyId} onChange={(event) => setRunForm({ ...runForm, policyId: event.target.value })}><option value="">Use active month policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.policy_code} v{policy.version_number}</option>)}</select></label>
                <label className="salary-studio-field"><span>Correction source run</span><select className="input" value={runForm.sourceRunId} onChange={(event) => setRunForm({ ...runForm, sourceRunId: event.target.value })} disabled={runForm.runType !== 'correction'}><option value="">Select source run</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.run_type} #{run.id} · {run.status}</option>)}</select></label>
                <label className="salary-studio-field salary-studio-field-wide"><span>Notes</span><input className="input" value={runForm.notes} onChange={(event) => setRunForm({ ...runForm, notes: event.target.value })} placeholder="Generation note or correction reason" /></label>
                <div className="salary-studio-form-actions">
                  <button className="btn btn-primary" type="submit">Generate run</button>
                  <button className="btn btn-outline" type="button" onClick={() => void performAction('Approving payroll run', approveRun)} disabled={selectedRunId === null}>Approve selected</button>
                  <button className="btn btn-outline" type="button" onClick={() => void performAction('Locking payroll run', lockRun)} disabled={selectedRunId === null}>Lock selected</button>
                  <button className="btn btn-outline" type="button" onClick={() => void performAction('Creating correction run', createCorrectionRun)} disabled={selectedRunId === null}>Create correction from selected</button>
                </div>
              </form>

              <div className="salary-studio-run-grid">
                <div className="salary-studio-run-list">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      className={`salary-studio-run-card ${selectedRunId === run.id ? 'salary-studio-run-card-active' : ''}`}
                      type="button"
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <div className="salary-studio-record-topline">
                        <strong>{run.run_type === 'normal' ? 'Normal run' : 'Correction run'} #{run.id}</strong>
                        <span className={`salary-studio-badge ${statusToneClass(run.status)}`}>{run.status}</span>
                      </div>
                      <div className="salary-studio-record-meta">{formatMonthYear(run.year, run.month)} · {run.policy_name}</div>
                      <div className="salary-studio-record-stats">
                        <span>{run.headcount_paid} people</span>
                        <span>{formatMoney(run.total_gross_payable_amount)}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="salary-studio-run-detail">
                  {selectedRunDetail ? (
                    <>
                      <div className="salary-studio-record-topline">
                        <div>
                          <strong>{selectedRunDetail.run_type === 'normal' ? 'Monthly payroll run' : 'Correction payroll run'} #{selectedRunDetail.id}</strong>
                          <div className="salary-studio-record-meta">{selectedRunDetail.policy_name} · {formatMonthYear(selectedRunDetail.year, selectedRunDetail.month)}</div>
                        </div>
                        <span className={`salary-studio-badge ${statusToneClass(selectedRunDetail.status)}`}>{selectedRunDetail.status}</span>
                      </div>

                      {selectedRunSummary ? (
                        <div className="salary-studio-metric-grid salary-studio-metric-grid-tight">
                          <MetricCard label="Gross payable" value={formatMoney(selectedRunSummary.total_gross_payable_amount)} tone="accent" />
                          <MetricCard label="Total deductions" value={formatMoney(selectedRunSummary.total_deduction_amount)} />
                          <MetricCard label="Overtime pay" value={formatMoney(selectedRunSummary.total_approved_overtime_pay_amount)} tone="positive" />
                          <MetricCard label="Payable OT" value={formatMinutes(selectedRunSummary.total_payable_ot_minutes)} tone="positive" />
                          <MetricCard label="Carry-forward recovery" value={formatMoney(selectedRunSummary.total_carry_forward_recovery_amount)} />
                        </div>
                      ) : null}

                      <div className="salary-studio-detail-stack">
                        {selectedRunEmployees.map((employeeRun) => (
                          <details key={employeeRun.id} className="salary-studio-detail-card" open={selectedRunEmployees.length <= 2}>
                            <summary>
                              <span>{employeeRun.employee_name || 'Employee'}{employeeRun.worker_id ? ` (${employeeRun.worker_id})` : ''}</span>
                              <strong>{formatMoney(employeeRun.gross_payable_amount)}</strong>
                            </summary>
                            <div className="salary-studio-detail-grid">
                              <div className="salary-studio-detail-copy">
                                <span>Base {formatMoney(employeeRun.monthly_base_wage_amount)}</span>
                                <span>Attendance bonus {formatMoney(employeeRun.attendance_bonus_amount)}</span>
                                <span>Late {formatMinutes(employeeRun.late_minutes_total)}</span>
                                <span>Early leave {formatMinutes(employeeRun.early_departure_minutes_total)}</span>
                                <span>Absent {formatMinutes(employeeRun.absent_minutes_total)}</span>
                                <span>Approved OT {formatMinutes(employeeRun.approved_ot_minutes_total)}</span>
                                <span>OT offset {formatMinutes(employeeRun.approved_ot_offset_minutes_total)}</span>
                                <span>Payable OT {formatMinutes(employeeRun.payable_ot_minutes_total)}</span>
                                <span>Time bank open {formatMinutes(employeeRun.opening_time_bank_minutes_total)}</span>
                                <span>Time bank settled {formatMinutes(employeeRun.settled_time_bank_minutes_total)}</span>
                                <span>Time bank close {formatMinutes(employeeRun.closing_time_bank_minutes_total)}</span>
                                <span>Project bonus {formatMoney(employeeRun.project_bonus_amount)}</span>
                              </div>
                              <div className="salary-studio-component-list">
                                {employeeRun.components.map((component) => (
                                  <div key={component.id} className="salary-studio-component-item">
                                    <span>{component.label}</span>
                                    <strong>{formatMoney(component.amount)}</strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>

                      {selectedRunDetail.correction_deltas.length > 0 ? (
                        <div className="salary-studio-table-shell">
                          <table className="salary-studio-table">
                            <thead>
                              <tr>
                                <th>Employee</th>
                                <th>Previous</th>
                                <th>Corrected</th>
                                <th>Delta</th>
                                <th>Settlement</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRunDetail.correction_deltas.map((delta) => (
                                <tr key={delta.id}>
                                  <td>{delta.employee_name || 'Employee'}<span className="salary-studio-table-meta">{delta.worker_id || 'No worker id'}</span></td>
                                  <td>{formatMoney(delta.previous_gross_payable_amount)}</td>
                                  <td>{formatMoney(delta.corrected_gross_payable_amount)}</td>
                                  <td>{formatMoney(delta.delta_amount)}</td>
                                  <td>{delta.settlement_strategy}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="salary-studio-empty-state">Generate or select a payroll run to inspect formulas, line items, and correction deltas.</div>
                  )}
                </div>
              </div>
            </article>
          </div>

          <div className="salary-studio-column-side">
            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Month readiness"
                title="Review the blockers before you lock payroll."
                copy="This checklist stays visible while you work so unresolved setup or attendance gaps are obvious before the month is frozen."
              />
              <div className="salary-studio-card-list salary-studio-card-list-tight">
                <div className="salary-studio-record-card">
                  <div className="salary-studio-record-topline"><strong>Active policy</strong><span className={`salary-studio-badge ${currentPolicy ? 'salary-studio-badge-positive' : 'salary-studio-badge-danger'}`}>{currentPolicy ? 'Ready' : 'Missing'}</span></div>
                  <div className="salary-studio-record-meta">{currentPolicy ? currentPolicy.name : 'Create or activate a policy for this month.'}</div>
                </div>
                <div className="salary-studio-record-card">
                  <div className="salary-studio-record-topline"><strong>Compensation coverage</strong><span className={`salary-studio-badge ${compensationProfiles.length >= attendanceSummaries.length && attendanceSummaries.length > 0 ? 'salary-studio-badge-positive' : 'salary-studio-badge-accent'}`}>{compensationProfiles.length}/{attendanceSummaries.length || employeeOptions.length}</span></div>
                  <div className="salary-studio-record-meta">Profiles that can resolve monthly base wage for the selected month.</div>
                </div>
                <div className="salary-studio-record-card">
                  <div className="salary-studio-record-topline"><strong>Attendance summaries</strong><span className={`salary-studio-badge ${attendanceSummaries.length > 0 ? 'salary-studio-badge-positive' : 'salary-studio-badge-danger'}`}>{attendanceSummaries.length > 0 ? 'Ready' : 'Missing'}</span></div>
                  <div className="salary-studio-record-meta">Payroll now requires finalized attendance coverage for every active employee.</div>
                </div>
                <div className="salary-studio-record-card">
                  <div className="salary-studio-record-topline"><strong>Pending adjustments</strong><span className={`salary-studio-badge ${pendingAdjustments === 0 ? 'salary-studio-badge-positive' : 'salary-studio-badge-accent'}`}>{pendingAdjustments}</span></div>
                  <div className="salary-studio-record-meta">Approve or defer manual items before the run is locked.</div>
                </div>
              </div>
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Carry-forward context"
                title="Keep recoveries visible during correction review."
                copy="Correction overpayments become open balances for a later month instead of silent history edits."
              />
              <div className="salary-studio-record-stats">
                <span>{openCarryForwardCount} open balances</span>
                <span>{outstandingCarryForwardAmount}</span>
              </div>
              <div className="salary-studio-card-list salary-studio-card-list-tight">
                {carryForwardBalances.slice(0, 6).map((balance) => (
                  <article key={balance.id} className="salary-studio-record-card">
                    <div className="salary-studio-record-topline">
                      <strong>{balance.employee_name || 'Employee'}</strong>
                      <span className={`salary-studio-badge ${statusToneClass(balance.status)}`}>{balance.status}</span>
                    </div>
                    <div className="salary-studio-record-stats">
                      <span>Apply from {formatMonthYear(balance.apply_from_year, balance.apply_from_month)}</span>
                      <span>{formatMoney(balance.remaining_amount)}</span>
                    </div>
                  </article>
                ))}
                {carryForwardBalances.length === 0 ? <div className="salary-studio-empty-state">No open recovery balances.</div> : null}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activeView === 'reports' ? (
        <section className="salary-studio-main-grid">
          <div className="salary-studio-column-main">
            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Trend chart"
                title="Track workforce cost across recent locked months."
                copy="Monthly summaries now persist in the database, so management can see the payroll curve instead of re-deriving totals from raw components every time."
              />
              <SalaryTrendChart records={monthlySummaries} />
              <div className="salary-studio-table-shell">
                <table className="salary-studio-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Headcount</th>
                      <th>Gross payable</th>
                      <th>Late minutes</th>
                      <th>Approved OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummaries.map((summary) => (
                      <tr key={`${summary.year}-${summary.month}`}>
                        <td>{formatMonthYear(summary.year, summary.month)}<span className="salary-studio-table-meta">{summary.policy_name}</span></td>
                        <td>{summary.headcount_paid}</td>
                        <td>{formatMoney(summary.total_gross_payable_amount)}</td>
                        <td>{formatMinutes(summary.total_late_minutes)}</td>
                        <td>{formatMinutes(summary.total_approved_ot_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Workforce preview"
                title="Preview the management report in-browser before export."
                copy="The browser preview uses the same structured data that feeds final report artifacts, so workforce totals and outliers stay consistent."
              />
              {workforceReportPreview ? (
                <>
                  <div className="salary-studio-metric-grid salary-studio-metric-grid-tight">
                    <MetricCard label="Headcount paid" value={String(workforceReportPreview.monthly_summary.headcount_paid)} />
                    <MetricCard label="Gross payable" value={formatMoney(workforceReportPreview.monthly_summary.total_gross_payable_amount)} tone="accent" />
                    <MetricCard label="Total deductions" value={formatMoney(workforceReportPreview.monthly_summary.total_deduction_amount)} />
                    <MetricCard label="Payable OT" value={formatMinutes(workforceReportPreview.monthly_summary.total_payable_ot_minutes)} tone="positive" />
                  </div>
                  <div className="salary-studio-table-shell">
                    <table className="salary-studio-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Gross payable</th>
                          <th>Late</th>
                          <th>Approved OT</th>
                          <th>Payable OT</th>
                          <th>Time bank close</th>
                          <th>Project bonus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workforceReportPreview.employee_rows.map((row) => (
                          <tr key={`${row.employee_name}-${row.gross_payable_amount}`}>
                            <td>{row.employee_name}</td>
                            <td>{formatMoney(row.gross_payable_amount)}</td>
                            <td>{formatMinutes(row.late_minutes_total)}</td>
                            <td>{formatMinutes(row.approved_ot_minutes_total)}</td>
                            <td>{formatMinutes(row.payable_ot_minutes_total)}</td>
                            <td>{formatMinutes(row.closing_time_bank_minutes_total)}</td>
                            <td>{formatMoney(row.project_bonus_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="salary-studio-empty-state">Select a payroll run to preview the workforce report.</div>
              )}
            </article>

            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Employee preview"
                title="Inspect the employee-facing report before export."
                copy="Denied overtime reasons, leave minutes, rounding, and component rows remain visible here so the payslip stays explainable before you publish it."
              />
              {employeeReportPreview ? (
                <>
                  <div className="salary-studio-record-topline">
                    <div>
                      <strong>{employeeReportPreview.employee.name}</strong>
                      <div className="salary-studio-record-meta">{employeeReportPreview.employee.worker_id || 'No worker id'} · {formatMonthYear(employeeReportPreview.payroll_run.year, employeeReportPreview.payroll_run.month)}</div>
                    </div>
                    <strong>{formatMoney(employeeReportPreview.gross_payable_amount)}</strong>
                  </div>
                  <div className="salary-studio-metric-grid salary-studio-metric-grid-tight">
                    <MetricCard label="Late minutes" value={formatMinutes(employeeReportPreview.attendance_summary.late_minutes_total)} />
                    <MetricCard label="Payable OT" value={formatMinutes(employeeReportPreview.attendance_summary.payable_ot_minutes_total)} tone="positive" />
                    <MetricCard label="Time bank close" value={formatMinutes(employeeReportPreview.attendance_summary.closing_time_bank_minutes_total)} />
                    <MetricCard label="Gross before rounding" value={formatMoney(employeeReportPreview.gross_before_rounding_amount)} />
                    <MetricCard label="Rounding adjustment" value={formatSignedMoney(employeeReportPreview.rounding_adjustment_amount)} tone="accent" />
                  </div>
                  <div className="salary-studio-table-shell">
                    <table className="salary-studio-table">
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Amount</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeReportPreview.components.map((component) => (
                          <tr key={`${component.code}-${component.label}`}>
                            <td>{component.label}</td>
                            <td>{formatMoney(component.amount)}</td>
                            <td>{component.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="salary-studio-dual-list">
                    <div className="salary-studio-detail-card">
                      <strong>Leave audit</strong>
                      <div className="salary-studio-list-rows">
                        {employeeReportPreview.leave_records.map((record) => (
                          <div key={`${record.leave_date}-${record.submission_status}`} className="salary-studio-list-row">
                            <span>{record.leave_date} · {record.submission_status}</span>
                            <strong>{formatMinutes(record.leave_minutes)}</strong>
                          </div>
                        ))}
                        {employeeReportPreview.leave_records.length === 0 ? <div className="salary-studio-empty-state">No leave records in this payroll month.</div> : null}
                      </div>
                    </div>
                    <div className="salary-studio-detail-card">
                      <strong>Overtime audit</strong>
                      <div className="salary-studio-list-rows">
                        {employeeReportPreview.overtime_decisions.map((decision) => (
                          <div key={`${decision.attendance_date}-${decision.attendance_shift}`} className="salary-studio-list-row">
                            <span>{decision.attendance_date} · {decision.status}</span>
                            <strong>{formatMinutes(decision.approved_ot_minutes)}</strong>
                          </div>
                        ))}
                        {employeeReportPreview.overtime_decisions.length === 0 ? <div className="salary-studio-empty-state">No overtime decisions in this payroll month.</div> : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="salary-studio-empty-state">Choose an employee in the report vault to preview the employee report.</div>
              )}
            </article>
          </div>

          <div className="salary-studio-column-side">
            <article className="salary-studio-panel card card-glass">
              <SectionTitle
                eyebrow="Report vault"
                title="Generate PDF and JPG artifacts from the selected run."
                copy="Preview in the browser, then export the exact same run data into workforce or employee artifacts stored under the Django media folder."
              />
              <form
                className="salary-studio-form-grid salary-studio-form-grid-compact"
                onSubmit={(event) => {
                  event.preventDefault();
                  void performAction('Generating payroll reports', generateReport);
                }}
              >
                <label className="salary-studio-field"><span>Run</span><select className="input" value={selectedRunId || ''} onChange={(event) => setSelectedRunId(Number(event.target.value) || null)}><option value="">Select run</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.run_type} #{run.id} · {run.status}</option>)}</select></label>
                <label className="salary-studio-field"><span>Report type</span><select className="input" value={reportForm.reportType} onChange={(event) => setReportForm({ ...reportForm, reportType: event.target.value as 'workforce_management' | 'employee' })}><option value="workforce_management">Workforce management</option><option value="employee">Employee pack</option></select></label>
                <label className="salary-studio-field"><span>Employee</span><select className="input" value={reportForm.employeeId} onChange={(event) => setReportForm({ ...reportForm, employeeId: event.target.value })} disabled={reportForm.reportType !== 'employee'}><option value="">Select employee</option>{selectedRunEmployees.map((employeeRun) => <option key={employeeRun.employee} value={employeeRun.employee}>{employeeRun.employee_name || 'Employee'}</option>)}</select></label>
                <div className="salary-studio-form-actions"><button className="btn btn-primary" type="submit" disabled={selectedRunId === null}>Generate artifacts</button></div>
              </form>

              <div className="salary-studio-card-list salary-studio-card-list-tight">
                {(selectedRunDetail?.report_artifacts || []).map((artifact) => (
                  <a key={artifact.id} className="salary-studio-record-card salary-studio-link-card" href={normalizeReportUrl(artifact.url)} target="_blank" rel="noreferrer">
                    <div className="salary-studio-record-topline">
                      <strong>{artifact.report_type === 'employee' ? (artifact.employee_name || 'Employee report') : 'Workforce report'}</strong>
                      <span className={`salary-studio-badge ${statusToneClass(artifact.format)}`}>{artifact.format.toUpperCase()}</span>
                    </div>
                    <div className="salary-studio-record-meta">Generated {artifact.generated_at ? new Date(artifact.generated_at).toLocaleString() : 'recently'}</div>
                  </a>
                ))}
                {selectedRunDetail && selectedRunDetail.report_artifacts.length === 0 ? <div className="salary-studio-empty-state">No artifacts yet for the selected run.</div> : null}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {isLoading ? <div className="salary-studio-loading">Loading payroll command center...</div> : null}
    </div>
  );
}