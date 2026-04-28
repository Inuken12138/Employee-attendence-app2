'use client';

import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '../../../hooks/useErrorPopup';

type ShiftStatus = 'present' | 'absent' | 'missing' | 'off' | 'paid_rest' | 'approved_leave' | 'unapproved_leave';
type ShiftKey = 'morning' | 'afternoon';
type ShiftTone = 'locked' | 'missing' | 'resolved' | 'paid-rest' | 'approved-leave' | 'unapproved-leave';
type LeaveSubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'recorded_unapproved';
type LeaveDurationUnit = 'full_day' | 'half_day' | 'hour' | 'custom_minutes';
type OvertimeDecisionStatus = 'pending' | 'approved' | 'denied' | 'partially_approved';
type LeaveLinkedShift = '' | ShiftKey;
type PaidRestSubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
type PaidRestDurationUnit = 'full_day' | 'half_day';

interface ShiftPayload {
  in: string;
  out: string;
  status: ShiftStatus;
}

interface DayRecord {
  rawLogs: string[];
  morning: ShiftPayload;
  afternoon: ShiftPayload;
  editable: boolean;
}

interface PayrollRosterScheduleEntryPayload {
  week_index?: number;
  day_of_week?: number;
  is_working?: boolean;
  morning_in?: string;
  morning_out?: string;
  afternoon_in?: string;
  afternoon_out?: string;
}

interface PayrollRosterAssignmentPayload {
  template_id?: number | null;
  template_name?: string | null;
  cycle_length_weeks?: number | null;
  effective_start_date?: string | null;
  schedule?: PayrollRosterScheduleEntryPayload[];
}

interface ResolvedRosterDay {
  templateName: string | null;
  weekIndex: number;
  dayOfWeek: number;
  weekdayLabel: string;
  isWorking: boolean;
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  afternoonOut: string;
}

interface AttendanceEmployee {
  employeeDbId?: number | null;
  workerId: string | null;
  employeeName: string | null;
  department: string | null;
  rosterAssignment: PayrollRosterAssignmentPayload | null;
  days: Record<string, DayRecord>;
}

interface ResolvePopupState {
  employeeIndex: number;
  day: number;
  step: ShiftKey;
  draftIn: string;
  draftOut: string;
  draftStatus: ShiftStatus;
}

interface EmployeeDirectoryItem {
  id: number;
  name: string;
  worker_id?: string | null;
  is_active?: boolean;
}

interface LeaveRecord {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  leave_date: string;
  leave_start_time?: string;
  leave_end_time?: string;
  submission_status: LeaveSubmissionStatus;
  duration_unit: LeaveDurationUnit;
  duration_value: number;
  leave_minutes: number;
  employee_reason?: string;
  manager_note?: string;
  linked_attendance_shift?: LeaveLinkedShift;
}

interface LeaveRecordsResponse {
  records: LeaveRecord[];
}

interface LeaveFormState {
  employeeId: string;
  leaveDate: string;
  durationUnit: LeaveDurationUnit;
  linkedAttendanceShift: LeaveLinkedShift;
  leaveStartTime: string;
  leaveEndTime: string;
  durationValue: string;
  submissionStatus: LeaveSubmissionStatus;
  employeeReason: string;
  managerNote: string;
}

interface PaidRestRequest {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  department?: number | null;
  department_name?: string | null;
  rest_date: string;
  duration_unit: PaidRestDurationUnit;
  linked_attendance_shift?: LeaveLinkedShift;
  paid_rest_days: string;
  submission_status: PaidRestSubmissionStatus;
  employee_reason?: string;
  manager_note?: string;
}

interface PaidRestRequestsResponse {
  records: PaidRestRequest[];
}

interface PaidRestBalance {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  department?: number | null;
  department_name?: string | null;
  year: number;
  month: number;
  opening_balance_days: string;
  granted_days: string;
  used_days: string;
  closing_balance_days: string;
  carry_forward_cap_days: string;
}

interface PaidRestBalancesResponse {
  records: PaidRestBalance[];
}

interface PaidRestFormState {
  employeeId: string;
  restDate: string;
  durationUnit: PaidRestDurationUnit;
  linkedAttendanceShift: LeaveLinkedShift;
  submissionStatus: PaidRestSubmissionStatus;
  employeeReason: string;
  managerNote: string;
}

interface OvertimeDecisionSegment {
  id?: number;
  segment_start_time: string;
  segment_end_time: string;
  segment_minutes?: number;
  status: 'approved' | 'denied';
  note?: string;
}

interface OvertimeDecision {
  id: number;
  employee: number;
  employee_name?: string | null;
  worker_id?: string | null;
  attendance_date: string;
  attendance_shift: ShiftKey;
  roster_start_time: string;
  roster_end_time: string;
  actual_checkout_time: string;
  potential_ot_minutes: number;
  approved_ot_minutes: number;
  denied_ot_minutes: number;
  status: OvertimeDecisionStatus;
  decision_reason?: string;
  narrowed_decision_enabled?: boolean;
  segments?: OvertimeDecisionSegment[];
}

interface OvertimeDecisionsResponse {
  records: OvertimeDecision[];
}

interface OvertimeCandidate {
  employeeId: number;
  employeeIndex: number;
  employeeName: string | null;
  workerId: string | null;
  attendanceDate: string;
  day: number;
  shiftKey: ShiftKey;
  rosterStartTime: string;
  rosterEndTime: string;
  actualCheckoutTime: string;
  potentialMinutes: number;
  decision: OvertimeDecision | null;
}

interface OvertimePopupState {
  candidate: OvertimeCandidate;
  draftStatus: OvertimeDecisionStatus;
  draftReason: string;
  narrowed: boolean;
  approvedStart: string;
  approvedEnd: string;
}

interface ParsedEmployeePayload {
  employee_db_id?: number | null;
  employee_id?: string | null;
  worker_id?: string | null;
  employee_name?: string | null;
  department?: string | null;
  roster_assignment?: PayrollRosterAssignmentPayload | null;
  day_logs?: Record<string, string[]>;
}

interface ParsedAttendanceSourceFile {
  name: string;
  status: 'parsed' | 'skipped';
  employees_count: number;
  warning?: string | null;
}

interface ParsedAttendanceResponse {
  year: number;
  month: number;
  days_in_month: number;
  status?: string;
  date_range_start?: string | null;
  date_range_end?: string | null;
  source_date_range?: string | null;
  sheet_generated_at?: string | null;
  employees: ParsedEmployeePayload[];
  warnings?: string[];
  source_files?: ParsedAttendanceSourceFile[];
}

interface SavedShiftPayload {
  in?: string;
  out?: string;
  status?: ShiftStatus;
}

interface SavedDayPayload {
  raw_logs?: string[];
  morning?: SavedShiftPayload;
  afternoon?: SavedShiftPayload;
}

interface SavedEmployeePayload {
  employee_db_id?: number | null;
  worker_id?: string | null;
  employee_name?: string | null;
  department?: string | null;
  roster_assignment?: PayrollRosterAssignmentPayload | null;
  days?: Record<string, SavedDayPayload>;
}

interface SavedAttendanceResponse {
  year: number;
  month: number;
  days_in_month: number;
  status?: string;
  date_range_start?: string | null;
  date_range_end?: string | null;
  source_date_range?: string | null;
  sheet_generated_at?: string | null;
  employees: SavedEmployeePayload[];
}

interface AttendanceHistoryEntry {
  year: number;
  month: number;
  status: 'draft' | 'final';
  updated_at?: string | null;
  label: string;
}

interface AttendanceHistoryResponse {
  records: AttendanceHistoryEntry[];
}

interface SaveDayPayload {
  raw_logs: string[];
  morning: ShiftPayload;
  afternoon: ShiftPayload;
}

interface AttendanceMeta {
  year: number;
  month: number;
  daysInMonth: number;
  status: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  sourceDateRange: string | null;
  sheetGeneratedAt: string | null;
}

interface TimePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface AttendanceShiftCardProps {
  title: string;
  shift: ShiftPayload;
  tone: ShiftTone;
  canEdit: boolean;
  onOpen: () => void;
}

interface AttendanceDayCellProps {
  dayRecord: DayRecord;
  rosterDay: ResolvedRosterDay | null;
  employeeIndex: number;
  day: number;
  editMode: boolean;
  onOpenResolvePopup: (employeeIndex: number, day: number, step: ShiftKey) => void;
  morningOvertime: OvertimeCandidate | null;
  afternoonOvertime: OvertimeCandidate | null;
  onOpenOvertimePopup: (candidate: OvertimeCandidate) => void;
}

interface AttendanceEmployeeRowProps {
  employee: AttendanceEmployee;
  attendanceMeta: AttendanceMeta;
  employeeIndex: number;
  dayNumbers: number[];
  editMode: boolean;
  onOpenResolvePopup: (employeeIndex: number, day: number, step: ShiftKey) => void;
  overtimeDecisionMap: Map<string, OvertimeDecision>;
  onOpenOvertimePopup: (candidate: OvertimeCandidate) => void;
}

const PAYROLL_API_BASE = 'http://localhost:8000/api/payroll';
const ATTENDANCE_API_BASE = `${PAYROLL_API_BASE}/attendance-records`;
const LEAVES_API_BASE = `${PAYROLL_API_BASE}/leaves`;
const PAID_REST_API_BASE = `${PAYROLL_API_BASE}/paid-rest`;
const PAID_REST_BALANCES_API_BASE = `${PAYROLL_API_BASE}/paid-rest-balances`;
const OVERTIME_API_BASE = `${PAYROLL_API_BASE}/overtime-decisions`;
const EMPLOYEES_API_BASE = 'http://localhost:8000/api/employees/';
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_PRESETS = ['00', '05', '10', '15', '30', '45'];
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const emptyShift = (): ShiftPayload => ({ in: '', out: '', status: 'missing' });
const buildBlankDayRecord = (): DayRecord => ({
  rawLogs: [],
  morning: emptyShift(),
  afternoon: emptyShift(),
  editable: true,
});

const createInitialLeaveForm = (year: number, month: number): LeaveFormState => ({
  employeeId: '',
  leaveDate: buildIsoDate(year, month, 1),
  durationUnit: 'full_day',
  linkedAttendanceShift: '',
  leaveStartTime: '',
  leaveEndTime: '',
  durationValue: '',
  submissionStatus: 'submitted',
  employeeReason: '',
  managerNote: '',
});

const createInitialPaidRestForm = (year: number, month: number): PaidRestFormState => ({
  employeeId: '',
  restDate: buildIsoDate(year, month, 1),
  durationUnit: 'full_day',
  linkedAttendanceShift: '',
  submissionStatus: 'submitted',
  employeeReason: '',
  managerNote: '',
});

const getErrorMessage = (data: unknown): string | undefined => {
  const flattenErrors = (value: unknown): string | undefined => {
    if (!value) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => flattenErrors(item)).filter(Boolean).join(' ');
    }
    if (typeof value === 'object') {
      const messages = Object.entries(value as Record<string, unknown>)
        .map(([key, nestedValue]) => {
          const nestedMessage = flattenErrors(nestedValue);
          return nestedMessage ? `${key}: ${nestedMessage}` : '';
        })
        .filter(Boolean)
        .join(' ');
      return messages || undefined;
    }
    return undefined;
  };

  if (data && typeof data === 'object' && 'error' in data) {
    return flattenErrors((data as { error?: unknown }).error);
  }
  return flattenErrors(data);
};

const getDaysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const buildIsoDate = (year: number, month: number, day: number) => (
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const buildAttendanceMeta = (
  data: ParsedAttendanceResponse | SavedAttendanceResponse,
  status: string,
): AttendanceMeta => {
  const daysInMonth = data.days_in_month || getDaysInMonth(data.year, data.month);
  return {
    year: data.year,
    month: data.month,
    daysInMonth,
    status: data.status || status,
    dateRangeStart: data.date_range_start || buildIsoDate(data.year, data.month, 1),
    dateRangeEnd: data.date_range_end || buildIsoDate(data.year, data.month, daysInMonth),
    sourceDateRange: data.source_date_range || null,
    sheetGeneratedAt: data.sheet_generated_at || null,
  };
};

const buildUtcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

const getWeekdayIndex = (utcDate: Date) => (utcDate.getUTCDay() + 6) % 7;

const getCalendarDayMeta = (year: number, month: number, day: number) => {
  const utcDate = buildUtcDate(year, month, day);
  const weekdayIndex = getWeekdayIndex(utcDate);
  return {
    dateLabel: `${MONTH_LABELS[month - 1]} ${day}`,
    weekdayLabel: WEEKDAY_LABELS[weekdayIndex],
    weekdayShort: WEEKDAY_LABELS[weekdayIndex].slice(0, 3),
    isWeekend: weekdayIndex >= 5,
  };
};

const coerceShiftStatus = (value: unknown): ShiftStatus => {
  if (
    value === 'present'
    || value === 'absent'
    || value === 'missing'
    || value === 'off'
    || value === 'paid_rest'
    || value === 'approved_leave'
    || value === 'unapproved_leave'
  ) {
    return value;
  }
  return 'missing';
};

const timeToMinutes = (value: string) => {
  const normalizedValue = normalizeTimeValue(value);
  if (!normalizedValue) {
    return null;
  }

  const [hourText, minuteText] = normalizedValue.split(':');
  return Number.parseInt(hourText, 10) * 60 + Number.parseInt(minuteText, 10);
};

const isOverlayProtectedStatus = (status: ShiftStatus) => (
  status === 'approved_leave' || status === 'unapproved_leave' || status === 'paid_rest'
);

const formatMinuteDuration = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0m';
  }

  const hourPortion = Math.floor(minutes / 60);
  const minutePortion = minutes % 60;
  if (hourPortion > 0 && minutePortion > 0) {
    return `${hourPortion}h ${minutePortion}m`;
  }
  if (hourPortion > 0) {
    return `${hourPortion}h`;
  }
  return `${minutePortion}m`;
};

const getLeaveStatusLabel = (status: LeaveSubmissionStatus) => {
  switch (status) {
    case 'draft':
      return 'Draft leave';
    case 'submitted':
      return 'Pending leave';
    case 'approved':
      return 'Approved leave';
    case 'rejected':
      return 'Rejected leave';
    case 'recorded_unapproved':
      return 'Unapproved leave';
    default:
      return 'Leave';
  }
};

const getPaidRestStatusLabel = (status: PaidRestSubmissionStatus) => {
  switch (status) {
    case 'draft':
      return 'Draft paid rest';
    case 'submitted':
      return 'Pending paid rest';
    case 'approved':
      return 'Approved paid rest';
    case 'rejected':
      return 'Rejected paid rest';
    default:
      return 'Paid rest';
  }
};

const getLeaveShiftTargets = (leaveRecord: LeaveRecord): ShiftKey[] => {
  if (leaveRecord.linked_attendance_shift === 'morning' || leaveRecord.linked_attendance_shift === 'afternoon') {
    return [leaveRecord.linked_attendance_shift];
  }

  if (leaveRecord.duration_unit === 'full_day') {
    return ['morning', 'afternoon'];
  }

  const startMinutes = timeToMinutes(String(leaveRecord.leave_start_time || ''));
  const endMinutes = timeToMinutes(String(leaveRecord.leave_end_time || ''));
  if (startMinutes === null || endMinutes === null) {
    return leaveRecord.duration_unit === 'half_day' ? ['morning'] : ['morning', 'afternoon'];
  }

  const targets: ShiftKey[] = [];
  if (startMinutes < 12 * 60) {
    targets.push('morning');
  }
  if (endMinutes > 13 * 60 || startMinutes >= 12 * 60) {
    targets.push('afternoon');
  }

  return targets.length > 0 ? targets : ['morning'];
};

const getPaidRestShiftTargets = (paidRestRequest: PaidRestRequest): ShiftKey[] => {
  if (paidRestRequest.linked_attendance_shift === 'morning' || paidRestRequest.linked_attendance_shift === 'afternoon') {
    return [paidRestRequest.linked_attendance_shift];
  }
  return ['morning', 'afternoon'];
};

const buildLeaveOverlay = (
  sourceEmployees: AttendanceEmployee[],
  leaveRecords: LeaveRecord[],
  year: number,
  month: number,
) => {
  const overlayLookup = new Map<string, LeaveRecord[]>();
  leaveRecords.forEach((leaveRecord) => {
    if (leaveRecord.submission_status !== 'approved' && leaveRecord.submission_status !== 'recorded_unapproved') {
      return;
    }

    const key = `${leaveRecord.employee}|${leaveRecord.leave_date}`;
    const current = overlayLookup.get(key) || [];
    current.push(leaveRecord);
    overlayLookup.set(key, current);
  });

  return sourceEmployees.map((employee) => {
    if (!employee.employeeDbId) {
      return employee;
    }

    const nextDays: Record<string, DayRecord> = {};
    Object.entries(employee.days).forEach(([dayKey, dayRecord]) => {
      const dateKey = `${employee.employeeDbId}|${buildIsoDate(year, month, Number(dayKey))}`;
      const matchingLeaveRecords = overlayLookup.get(dateKey) || [];
      if (matchingLeaveRecords.length === 0) {
        nextDays[dayKey] = dayRecord;
        return;
      }

      const nextDayRecord: DayRecord = {
        ...dayRecord,
        morning: { ...dayRecord.morning },
        afternoon: { ...dayRecord.afternoon },
      };

      matchingLeaveRecords.forEach((leaveRecord) => {
        const shiftStatus: ShiftStatus = leaveRecord.submission_status === 'approved' ? 'approved_leave' : 'unapproved_leave';
        getLeaveShiftTargets(leaveRecord).forEach((shiftKey) => {
          const shift = nextDayRecord[shiftKey];
          if (shift.status === 'present' && normalizeTimeValue(shift.in) && normalizeTimeValue(shift.out)) {
            return;
          }

          nextDayRecord[shiftKey] = {
            ...shift,
            status: shiftStatus,
            in: '',
            out: '',
          };
        });
      });

      nextDays[dayKey] = nextDayRecord;
    });

    return {
      ...employee,
      days: nextDays,
    };
  });
};

const buildPaidRestOverlay = (
  sourceEmployees: AttendanceEmployee[],
  paidRestRequests: PaidRestRequest[],
  year: number,
  month: number,
) => {
  const overlayLookup = new Map<string, PaidRestRequest[]>();
  paidRestRequests.forEach((paidRestRequest) => {
    if (paidRestRequest.submission_status !== 'approved') {
      return;
    }

    const key = `${paidRestRequest.employee}|${paidRestRequest.rest_date}`;
    const current = overlayLookup.get(key) || [];
    current.push(paidRestRequest);
    overlayLookup.set(key, current);
  });

  return sourceEmployees.map((employee) => {
    if (!employee.employeeDbId) {
      return employee;
    }

    const nextDays: Record<string, DayRecord> = {};
    Object.entries(employee.days).forEach(([dayKey, dayRecord]) => {
      const dateKey = `${employee.employeeDbId}|${buildIsoDate(year, month, Number(dayKey))}`;
      const matchingRequests = overlayLookup.get(dateKey) || [];
      if (matchingRequests.length === 0) {
        nextDays[dayKey] = dayRecord;
        return;
      }

      const nextDayRecord: DayRecord = {
        ...dayRecord,
        morning: { ...dayRecord.morning },
        afternoon: { ...dayRecord.afternoon },
      };

      matchingRequests.forEach((paidRestRequest) => {
        getPaidRestShiftTargets(paidRestRequest).forEach((shiftKey) => {
          nextDayRecord[shiftKey] = {
            ...nextDayRecord[shiftKey],
            status: 'paid_rest',
            in: '',
            out: '',
          };
        });
      });

      nextDays[dayKey] = nextDayRecord;
    });

    return {
      ...employee,
      days: nextDays,
    };
  });
};

const formatDayBalance = (value: string | number) => {
  const parsedValue = Number.parseFloat(String(value || 0));
  if (!Number.isFinite(parsedValue)) {
    return '0';
  }
  return Number.isInteger(parsedValue) ? String(parsedValue) : parsedValue.toFixed(2);
};

const buildOvertimeDecisionKey = (employeeId: number, attendanceDate: string, shiftKey: ShiftKey) => (
  `${employeeId}|${attendanceDate}|${shiftKey}`
);

const getOvertimeDecisionLabel = (candidate: OvertimeCandidate) => {
  if (!candidate.decision || candidate.decision.status === 'pending') {
    return `Potential OT ${formatMinuteDuration(candidate.potentialMinutes)}`;
  }

  if (candidate.decision.status === 'approved') {
    return `OT approved ${formatMinuteDuration(candidate.decision.approved_ot_minutes)}`;
  }

  if (candidate.decision.status === 'denied') {
    return `OT denied ${formatMinuteDuration(candidate.decision.denied_ot_minutes)}`;
  }

  return `OT split ${formatMinuteDuration(candidate.decision.approved_ot_minutes)} approved`;
};

const getOvertimeDecisionTone = (candidate: OvertimeCandidate) => {
  if (!candidate.decision || candidate.decision.status === 'pending') {
    return 'pending';
  }
  if (candidate.decision.status === 'approved') {
    return 'approved';
  }
  if (candidate.decision.status === 'denied') {
    return 'denied';
  }
  return 'partial';
};

const buildPartialOvertimeSegments = (
  candidate: OvertimeCandidate,
  approvedStart: string,
  approvedEnd: string,
  denialReason: string,
) => {
  const blockStartMinutes = timeToMinutes(candidate.rosterEndTime);
  const blockEndMinutes = timeToMinutes(candidate.actualCheckoutTime);
  const approvedStartTime = normalizeTimeValue(approvedStart);
  const approvedEndTime = normalizeTimeValue(approvedEnd);
  const approvedStartMinutes = timeToMinutes(approvedStartTime);
  const approvedEndMinutes = timeToMinutes(approvedEndTime);

  if (
    blockStartMinutes === null
    || blockEndMinutes === null
    || approvedStartMinutes === null
    || approvedEndMinutes === null
  ) {
    return null;
  }

  if (
    approvedStartMinutes < blockStartMinutes
    || approvedEndMinutes > blockEndMinutes
    || approvedEndMinutes <= approvedStartMinutes
  ) {
    return null;
  }

  const segments: OvertimeDecisionSegment[] = [];
  if (approvedStartMinutes > blockStartMinutes) {
    segments.push({
      segment_start_time: candidate.rosterEndTime,
      segment_end_time: approvedStartTime,
      status: 'denied',
      note: denialReason,
    });
  }

  segments.push({
    segment_start_time: approvedStartTime,
    segment_end_time: approvedEndTime,
    status: 'approved',
    note: '',
  });

  if (approvedEndMinutes < blockEndMinutes) {
    segments.push({
      segment_start_time: approvedEndTime,
      segment_end_time: candidate.actualCheckoutTime,
      status: 'denied',
      note: denialReason,
    });
  }

  return segments;
};

const normalizeTimeValue = (value: string): string => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return '';
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const splitTimeValue = (value: string) => {
  const normalizedValue = normalizeTimeValue(value) || '00:00';
  const [hour, minute] = normalizedValue.split(':');
  return { hour, minute };
};

const formatTimePreview = (value: string) => {
  const normalizedValue = normalizeTimeValue(value);
  if (!normalizedValue) {
    return '--:--';
  }

  const [hourText, minuteText] = normalizedValue.split(':');
  const hour = Number.parseInt(hourText, 10);
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minuteText} ${meridiem}`;
};

const adjustTimeByMinutes = (value: string, delta: number) => {
  const normalizedValue = normalizeTimeValue(value) || '00:00';
  const [hourText, minuteText] = normalizedValue.split(':');
  const baseMinutes = Number.parseInt(hourText, 10) * 60 + Number.parseInt(minuteText, 10);
  const adjustedMinutes = (baseMinutes + delta + 1440) % 1440;
  const nextHour = Math.floor(adjustedMinutes / 60);
  const nextMinute = adjustedMinutes % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
};

const getSuggestedTime = (step: ShiftKey, field: 'in' | 'out', rosterDay?: ResolvedRosterDay | null) => {
  if (rosterDay?.isWorking) {
    if (step === 'morning') {
      return field === 'in'
        ? normalizeTimeValue(rosterDay.morningIn) || '08:00'
        : normalizeTimeValue(rosterDay.morningOut) || '12:00';
    }

    return field === 'in'
      ? normalizeTimeValue(rosterDay.afternoonIn) || '13:00'
      : normalizeTimeValue(rosterDay.afternoonOut) || '17:00';
  }

  if (step === 'morning') {
    return field === 'in' ? '08:00' : '12:00';
  }
  return field === 'in' ? '13:00' : '17:00';
};

const getShiftLabel = (shift: ShiftPayload) => {
  if (shift.status === 'off') {
    return 'Roster off';
  }

  if (shift.status === 'paid_rest') {
    return 'Paid rest';
  }

  if (shift.status === 'approved_leave') {
    return 'Approved leave';
  }

  if (shift.status === 'unapproved_leave') {
    return 'Unapproved leave';
  }

  if (shift.status === 'absent') {
    return 'Marked absent';
  }

  const checkIn = normalizeTimeValue(shift.in);
  const checkOut = normalizeTimeValue(shift.out);
  if (!checkIn || !checkOut) {
    return 'No logs';
  }

  return `${checkIn} - ${checkOut}`;
};

const getExpectedShiftLabel = (rosterDay: ResolvedRosterDay | null) => {
  if (!rosterDay?.isWorking) {
    return null;
  }

  if (!rosterDay.morningIn || !rosterDay.morningOut || !rosterDay.afternoonIn || !rosterDay.afternoonOut) {
    return null;
  }

  return `${rosterDay.morningIn}-${rosterDay.morningOut} / ${rosterDay.afternoonIn}-${rosterDay.afternoonOut}`;
};

const resolveRosterDay = (
  rosterAssignment: PayrollRosterAssignmentPayload | null,
  year: number,
  month: number,
  day: number,
): ResolvedRosterDay | null => {
  const cycleLengthWeeks = Math.max(1, Math.min(4, Number(rosterAssignment?.cycle_length_weeks) || 0));
  const effectiveStartDate = String(rosterAssignment?.effective_start_date || '').trim();
  const schedule = Array.isArray(rosterAssignment?.schedule) ? rosterAssignment?.schedule || [] : [];
  if (!effectiveStartDate || schedule.length === 0) {
    return null;
  }

  const match = effectiveStartDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const anchorYear = Number.parseInt(match[1], 10);
  const anchorMonth = Number.parseInt(match[2], 10);
  const anchorDay = Number.parseInt(match[3], 10);
  if (!anchorYear || !anchorMonth || !anchorDay) {
    return null;
  }

  const targetDate = buildUtcDate(year, month, day);
  const anchorDate = buildUtcDate(anchorYear, anchorMonth, anchorDay);
  const getWeekStart = (utcDate: Date) => {
    const nextDate = new Date(utcDate.getTime());
    nextDate.setUTCDate(nextDate.getUTCDate() - getWeekdayIndex(utcDate));
    return nextDate;
  };

  const targetWeekStart = getWeekStart(targetDate);
  const anchorWeekStart = getWeekStart(anchorDate);
  const weekDelta = Math.floor((targetWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const weekIndex = ((weekDelta % cycleLengthWeeks) + cycleLengthWeeks) % cycleLengthWeeks + 1;
  const dayOfWeek = getWeekdayIndex(targetDate);

  const entry = schedule.find((candidate) => (
    Number(candidate.week_index) === weekIndex && Number(candidate.day_of_week) === dayOfWeek
  ));
  if (!entry) {
    return null;
  }

  return {
    templateName: rosterAssignment?.template_name || null,
    weekIndex,
    dayOfWeek,
    weekdayLabel: WEEKDAY_LABELS[dayOfWeek],
    isWorking: Boolean(entry.is_working),
    morningIn: normalizeTimeValue(String(entry.morning_in || '')),
    morningOut: normalizeTimeValue(String(entry.morning_out || '')),
    afternoonIn: normalizeTimeValue(String(entry.afternoon_in || '')),
    afternoonOut: normalizeTimeValue(String(entry.afternoon_out || '')),
  };
};

const buildOvertimeCandidate = (
  employee: AttendanceEmployee,
  employeeIndex: number,
  day: number,
  shiftKey: ShiftKey,
  year: number,
  month: number,
  rosterDay: ResolvedRosterDay | null,
  overtimeDecisionMap: Map<string, OvertimeDecision>,
): OvertimeCandidate | null => {
  if (!employee.employeeDbId || !rosterDay?.isWorking) {
    return null;
  }

  const dayRecord = employee.days[String(day)] || buildBlankDayRecord();
  const shift = dayRecord[shiftKey];
  if (shift.status !== 'present') {
    return null;
  }

  const rosterStartTime = shiftKey === 'morning' ? rosterDay.morningIn : rosterDay.afternoonIn;
  const rosterEndTime = shiftKey === 'morning' ? rosterDay.morningOut : rosterDay.afternoonOut;
  const actualCheckoutTime = normalizeTimeValue(shift.out);
  const rosterEndMinutes = timeToMinutes(rosterEndTime);
  const actualCheckoutMinutes = timeToMinutes(actualCheckoutTime);
  if (rosterEndMinutes === null || actualCheckoutMinutes === null || actualCheckoutMinutes <= rosterEndMinutes) {
    return null;
  }

  const attendanceDate = buildIsoDate(year, month, day);
  return {
    employeeId: employee.employeeDbId,
    employeeIndex,
    employeeName: employee.employeeName,
    workerId: employee.workerId,
    attendanceDate,
    day,
    shiftKey,
    rosterStartTime,
    rosterEndTime,
    actualCheckoutTime,
    potentialMinutes: actualCheckoutMinutes - rosterEndMinutes,
    decision: overtimeDecisionMap.get(buildOvertimeDecisionKey(employee.employeeDbId, attendanceDate, shiftKey)) || null,
  };
};

const isRosterOffDay = (dayRecord: DayRecord, rosterDay: ResolvedRosterDay | null) => {
  const hasPersistedOffStatus = dayRecord.morning.status === 'off' && dayRecord.afternoon.status === 'off';
  if (hasPersistedOffStatus) {
    return true;
  }

  return Boolean(
    rosterDay
      && !rosterDay.isWorking
      && dayRecord.rawLogs.length === 0
      && dayRecord.morning.status === 'missing'
      && dayRecord.afternoon.status === 'missing',
  );
};

const dayNeedsResolution = (dayRecord: DayRecord, rosterDay: ResolvedRosterDay | null) => {
  if (isRosterOffDay(dayRecord, rosterDay)) {
    return false;
  }

  return dayRecord.morning.status === 'missing' || dayRecord.afternoon.status === 'missing';
};

const getShiftTone = (dayRecord: DayRecord, shiftKey: ShiftKey): ShiftTone => {
  if (!dayRecord.editable) {
    return 'locked';
  }

  const shift = dayRecord[shiftKey];
  if (shift.status === 'paid_rest') {
    return 'paid-rest';
  }
  if (shift.status === 'approved_leave') {
    return 'approved-leave';
  }
  if (shift.status === 'unapproved_leave') {
    return 'unapproved-leave';
  }
  return shift.status === 'missing' ? 'missing' : 'resolved';
};

const buildDayRecordFromLogs = (logs: string[]): DayRecord => {
  if (logs.length === 4) {
    return {
      rawLogs: logs,
      morning: { in: logs[0], out: logs[1], status: 'present' },
      afternoon: { in: logs[2], out: logs[3], status: 'present' },
      editable: false,
    };
  }

  return {
    rawLogs: logs,
    morning: emptyShift(),
    afternoon: emptyShift(),
    editable: true,
  };
};

const buildDayRecordFromSaved = (dayPayload?: SavedDayPayload): DayRecord => {
  const rawLogs = Array.isArray(dayPayload?.raw_logs) ? dayPayload?.raw_logs || [] : [];
  const morning = dayPayload?.morning || {};
  const afternoon = dayPayload?.afternoon || {};

  return {
    rawLogs,
    morning: {
      in: normalizeTimeValue(String(morning.in || '')),
      out: normalizeTimeValue(String(morning.out || '')),
      status: coerceShiftStatus(morning.status),
    },
    afternoon: {
      in: normalizeTimeValue(String(afternoon.in || '')),
      out: normalizeTimeValue(String(afternoon.out || '')),
      status: coerceShiftStatus(afternoon.status),
    },
    editable: rawLogs.length !== 4,
  };
};

const mapParsedEmployees = (data: ParsedAttendanceResponse): AttendanceEmployee[] => {
  const parsedDayNumbers = Array.from({ length: data.days_in_month || 31 }, (_, index) => index + 1);

  return (data.employees || []).map((employee) => {
    const dayLogs = employee.day_logs || {};
    const days: Record<string, DayRecord> = {};

    parsedDayNumbers.forEach((day) => {
      const logs = Array.isArray(dayLogs[String(day)]) ? dayLogs[String(day)] : [];
      days[String(day)] = buildDayRecordFromLogs(logs);
    });

    return {
      employeeDbId: employee.employee_db_id || null,
      workerId: employee.worker_id || employee.employee_id || null,
      employeeName: employee.employee_name || null,
      department: employee.department || null,
      rosterAssignment: employee.roster_assignment || null,
      days,
    };
  });
};

const mapSavedEmployees = (data: SavedAttendanceResponse): AttendanceEmployee[] => {
  const savedDayNumbers = Array.from({ length: data.days_in_month || 31 }, (_, index) => index + 1);

  return (data.employees || []).map((employee) => {
    const dayMap = employee.days || {};
    const days: Record<string, DayRecord> = {};

    savedDayNumbers.forEach((day) => {
      days[String(day)] = buildDayRecordFromSaved(dayMap[String(day)]);
    });

    return {
      employeeDbId: employee.employee_db_id || null,
      workerId: employee.worker_id || null,
      employeeName: employee.employee_name || null,
      department: employee.department || null,
      rosterAssignment: employee.roster_assignment || null,
      days,
    };
  });
};

function TimePickerField({ label, value, onChange }: TimePickerFieldProps) {
  const { hour, minute } = splitTimeValue(value);

  return (
    <div className="payroll-time-card">
      <div className="payroll-time-card-header">
        <div>
          <div className="payroll-time-label">{label}</div>
          <div className="payroll-time-help">Precise to the minute.</div>
        </div>
        <div className="payroll-time-preview">{formatTimePreview(value)}</div>
      </div>

      <div className="payroll-time-selects">
        <label className="payroll-time-select">
          <span>Hour</span>
          <select
            className="select"
            value={hour}
            onChange={(event) => onChange(`${event.target.value}:${minute}`)}
          >
            {HOUR_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="payroll-time-select">
          <span>Minute</span>
          <select
            className="select"
            value={minute}
            onChange={(event) => onChange(`${hour}:${event.target.value}`)}
          >
            {MINUTE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="payroll-time-quick-actions">
        <button type="button" className="payroll-time-chip" onClick={() => onChange(adjustTimeByMinutes(value, -5))}>-5m</button>
        <button type="button" className="payroll-time-chip" onClick={() => onChange(adjustTimeByMinutes(value, -1))}>-1m</button>
        <button type="button" className="payroll-time-chip" onClick={() => onChange(adjustTimeByMinutes(value, 1))}>+1m</button>
        <button type="button" className="payroll-time-chip" onClick={() => onChange(adjustTimeByMinutes(value, 5))}>+5m</button>
        {MINUTE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="payroll-time-chip payroll-time-chip-muted"
            onClick={() => onChange(`${hour}:${preset}`)}
          >
            :{preset}
          </button>
        ))}
      </div>
    </div>
  );
}

const AttendanceShiftCard = memo(function AttendanceShiftCard({
  title,
  shift,
  tone,
  canEdit,
  onOpen,
}: AttendanceShiftCardProps) {
  return (
    <button
      type="button"
      className={`payroll-shift-card payroll-shift-card-${tone}${canEdit ? ' payroll-shift-card-clickable' : ''}`}
      onClick={onOpen}
      disabled={!canEdit}
    >
      <div className="payroll-shift-title">{title}</div>
      <div className="payroll-shift-value">{getShiftLabel(shift)}</div>
    </button>
  );
});

const AttendanceDayCell = memo(function AttendanceDayCell({
  dayRecord,
  rosterDay,
  employeeIndex,
  day,
  editMode,
  onOpenResolvePopup,
  morningOvertime,
  afternoonOvertime,
  onOpenOvertimePopup,
}: AttendanceDayCellProps) {
  const isOffDay = isRosterOffDay(dayRecord, rosterDay);
  const canEditMorning = editMode && dayRecord.editable && !isOffDay && !isOverlayProtectedStatus(dayRecord.morning.status);
  const canEditAfternoon = editMode && dayRecord.editable && !isOffDay && !isOverlayProtectedStatus(dayRecord.afternoon.status);
  const morningTone = getShiftTone(dayRecord, 'morning');
  const afternoonTone = getShiftTone(dayRecord, 'afternoon');
  const expectedShift = getExpectedShiftLabel(rosterDay);

  if (isOffDay) {
    return (
      <div className="payroll-day-cell payroll-day-cell-off">
        <div className="payroll-off-day-card">
          <div className="payroll-off-day-title">Roster Off</div>
          <div className="payroll-off-day-value">{rosterDay?.weekdayLabel || 'Scheduled off day'}</div>
          <div className="payroll-off-day-copy">No log entry expected.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`payroll-day-cell${dayRecord.editable ? ' payroll-day-cell-editable' : ''}`}>
      <AttendanceShiftCard
        title="Morning"
        shift={dayRecord.morning}
        tone={morningTone}
        canEdit={canEditMorning}
        onOpen={() => onOpenResolvePopup(employeeIndex, day, 'morning')}
      />
      <AttendanceShiftCard
        title="Afternoon"
        shift={dayRecord.afternoon}
        tone={afternoonTone}
        canEdit={canEditAfternoon}
        onOpen={() => onOpenResolvePopup(employeeIndex, day, 'afternoon')}
      />
      {morningOvertime && (
        <button
          type="button"
          className={`payroll-overtime-chip payroll-overtime-chip-${getOvertimeDecisionTone(morningOvertime)}`}
          onClick={() => onOpenOvertimePopup(morningOvertime)}
        >
          Morning · {getOvertimeDecisionLabel(morningOvertime)}
        </button>
      )}
      {afternoonOvertime && (
        <button
          type="button"
          className={`payroll-overtime-chip payroll-overtime-chip-${getOvertimeDecisionTone(afternoonOvertime)}`}
          onClick={() => onOpenOvertimePopup(afternoonOvertime)}
        >
          Afternoon · {getOvertimeDecisionLabel(afternoonOvertime)}
        </button>
      )}
      {dayRecord.rawLogs.length > 0 && (
        <div className="payroll-raw-logs">Sheet logs: {dayRecord.rawLogs.join(' · ')}</div>
      )}
      {expectedShift && (
        <div className="payroll-expected-shift">Expected: {expectedShift}</div>
      )}
      {!expectedShift && rosterDay && !rosterDay.isWorking && (
        <div className="payroll-expected-shift">Roster says this was a scheduled off day.</div>
      )}
    </div>
  );
});

const AttendanceEmployeeRow = memo(function AttendanceEmployeeRow({
  employee,
  attendanceMeta,
  employeeIndex,
  dayNumbers,
  editMode,
  onOpenResolvePopup,
  overtimeDecisionMap,
  onOpenOvertimePopup,
}: AttendanceEmployeeRowProps) {
  return (
    <tr className="payroll-table-row">
      <td>{employee.workerId || '-'}</td>
      <td>{employee.employeeName || '-'}</td>
      <td>{employee.department || '-'}</td>
      {dayNumbers.map((day) => {
        const dayRecord = employee.days[String(day)] || buildBlankDayRecord();
        const rosterDay = resolveRosterDay(employee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, day);
        const morningOvertime = buildOvertimeCandidate(
          employee,
          employeeIndex,
          day,
          'morning',
          attendanceMeta.year,
          attendanceMeta.month,
          rosterDay,
          overtimeDecisionMap,
        );
        const afternoonOvertime = buildOvertimeCandidate(
          employee,
          employeeIndex,
          day,
          'afternoon',
          attendanceMeta.year,
          attendanceMeta.month,
          rosterDay,
          overtimeDecisionMap,
        );

        return (
          <td key={`${employeeIndex}-${day}`} className="payroll-table-cell">
            <AttendanceDayCell
              dayRecord={dayRecord}
              rosterDay={rosterDay}
              employeeIndex={employeeIndex}
              day={day}
              editMode={editMode}
              onOpenResolvePopup={onOpenResolvePopup}
              morningOvertime={morningOvertime}
              afternoonOvertime={afternoonOvertime}
              onOpenOvertimePopup={onOpenOvertimePopup}
            />
          </td>
        );
      })}
    </tr>
  );
});

export default function EmployeePayrollPage() {
  const defaultYear = new Date().getFullYear();
  const defaultMonth = new Date().getMonth() + 1;
  const [attendanceFiles, setAttendanceFiles] = useState<File[]>([]);
  const [uploadMonth, setUploadMonth] = useState(defaultMonth);
  const [uploadYear, setUploadYear] = useState(defaultYear);
  const [attendanceMeta, setAttendanceMeta] = useState<AttendanceMeta | null>(null);
  const [sourceEmployees, setSourceEmployees] = useState<AttendanceEmployee[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsedSourceFiles, setParsedSourceFiles] = useState<ParsedAttendanceSourceFile[]>([]);
  const [employeeDirectory, setEmployeeDirectory] = useState<EmployeeDirectoryItem[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [paidRestRecords, setPaidRestRecords] = useState<PaidRestRequest[]>([]);
  const [paidRestBalances, setPaidRestBalances] = useState<PaidRestBalance[]>([]);
  const [overtimeDecisions, setOvertimeDecisions] = useState<OvertimeDecision[]>([]);
  const [leaveForm, setLeaveForm] = useState<LeaveFormState>(() => createInitialLeaveForm(defaultYear, defaultMonth));
  const [paidRestForm, setPaidRestForm] = useState<PaidRestFormState>(() => createInitialPaidRestForm(defaultYear, defaultMonth));
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(false);
  const [isLoadingPaidRest, setIsLoadingPaidRest] = useState(false);
  const [isLoadingPaidRestBalances, setIsLoadingPaidRestBalances] = useState(false);
  const [isLoadingOvertime, setIsLoadingOvertime] = useState(false);
  const [isLoadingEmployeeDirectory, setIsLoadingEmployeeDirectory] = useState(false);
  const [isSavingFinal, setIsSavingFinal] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [isSavingPaidRest, setIsSavingPaidRest] = useState(false);
  const [isSavingOvertime, setIsSavingOvertime] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [activePopup, setActivePopup] = useState<ResolvePopupState | null>(null);
  const [activeOvertimePopup, setActiveOvertimePopup] = useState<OvertimePopupState | null>(null);
  const { showErrorPopup } = useErrorPopup();

  const activeYear = attendanceMeta?.year || uploadYear;
  const activeMonth = attendanceMeta?.month || uploadMonth;
  const daysInMonth = attendanceMeta?.daysInMonth || 31;
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);
  const employees = useMemo(() => {
    if (!attendanceMeta) {
      return sourceEmployees;
    }
    const leaveOverlayEmployees = buildLeaveOverlay(sourceEmployees, leaveRecords, attendanceMeta.year, attendanceMeta.month);
    return buildPaidRestOverlay(leaveOverlayEmployees, paidRestRecords, attendanceMeta.year, attendanceMeta.month);
  }, [attendanceMeta, leaveRecords, paidRestRecords, sourceEmployees]);
  const finalAttendanceHistory = useMemo(
    () => attendanceHistory.filter((record) => record.status === 'final'),
    [attendanceHistory],
  );
  const draftAttendanceHistory = useMemo(
    () => attendanceHistory.filter((record) => record.status === 'draft'),
    [attendanceHistory],
  );
  const parsedFileCount = useMemo(
    () => parsedSourceFiles.filter((sourceFile) => sourceFile.status === 'parsed').length,
    [parsedSourceFiles],
  );
  const skippedFileCount = useMemo(
    () => parsedSourceFiles.filter((sourceFile) => sourceFile.status === 'skipped').length,
    [parsedSourceFiles],
  );
  const overtimeDecisionMap = useMemo(() => {
    const map = new Map<string, OvertimeDecision>();
    overtimeDecisions.forEach((decision) => {
      map.set(buildOvertimeDecisionKey(decision.employee, decision.attendance_date, decision.attendance_shift), decision);
    });
    return map;
  }, [overtimeDecisions]);
  const overtimeCandidates = useMemo(() => {
    if (!attendanceMeta) {
      return [] as OvertimeCandidate[];
    }

    const candidates: OvertimeCandidate[] = [];
    employees.forEach((employee, employeeIndex) => {
      dayNumbers.forEach((day) => {
        const rosterDay = resolveRosterDay(employee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, day);
        const morningCandidate = buildOvertimeCandidate(
          employee,
          employeeIndex,
          day,
          'morning',
          attendanceMeta.year,
          attendanceMeta.month,
          rosterDay,
          overtimeDecisionMap,
        );
        if (morningCandidate) {
          candidates.push(morningCandidate);
        }

        const afternoonCandidate = buildOvertimeCandidate(
          employee,
          employeeIndex,
          day,
          'afternoon',
          attendanceMeta.year,
          attendanceMeta.month,
          rosterDay,
          overtimeDecisionMap,
        );
        if (afternoonCandidate) {
          candidates.push(afternoonCandidate);
        }
      });
    });

    return candidates;
  }, [attendanceMeta, dayNumbers, employees, overtimeDecisionMap]);

  const hasPendingLeaveDecisions = useMemo(
    () => leaveRecords.some((leaveRecord) => leaveRecord.submission_status === 'draft' || leaveRecord.submission_status === 'submitted'),
    [leaveRecords],
  );
  const hasPendingPaidRestDecisions = useMemo(
    () => paidRestRecords.some((paidRestRecord) => paidRestRecord.submission_status === 'draft' || paidRestRecord.submission_status === 'submitted'),
    [paidRestRecords],
  );

  const hasPendingOvertimeDecisions = useMemo(() => (
    overtimeCandidates.some((candidate) => {
      const decision = candidate.decision;
      return !decision
        || decision.status === 'pending'
        || decision.potential_ot_minutes !== candidate.potentialMinutes
        || normalizeTimeValue(decision.actual_checkout_time) !== candidate.actualCheckoutTime
        || normalizeTimeValue(decision.roster_end_time) !== candidate.rosterEndTime;
    })
  ), [overtimeCandidates]);

  const hasUnresolvedAttendance = useMemo(() => {
    if (!attendanceMeta) {
      return false;
    }

    return employees.some((employee) => (
      dayNumbers.some((day) => {
        const dayRecord = employee.days[String(day)] || buildBlankDayRecord();
        const rosterDay = resolveRosterDay(employee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, day);
        return dayNeedsResolution(dayRecord, rosterDay);
      })
    ));
  }, [attendanceMeta, dayNumbers, employees]);
  const hasUnresolved = hasUnresolvedAttendance || hasPendingLeaveDecisions || hasPendingPaidRestDecisions || hasPendingOvertimeDecisions;

  const activePopupDayRecord = activePopup
    ? employees[activePopup.employeeIndex]?.days[String(activePopup.day)] || buildBlankDayRecord()
    : null;
  const activePopupEmployee = activePopup ? employees[activePopup.employeeIndex] || null : null;
  const activePopupRosterDay = activePopup && activePopupEmployee && attendanceMeta
    ? resolveRosterDay(activePopupEmployee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, activePopup.day)
    : null;
  const activePopupCalendar = activePopup && attendanceMeta
    ? getCalendarDayMeta(attendanceMeta.year, attendanceMeta.month, activePopup.day)
    : null;

  const applyAttendanceState = useCallback((meta: AttendanceMeta, nextEmployees: AttendanceEmployee[]) => {
    startTransition(() => {
      setAttendanceMeta(meta);
      setSourceEmployees(nextEmployees);
      setUploadMonth(meta.month);
      setUploadYear(meta.year);
    });
  }, []);

  const fetchEmployeeDirectory = useCallback(async () => {
    try {
      setIsLoadingEmployeeDirectory(true);
      const response = await fetch(EMPLOYEES_API_BASE);
      const data = (await response.json()) as EmployeeDirectoryItem[];
      if (!response.ok) {
        return;
      }

      startTransition(() => {
        setEmployeeDirectory(Array.isArray(data) ? data.filter((employee) => employee.is_active !== false) : []);
      });
    } finally {
      setIsLoadingEmployeeDirectory(false);
    }
  }, []);

  const fetchLeaveRecords = useCallback(async (year: number, month: number, shouldReportErrors = false) => {
    try {
      setIsLoadingLeaves(true);
      const response = await fetch(`${LEAVES_API_BASE}/?year=${year}&month=${month}`);
      const data = (await response.json()) as LeaveRecordsResponse;
      if (!response.ok) {
        if (shouldReportErrors) {
          showErrorPopup(getErrorMessage(data) || 'Failed to load leave records.');
        }
        return;
      }

      startTransition(() => {
        setLeaveRecords(Array.isArray(data.records) ? data.records : []);
      });
    } catch {
      if (shouldReportErrors) {
        showErrorPopup('Failed to load leave records.');
      }
    } finally {
      setIsLoadingLeaves(false);
    }
  }, [showErrorPopup]);

  const fetchPaidRestRecords = useCallback(async (year: number, month: number, shouldReportErrors = false) => {
    try {
      setIsLoadingPaidRest(true);
      const response = await fetch(`${PAID_REST_API_BASE}/?year=${year}&month=${month}`);
      const data = (await response.json()) as PaidRestRequestsResponse;
      if (!response.ok) {
        if (shouldReportErrors) {
          showErrorPopup(getErrorMessage(data) || 'Failed to load paid-rest requests.');
        }
        return;
      }

      startTransition(() => {
        setPaidRestRecords(Array.isArray(data.records) ? data.records : []);
      });
    } catch {
      if (shouldReportErrors) {
        showErrorPopup('Failed to load paid-rest requests.');
      }
    } finally {
      setIsLoadingPaidRest(false);
    }
  }, [showErrorPopup]);

  const fetchPaidRestBalances = useCallback(async (year: number, month: number, shouldReportErrors = false) => {
    try {
      setIsLoadingPaidRestBalances(true);
      const response = await fetch(`${PAID_REST_BALANCES_API_BASE}/?year=${year}&month=${month}`);
      const data = (await response.json()) as PaidRestBalancesResponse;
      if (!response.ok) {
        if (shouldReportErrors) {
          showErrorPopup(getErrorMessage(data) || 'Failed to load paid-rest balances.');
        }
        return;
      }

      startTransition(() => {
        setPaidRestBalances(Array.isArray(data.records) ? data.records : []);
      });
    } catch {
      if (shouldReportErrors) {
        showErrorPopup('Failed to load paid-rest balances.');
      }
    } finally {
      setIsLoadingPaidRestBalances(false);
    }
  }, [showErrorPopup]);

  const fetchOvertimeDecisions = useCallback(async (year: number, month: number, shouldReportErrors = false) => {
    try {
      setIsLoadingOvertime(true);
      const response = await fetch(`${OVERTIME_API_BASE}/?year=${year}&month=${month}`);
      const data = (await response.json()) as OvertimeDecisionsResponse;
      if (!response.ok) {
        if (shouldReportErrors) {
          showErrorPopup(getErrorMessage(data) || 'Failed to load overtime decisions.');
        }
        return;
      }

      startTransition(() => {
        setOvertimeDecisions(Array.isArray(data.records) ? data.records : []);
      });
    } catch {
      if (shouldReportErrors) {
        showErrorPopup('Failed to load overtime decisions.');
      }
    } finally {
      setIsLoadingOvertime(false);
    }
  }, [showErrorPopup]);

  const fetchAttendanceHistory = useCallback(async (shouldReportErrors = false) => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`${ATTENDANCE_API_BASE}/history/`);
      const data = (await response.json()) as AttendanceHistoryResponse;
      if (!response.ok) {
        if (shouldReportErrors) {
          showErrorPopup(getErrorMessage(data) || 'Failed to load saved attendance periods.');
        }
        return;
      }

      startTransition(() => {
        setAttendanceHistory(Array.isArray(data.records) ? data.records : []);
      });
    } catch {
      if (shouldReportErrors) {
        showErrorPopup('Failed to load saved attendance periods.');
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [showErrorPopup]);

  useEffect(() => {
    void fetchAttendanceHistory();
  }, [fetchAttendanceHistory]);

  useEffect(() => {
    void fetchEmployeeDirectory();
  }, [fetchEmployeeDirectory]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedYear = Number(params.get('year'));
    const requestedMonth = Number(params.get('month'));
    const nextYear = Number.isFinite(requestedYear) && requestedYear > 0 ? requestedYear : null;
    const nextMonth = Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : null;

    if (nextYear !== null) {
      setUploadYear(nextYear);
    }
    if (nextMonth !== null) {
      setUploadMonth(nextMonth);
    }
    if (nextYear !== null || nextMonth !== null) {
      setLeaveForm((previous) => ({
        ...previous,
        leaveDate: buildIsoDate(
          (nextYear ?? Number(previous.leaveDate.slice(0, 4))) || defaultYear,
          (nextMonth ?? Number(previous.leaveDate.slice(5, 7))) || defaultMonth,
          1,
        ),
      }));
      setPaidRestForm((previous) => ({
        ...previous,
        restDate: buildIsoDate(
          (nextYear ?? Number(previous.restDate.slice(0, 4))) || defaultYear,
          (nextMonth ?? Number(previous.restDate.slice(5, 7))) || defaultMonth,
          1,
        ),
      }));
    }
  }, [defaultMonth, defaultYear]);

  useEffect(() => {
    void fetchLeaveRecords(activeYear, activeMonth);
    void fetchPaidRestRecords(activeYear, activeMonth);
    void fetchPaidRestBalances(activeYear, activeMonth);
    void fetchOvertimeDecisions(activeYear, activeMonth);
  }, [activeMonth, activeYear, fetchLeaveRecords, fetchPaidRestBalances, fetchPaidRestRecords, fetchOvertimeDecisions]);

  useEffect(() => {
    setLeaveForm((previous) => ({
      ...previous,
      leaveDate: previous.leaveDate.startsWith(`${activeYear}-${String(activeMonth).padStart(2, '0')}-`)
        ? previous.leaveDate
        : buildIsoDate(activeYear, activeMonth, 1),
    }));
    setPaidRestForm((previous) => ({
      ...previous,
      restDate: previous.restDate.startsWith(`${activeYear}-${String(activeMonth).padStart(2, '0')}-`)
        ? previous.restDate
        : buildIsoDate(activeYear, activeMonth, 1),
    }));
  }, [activeMonth, activeYear]);

  const updateAttendancePeriod = useCallback((field: 'month' | 'year', rawValue: number) => {
    if (!Number.isFinite(rawValue)) {
      return;
    }

    if (field === 'month') {
      const nextMonth = Math.max(1, Math.min(12, Math.trunc(rawValue)));
      setUploadMonth(nextMonth);
      setAttendanceMeta((previous) => {
        if (!previous) {
          return previous;
        }

        const nextDaysInMonth = getDaysInMonth(previous.year, nextMonth);
        return {
          ...previous,
          month: nextMonth,
          daysInMonth: nextDaysInMonth,
          dateRangeStart: buildIsoDate(previous.year, nextMonth, 1),
          dateRangeEnd: buildIsoDate(previous.year, nextMonth, nextDaysInMonth),
        };
      });
      return;
    }

    const nextYear = Math.max(1, Math.trunc(rawValue));
    setUploadYear(nextYear);
    setAttendanceMeta((previous) => {
      if (!previous) {
        return previous;
      }

      const nextDaysInMonth = getDaysInMonth(nextYear, previous.month);
      return {
        ...previous,
        year: nextYear,
        daysInMonth: nextDaysInMonth,
        dateRangeStart: buildIsoDate(nextYear, previous.month, 1),
        dateRangeEnd: buildIsoDate(nextYear, previous.month, nextDaysInMonth),
      };
    });
  }, []);

  const uploadAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceFiles.length) {
      showErrorPopup('Please select at least one attendance file.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      attendanceFiles.forEach((attendanceFile) => {
        formData.append('files', attendanceFile);
      });

      const response = await fetch(`${ATTENDANCE_API_BASE}/parse/`, {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ParsedAttendanceResponse;
      if (!response.ok) {
        setParseWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setParsedSourceFiles(Array.isArray(data.source_files) ? data.source_files : []);
        showErrorPopup(getErrorMessage(data) || 'Failed to upload attendance sheet.');
        return;
      }

      applyAttendanceState(buildAttendanceMeta(data, 'parsed'), mapParsedEmployees(data));
      setParseWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setParsedSourceFiles(Array.isArray(data.source_files) ? data.source_files : []);
      setActivePopup(null);
    } catch {
      showErrorPopup('Failed to upload attendance sheet.');
    } finally {
      setIsUploading(false);
    }
  };

  const loadSavedRecords = async (mode: 'final' | 'draft', period?: { year: number; month: number }) => {
    const isDraft = mode === 'draft';
    const setter = isDraft ? setIsLoadingDraft : setIsLoadingSaved;
    const requestYear = period?.year ?? attendanceMeta?.year ?? uploadYear;
    const requestMonth = period?.month ?? attendanceMeta?.month ?? uploadMonth;

    try {
      setter(true);
      const response = await fetch(
        `${ATTENDANCE_API_BASE}${isDraft ? '/drafts/' : '/'}?year=${requestYear}&month=${requestMonth}`,
      );
      const data = (await response.json()) as SavedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to load attendance records.');
        return;
      }

      applyAttendanceState(buildAttendanceMeta(data, mode), mapSavedEmployees(data));
      setParseWarnings([]);
      setParsedSourceFiles([]);
      setActivePopup(null);
    } catch {
      showErrorPopup('Failed to load attendance records.');
    } finally {
      setter(false);
    }
  };

  const buildSavePayload = useCallback(() => {
    if (!attendanceMeta) {
      return null;
    }

    return {
      year: attendanceMeta.year,
      month: attendanceMeta.month,
      employees: employees.map((employee) => {
        const daysPayload: Record<string, SaveDayPayload> = {};

        dayNumbers.forEach((day) => {
          const dayKey = String(day);
          const dayRecord = employee.days[dayKey] || buildBlankDayRecord();
          const rosterDay = resolveRosterDay(employee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, day);
          const offDay = isRosterOffDay(dayRecord, rosterDay);

          daysPayload[dayKey] = {
            raw_logs: dayRecord.rawLogs,
            morning: offDay ? { in: '', out: '', status: 'off' } : dayRecord.morning,
            afternoon: offDay ? { in: '', out: '', status: 'off' } : dayRecord.afternoon,
          };
        });

        return {
          worker_id: employee.workerId,
          employee_name: employee.employeeName,
          department: employee.department,
          days: daysPayload,
        };
      }),
    };
  }, [attendanceMeta, dayNumbers, employees]);

  const saveRecords = async (mode: 'final' | 'draft') => {
    if (!attendanceMeta) {
      showErrorPopup('Upload or load a month before saving.');
      return;
    }

    if (mode === 'final' && hasUnresolved) {
      showErrorPopup('Resolve missing attendance, pending leave decisions, pending paid-rest decisions, and overtime decisions before final save.');
      return;
    }

    const payload = buildSavePayload();
    if (!payload) {
      return;
    }

    const setter = mode === 'final' ? setIsSavingFinal : setIsSavingDraft;
    try {
      setter(true);
      const response = await fetch(`${ATTENDANCE_API_BASE}/${mode === 'final' ? 'save/' : 'save-draft/'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as SavedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to save attendance records.');
        return;
      }

      applyAttendanceState(buildAttendanceMeta(data, mode), mapSavedEmployees(data));
      setParseWarnings([]);
      setParsedSourceFiles([]);
      setActivePopup(null);
      void fetchAttendanceHistory();
    } catch {
      showErrorPopup('Failed to save attendance records.');
    } finally {
      setter(false);
    }
  };

  const updateLeaveForm = useCallback((field: keyof LeaveFormState, value: string) => {
    setLeaveForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }, []);

  const submitLeaveForm = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leaveForm.employeeId) {
      showErrorPopup('Choose an employee before saving a leave request.');
      return;
    }
    if (!leaveForm.leaveDate) {
      showErrorPopup('Choose a leave date.');
      return;
    }

    try {
      setIsSavingLeave(true);
      const payload: Record<string, unknown> = {
        employee: Number(leaveForm.employeeId),
        leave_date: leaveForm.leaveDate,
        duration_unit: leaveForm.durationUnit,
        linked_attendance_shift: leaveForm.linkedAttendanceShift,
        submission_status: leaveForm.submissionStatus,
        employee_reason: leaveForm.employeeReason,
        manager_note: leaveForm.managerNote,
      };

      if (leaveForm.leaveStartTime) {
        payload.leave_start_time = leaveForm.leaveStartTime;
      }
      if (leaveForm.leaveEndTime) {
        payload.leave_end_time = leaveForm.leaveEndTime;
      }
      if (leaveForm.durationValue.trim()) {
        payload.duration_value = Number(leaveForm.durationValue);
      }

      const response = await fetch(`${LEAVES_API_BASE}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to save leave request.');
        return;
      }

      setLeaveForm(createInitialLeaveForm(activeYear, activeMonth));
      await fetchLeaveRecords(activeYear, activeMonth, true);
    } catch {
      showErrorPopup('Failed to save leave request.');
    } finally {
      setIsSavingLeave(false);
    }
  }, [activeMonth, activeYear, fetchLeaveRecords, leaveForm, showErrorPopup]);

  const applyLeaveAction = useCallback(async (
    leaveRecord: LeaveRecord,
    action: 'submit' | 'approve' | 'reject' | 'record-unapproved',
  ) => {
    try {
      setIsSavingLeave(true);
      const response = await fetch(`${LEAVES_API_BASE}/${leaveRecord.id}/${action}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_note: leaveRecord.manager_note || '' }),
      });
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to update leave status.');
        return;
      }

      await fetchLeaveRecords(activeYear, activeMonth, true);
    } catch {
      showErrorPopup('Failed to update leave status.');
    } finally {
      setIsSavingLeave(false);
    }
  }, [activeMonth, activeYear, fetchLeaveRecords, showErrorPopup]);

  const updatePaidRestForm = useCallback((field: keyof PaidRestFormState, value: string) => {
    setPaidRestForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }, []);

  const submitPaidRestForm = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paidRestForm.employeeId) {
      showErrorPopup('Choose an employee before saving paid rest.');
      return;
    }
    if (!paidRestForm.restDate) {
      showErrorPopup('Choose a paid-rest date.');
      return;
    }
    if (paidRestForm.durationUnit === 'half_day' && !paidRestForm.linkedAttendanceShift) {
      showErrorPopup('Choose morning or afternoon for a half-day paid-rest request.');
      return;
    }

    try {
      setIsSavingPaidRest(true);
      const response = await fetch(`${PAID_REST_API_BASE}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee: Number(paidRestForm.employeeId),
          rest_date: paidRestForm.restDate,
          duration_unit: paidRestForm.durationUnit,
          linked_attendance_shift: paidRestForm.linkedAttendanceShift,
          submission_status: paidRestForm.submissionStatus,
          employee_reason: paidRestForm.employeeReason,
          manager_note: paidRestForm.managerNote,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to save paid-rest request.');
        return;
      }

      setPaidRestForm(createInitialPaidRestForm(activeYear, activeMonth));
      await Promise.all([
        fetchPaidRestRecords(activeYear, activeMonth, true),
        fetchPaidRestBalances(activeYear, activeMonth, true),
      ]);
    } catch {
      showErrorPopup('Failed to save paid-rest request.');
    } finally {
      setIsSavingPaidRest(false);
    }
  }, [activeMonth, activeYear, fetchPaidRestBalances, fetchPaidRestRecords, paidRestForm, showErrorPopup]);

  const applyPaidRestAction = useCallback(async (
    paidRestRecord: PaidRestRequest,
    action: 'submit' | 'approve' | 'reject',
  ) => {
    try {
      setIsSavingPaidRest(true);
      const response = await fetch(`${PAID_REST_API_BASE}/${paidRestRecord.id}/${action}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_note: paidRestRecord.manager_note || '' }),
      });
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to update paid-rest status.');
        return;
      }

      await Promise.all([
        fetchPaidRestRecords(activeYear, activeMonth, true),
        fetchPaidRestBalances(activeYear, activeMonth, true),
      ]);
    } catch {
      showErrorPopup('Failed to update paid-rest status.');
    } finally {
      setIsSavingPaidRest(false);
    }
  }, [activeMonth, activeYear, fetchPaidRestBalances, fetchPaidRestRecords, showErrorPopup]);

  const openOvertimePopup = useCallback((candidate: OvertimeCandidate) => {
    const approvedSegment = candidate.decision?.segments?.find((segment) => segment.status === 'approved');
    setActiveOvertimePopup({
      candidate,
      draftStatus: candidate.decision?.status || 'pending',
      draftReason: candidate.decision?.decision_reason || '',
      narrowed: Boolean(candidate.decision?.narrowed_decision_enabled || candidate.decision?.status === 'partially_approved'),
      approvedStart: normalizeTimeValue(approvedSegment?.segment_start_time || candidate.rosterEndTime) || candidate.rosterEndTime,
      approvedEnd: normalizeTimeValue(approvedSegment?.segment_end_time || candidate.actualCheckoutTime) || candidate.actualCheckoutTime,
    });
  }, []);

  const updateOvertimePopupField = useCallback((field: 'approvedStart' | 'approvedEnd' | 'draftReason', value: string) => {
    setActiveOvertimePopup((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        [field]: field === 'draftReason' ? value : normalizeTimeValue(value),
      };
    });
  }, []);

  const saveOvertimeDecision = useCallback(async (mode: 'approved' | 'denied' | 'partially_approved') => {
    if (!activeOvertimePopup) {
      return;
    }

    const { candidate, draftReason, approvedStart, approvedEnd } = activeOvertimePopup;
    const trimmedReason = draftReason.trim();
    if (mode !== 'approved' && !trimmedReason) {
      showErrorPopup('Provide a reason when any overtime is denied.');
      return;
    }

    let segments: OvertimeDecisionSegment[] | undefined;
    if (mode === 'partially_approved') {
      const builtSegments = buildPartialOvertimeSegments(candidate, approvedStart, approvedEnd, trimmedReason);
      if (!builtSegments) {
        showErrorPopup('Choose a valid approved OT range inside the blue overtime block.');
        return;
      }
      segments = builtSegments;
    }

    try {
      setIsSavingOvertime(true);
      const response = await fetch(`${OVERTIME_API_BASE}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: candidate.decision?.id,
          employee: candidate.employeeId,
          attendance_date: candidate.attendanceDate,
          attendance_shift: candidate.shiftKey,
          roster_start_time: candidate.rosterStartTime,
          roster_end_time: candidate.rosterEndTime,
          actual_checkout_time: candidate.actualCheckoutTime,
          status: mode,
          decision_reason: trimmedReason,
          narrowed_decision_enabled: mode === 'partially_approved',
          segments,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to save overtime decision.');
        return;
      }

      await fetchOvertimeDecisions(activeYear, activeMonth, true);
      setActiveOvertimePopup(null);
    } catch {
      showErrorPopup('Failed to save overtime decision.');
    } finally {
      setIsSavingOvertime(false);
    }
  }, [activeMonth, activeOvertimePopup, activeYear, fetchOvertimeDecisions, showErrorPopup]);

  const toggleEditMode = () => {
    if (editMode) {
      setEditMode(false);
      return;
    }

    const confirmed = window.confirm('Enable edit mode? This unlocks attendance editing.');
    if (confirmed) {
      setEditMode(true);
    }
  };

  const openResolvePopup = useCallback((employeeIndex: number, day: number, step: ShiftKey) => {
    if (!attendanceMeta) {
      return;
    }

    const employee = employees[employeeIndex] || null;
    const dayRecord = employee?.days[String(day)] || buildBlankDayRecord();
    const shift = dayRecord[step];
    if (!shift) {
      return;
    }

    const rosterDay = employee
      ? resolveRosterDay(employee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, day)
      : null;

    setActivePopup({
      employeeIndex,
      day,
      step,
      draftIn: normalizeTimeValue(shift.in) || getSuggestedTime(step, 'in', rosterDay),
      draftOut: normalizeTimeValue(shift.out) || getSuggestedTime(step, 'out', rosterDay),
      draftStatus: shift.status,
    });
  }, [attendanceMeta, employees]);

  const updatePopupTime = useCallback((field: 'in' | 'out', value: string) => {
    setActivePopup((previous) => {
      if (!previous) {
        return previous;
      }

      if (field === 'in') {
        return { ...previous, draftIn: normalizeTimeValue(value) };
      }

      return { ...previous, draftOut: normalizeTimeValue(value) };
    });
  }, []);

  const saveResolution = useCallback((type: 'manual' | 'absent') => {
    if (!activePopup) {
      return;
    }

    const { employeeIndex, day, step, draftIn, draftOut } = activePopup;
    if (type === 'manual' && (!normalizeTimeValue(draftIn) || !normalizeTimeValue(draftOut))) {
      showErrorPopup('Choose both check-in and check-out times before saving the shift.');
      return;
    }

    startTransition(() => {
      setSourceEmployees((previous) => {
        const nextEmployees = [...previous];
        const employee = { ...nextEmployees[employeeIndex] };
        const dayKey = String(day);
        const dayRecord = employee.days[dayKey] || buildBlankDayRecord();
        const updatedDayRecord: DayRecord = {
          ...dayRecord,
          morning: { ...dayRecord.morning },
          afternoon: { ...dayRecord.afternoon },
        };

        const target = step === 'morning' ? updatedDayRecord.morning : updatedDayRecord.afternoon;
        if (type === 'absent') {
          target.status = 'absent';
          target.in = '';
          target.out = '';
        } else {
          target.status = 'present';
          target.in = normalizeTimeValue(draftIn);
          target.out = normalizeTimeValue(draftOut);
        }

        employee.days = {
          ...employee.days,
          [dayKey]: updatedDayRecord,
        };
        nextEmployees[employeeIndex] = employee;

        return nextEmployees;
      });
    });

    setActivePopup(null);
  }, [activePopup, showErrorPopup]);

  return (
    <div>
      <div className="kicker">Payroll Ops</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Resolve attendance with precision.</h1>
      <p className="hero-copy">
        Upload the machine sheet, let payroll detect the month automatically, and resolve only the days that should actually have logs.
      </p>

      <div className="split-layout" style={{ marginTop: '2rem' }}>
        <div className="card card-glass">
          <h2 className="section-title">Upload Attendance Sheet</h2>
          <form onSubmit={uploadAttendance} className="form-grid" style={{ marginTop: '1.2rem' }}>
            <div className="form-field">
              <label>Attendance Excel Files</label>
              <input
                type="file"
                accept=".xls,.xlsx"
                multiple
                onChange={(e) => {
                  setAttendanceFiles(Array.from(e.target.files || []));
                  setParseWarnings([]);
                  setParsedSourceFiles([]);
                }}
                className="input"
                required
              />
            </div>
            <p className="muted" style={{ marginTop: '-0.2rem' }}>
              Upload one or more exports from the attendance machines. Files with the wrong format are skipped if the parser cannot find 工号 and 姓名 headers.
            </p>
            {attendanceFiles.length > 0 ? (
              <p className="muted" style={{ marginTop: '-0.2rem' }}>
                Selected {attendanceFiles.length} file{attendanceFiles.length === 1 ? '' : 's'}: {attendanceFiles.map((file) => file.name).join(', ')}
              </p>
            ) : null}
            {parsedSourceFiles.length > 0 ? (
              <div style={{ marginTop: '0.2rem' }}>
                <p className="muted" style={{ marginBottom: parseWarnings.length ? '0.5rem' : 0 }}>
                  Parsed {parsedFileCount} file{parsedFileCount === 1 ? '' : 's'} and skipped {skippedFileCount}.
                </p>
                {parseWarnings.length ? (
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#f28b54' }}>
                    {parseWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <button type="submit" disabled={isUploading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {isUploading ? 'Uploading...' : 'Upload & Parse Attendance'}
            </button>
          </form>
        </div>

        <div className="card floating-panel">
          <div className="pill">Controls</div>
          <h2 className="section-title" style={{ marginTop: '1rem' }}>Period Controls</h2>
          <div className="payroll-period-grid" style={{ marginTop: '1.2rem' }}>
            <div className="form-field">
              <label>Month</label>
              <input
                type="number"
                min={1}
                max={12}
                value={attendanceMeta?.month || uploadMonth}
                onChange={(e) => updateAttendancePeriod('month', Number(e.target.value))}
                className="input"
              />
            </div>
            <div className="form-field">
              <label>Year</label>
              <input
                type="number"
                value={attendanceMeta?.year || uploadYear}
                onChange={(e) => updateAttendancePeriod('year', Number(e.target.value))}
                className="input"
              />
            </div>
          </div>
          <p className="muted" style={{ marginTop: '0.6rem' }}>
            {attendanceMeta
              ? 'These values drive the visible calendar and final save target.'
              : 'Use these values when loading an existing saved month or draft.'}
          </p>
          <div className="form-grid" style={{ marginTop: '1.2rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadSavedRecords('final')}
              disabled={isLoadingSaved}
            >
              {isLoadingSaved ? 'Loading...' : 'Load Saved Records'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadSavedRecords('draft')}
              disabled={isLoadingDraft}
            >
              {isLoadingDraft ? 'Loading...' : 'Load Draft'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={toggleEditMode}
            >
              {editMode ? 'Disable Edit Mode' : 'Enable Edit Mode'}
            </button>
          </div>
          <div className="form-grid" style={{ marginTop: '1.2rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => saveRecords('draft')}
              disabled={isSavingDraft}
            >
              {isSavingDraft ? 'Saving Draft...' : 'Save Draft'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => saveRecords('final')}
              disabled={isSavingFinal}
            >
              {isSavingFinal ? 'Saving Final...' : 'Save Final'}
            </button>
          </div>
          <div className="payroll-history-panel" style={{ marginTop: '1.2rem' }}>
            <div className="payroll-history-header">
              <div>
                <div className="payroll-time-label">Saved Periods</div>
                <p className="muted" style={{ marginTop: '0.45rem' }}>
                  This list comes from the backend database, so older saved months like December 2024 stay discoverable.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void fetchAttendanceHistory(true)}
                disabled={isLoadingHistory}
              >
                {isLoadingHistory ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {attendanceHistory.length === 0 ? (
              <p className="muted">No saved drafts or final periods yet.</p>
            ) : (
              <div className="payroll-history-groups">
                <div className="payroll-history-group">
                  <div className="payroll-history-title">Final</div>
                  {finalAttendanceHistory.length === 0 ? (
                    <p className="muted">No final attendance records yet.</p>
                  ) : (
                    <div className="payroll-history-list">
                      {finalAttendanceHistory.map((record) => (
                        <button
                          key={`${record.status}-${record.year}-${record.month}`}
                          type="button"
                          className="payroll-history-chip"
                          onClick={() => loadSavedRecords('final', { year: record.year, month: record.month })}
                        >
                          <span>{record.label}</span>
                          <strong>Load</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="payroll-history-group">
                  <div className="payroll-history-title">Drafts</div>
                  {draftAttendanceHistory.length === 0 ? (
                    <p className="muted">No draft attendance records yet.</p>
                  ) : (
                    <div className="payroll-history-list">
                      {draftAttendanceHistory.map((record) => (
                        <button
                          key={`${record.status}-${record.year}-${record.month}`}
                          type="button"
                          className="payroll-history-chip payroll-history-chip-draft"
                          onClick={() => loadSavedRecords('draft', { year: record.year, month: record.month })}
                        >
                          <span>{record.label}</span>
                          <strong>Load</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {attendanceMeta ? (
            <div style={{ marginTop: '1.2rem' }}>
              <div className="pill">{attendanceMeta.status}</div>
              <p className="muted" style={{ marginTop: '0.6rem' }}>
                Active month: {attendanceMeta.year}-{String(attendanceMeta.month).padStart(2, '0')}
              </p>
              {attendanceMeta.sourceDateRange && (
                <p className="muted" style={{ marginTop: '0.4rem' }}>
                  Sheet range: {attendanceMeta.sourceDateRange}
                </p>
              )}
              {attendanceMeta.sheetGeneratedAt && (
                <p className="muted" style={{ marginTop: '0.4rem' }}>
                  Sheet generated: {attendanceMeta.sheetGeneratedAt}
                </p>
              )}
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                Active workers shown: {employees.length}
              </p>
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                Leave records this month: {leaveRecords.length}
              </p>
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                Paid-rest requests this month: {paidRestRecords.length}
              </p>
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                {isLoadingOvertime ? 'Refreshing overtime decisions...' : `OT review items: ${overtimeCandidates.length}`}
              </p>
              {hasUnresolved ? (
                <p style={{ color: '#d97962', marginTop: '0.4rem' }}>
                  Unresolved attendance, leave, paid-rest, or overtime decisions remain.
                </p>
              ) : (
                <p style={{ color: '#4bbf8e', marginTop: '0.4rem' }}>Ready for final save.</p>
              )}
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                Final save persists this month so it can be loaded later from this page.
              </p>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: '1rem' }}>Upload or load records to begin.</p>
          )}
        </div>
      </div>

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Leave Requests</h2>
            <p className="muted" style={{ marginTop: '0.6rem' }}>
              Record leave before the machine file arrives, then let the calendar overlay approved or unapproved leave onto the active month.
            </p>
          </div>
          <span className="pill">{activeYear}-{String(activeMonth).padStart(2, '0')}</span>
        </div>

        <div className="payroll-ops-grid" style={{ marginTop: '1.2rem' }}>
          <form className="form-grid payroll-leave-form" onSubmit={submitLeaveForm}>
            <div className="form-field">
              <label>Employee</label>
              <select
                className="select"
                value={leaveForm.employeeId}
                onChange={(event) => updateLeaveForm('employeeId', event.target.value)}
                disabled={isLoadingEmployeeDirectory}
              >
                <option value="">Choose employee</option>
                {employeeDirectory.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} {employee.worker_id ? `(${employee.worker_id})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="payroll-leave-form-grid">
              <label className="form-field">
                <span>Date</span>
                <input
                  type="date"
                  className="input"
                  value={leaveForm.leaveDate}
                  onChange={(event) => updateLeaveForm('leaveDate', event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <select
                  className="select"
                  value={leaveForm.submissionStatus}
                  onChange={(event) => updateLeaveForm('submissionStatus', event.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="submitted">Pending approval</option>
                  <option value="approved">Approve now</option>
                  <option value="rejected">Reject now</option>
                  <option value="recorded_unapproved">Record unapproved</option>
                </select>
              </label>
            </div>

            <div className="payroll-leave-form-grid">
              <label className="form-field">
                <span>Duration</span>
                <select
                  className="select"
                  value={leaveForm.durationUnit}
                  onChange={(event) => updateLeaveForm('durationUnit', event.target.value)}
                >
                  <option value="full_day">Full day</option>
                  <option value="half_day">Half day</option>
                  <option value="hour">Hours</option>
                  <option value="custom_minutes">Custom minutes</option>
                </select>
              </label>

              {leaveForm.durationUnit === 'half_day' && (
                <label className="form-field">
                  <span>Shift</span>
                  <select
                    className="select"
                    value={leaveForm.linkedAttendanceShift}
                    onChange={(event) => updateLeaveForm('linkedAttendanceShift', event.target.value)}
                  >
                    <option value="">Choose shift</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                </label>
              )}

              {(leaveForm.durationUnit === 'hour' || leaveForm.durationUnit === 'custom_minutes') && (
                <label className="form-field">
                  <span>{leaveForm.durationUnit === 'hour' ? 'Fallback hours' : 'Fallback minutes'}</span>
                  <input
                    type="number"
                    min="0"
                    step={leaveForm.durationUnit === 'hour' ? '0.25' : '1'}
                    className="input"
                    value={leaveForm.durationValue}
                    onChange={(event) => updateLeaveForm('durationValue', event.target.value)}
                  />
                </label>
              )}
            </div>

            {(leaveForm.durationUnit === 'hour' || leaveForm.durationUnit === 'custom_minutes') && (
              <div className="payroll-leave-form-grid">
                <label className="form-field">
                  <span>Start time</span>
                  <input
                    type="time"
                    className="input"
                    value={leaveForm.leaveStartTime}
                    onChange={(event) => updateLeaveForm('leaveStartTime', event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>End time</span>
                  <input
                    type="time"
                    className="input"
                    value={leaveForm.leaveEndTime}
                    onChange={(event) => updateLeaveForm('leaveEndTime', event.target.value)}
                  />
                </label>
              </div>
            )}

            <label className="form-field">
              <span>Employee reason</span>
              <textarea
                className="textarea"
                rows={3}
                value={leaveForm.employeeReason}
                onChange={(event) => updateLeaveForm('employeeReason', event.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Manager note</span>
              <textarea
                className="textarea"
                rows={2}
                value={leaveForm.managerNote}
                onChange={(event) => updateLeaveForm('managerNote', event.target.value)}
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={isSavingLeave} style={{ justifyContent: 'center' }}>
              {isSavingLeave ? 'Saving leave...' : 'Save Leave Request'}
            </button>
          </form>

          <div className="payroll-leave-list-panel">
            <div className="payroll-history-header">
              <div>
                <div className="payroll-time-label">Month leave queue</div>
                <p className="muted" style={{ marginTop: '0.45rem' }}>
                  Pending leave blocks finalization. Approved and unapproved leave automatically color the attendance grid.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void fetchLeaveRecords(activeYear, activeMonth, true)}
                disabled={isLoadingLeaves}
              >
                {isLoadingLeaves ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {leaveRecords.length === 0 ? (
              <p className="muted">No leave records for this month yet.</p>
            ) : (
              <div className="payroll-leave-list">
                {leaveRecords.map((leaveRecord) => (
                  <div key={leaveRecord.id} className="payroll-leave-item">
                    <div className="payroll-leave-item-header">
                      <div>
                        <div className="payroll-leave-item-title">
                          {leaveRecord.employee_name || 'Employee'} · {leaveRecord.leave_date}
                        </div>
                        <div className="payroll-leave-item-copy">
                          {leaveRecord.duration_unit.replace('_', ' ')} · {formatMinuteDuration(leaveRecord.leave_minutes)}
                          {leaveRecord.linked_attendance_shift ? ` · ${leaveRecord.linked_attendance_shift}` : ''}
                        </div>
                      </div>
                      <span className={`payroll-status-badge payroll-status-badge-${leaveRecord.submission_status.replace('_', '-')}`}>
                        {getLeaveStatusLabel(leaveRecord.submission_status)}
                      </span>
                    </div>
                    {leaveRecord.employee_reason && (
                      <div className="payroll-leave-item-copy">Reason: {leaveRecord.employee_reason}</div>
                    )}
                    {leaveRecord.manager_note && (
                      <div className="payroll-leave-item-copy">Note: {leaveRecord.manager_note}</div>
                    )}
                    <div className="payroll-leave-actions">
                      {(leaveRecord.submission_status === 'draft') && (
                        <button type="button" className="btn btn-outline" onClick={() => void applyLeaveAction(leaveRecord, 'submit')} disabled={isSavingLeave}>Submit</button>
                      )}
                      {(leaveRecord.submission_status === 'draft' || leaveRecord.submission_status === 'submitted' || leaveRecord.submission_status === 'rejected') && (
                        <button type="button" className="btn btn-outline" onClick={() => void applyLeaveAction(leaveRecord, 'approve')} disabled={isSavingLeave}>Approve</button>
                      )}
                      {(leaveRecord.submission_status === 'draft' || leaveRecord.submission_status === 'submitted' || leaveRecord.submission_status === 'approved') && (
                        <button type="button" className="btn btn-outline" onClick={() => void applyLeaveAction(leaveRecord, 'reject')} disabled={isSavingLeave}>Reject</button>
                      )}
                      {(leaveRecord.submission_status === 'draft' || leaveRecord.submission_status === 'submitted' || leaveRecord.submission_status === 'rejected') && (
                        <button type="button" className="btn btn-outline" onClick={() => void applyLeaveAction(leaveRecord, 'record-unapproved')} disabled={isSavingLeave}>Mark Unapproved</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Paid Rest</h2>
            <p className="muted" style={{ marginTop: '0.6rem' }}>
              Approve shop paid rest separately from leave. It overlays the attendance calendar as a neutral paid-rest status and keeps the attendance bonus intact.
            </p>
          </div>
          <span className="pill">{activeYear}-{String(activeMonth).padStart(2, '0')}</span>
        </div>

        <div className="payroll-ops-grid" style={{ marginTop: '1.2rem' }}>
          <form className="form-grid payroll-leave-form" onSubmit={submitPaidRestForm}>
            <div className="form-field">
              <label>Employee</label>
              <select
                className="select"
                value={paidRestForm.employeeId}
                onChange={(event) => updatePaidRestForm('employeeId', event.target.value)}
                disabled={isLoadingEmployeeDirectory}
              >
                <option value="">Choose employee</option>
                {employeeDirectory.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} {employee.worker_id ? `(${employee.worker_id})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="payroll-leave-form-grid">
              <label className="form-field">
                <span>Date</span>
                <input
                  type="date"
                  className="input"
                  value={paidRestForm.restDate}
                  onChange={(event) => updatePaidRestForm('restDate', event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <select
                  className="select"
                  value={paidRestForm.submissionStatus}
                  onChange={(event) => updatePaidRestForm('submissionStatus', event.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="submitted">Submit now</option>
                  <option value="approved">Approve now</option>
                  <option value="rejected">Reject now</option>
                </select>
              </label>
            </div>

            <div className="payroll-leave-form-grid">
              <label className="form-field">
                <span>Duration</span>
                <select
                  className="select"
                  value={paidRestForm.durationUnit}
                  onChange={(event) => updatePaidRestForm('durationUnit', event.target.value)}
                >
                  <option value="full_day">Full day</option>
                  <option value="half_day">Half day</option>
                </select>
              </label>
              {paidRestForm.durationUnit === 'half_day' && (
                <label className="form-field">
                  <span>Shift</span>
                  <select
                    className="select"
                    value={paidRestForm.linkedAttendanceShift}
                    onChange={(event) => updatePaidRestForm('linkedAttendanceShift', event.target.value)}
                  >
                    <option value="">Choose shift</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                </label>
              )}
            </div>

            <label className="form-field">
              <span>Employee reason</span>
              <textarea
                className="textarea"
                rows={3}
                value={paidRestForm.employeeReason}
                onChange={(event) => updatePaidRestForm('employeeReason', event.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Manager note</span>
              <textarea
                className="textarea"
                rows={2}
                value={paidRestForm.managerNote}
                onChange={(event) => updatePaidRestForm('managerNote', event.target.value)}
              />
            </label>

            <p className="muted">
              Coverage and balance checks run in the backend. If approval would drop the department below minimum staffing, the API returns the validation error directly here.
            </p>

            <button type="submit" className="btn btn-primary" disabled={isSavingPaidRest} style={{ justifyContent: 'center' }}>
              {isSavingPaidRest ? 'Saving paid rest...' : 'Save Paid-Rest Request'}
            </button>
          </form>

          <div className="payroll-leave-list-panel" style={{ gap: '1rem' }}>
            <div>
              <div className="payroll-history-header">
                <div>
                  <div className="payroll-time-label">Month paid-rest queue</div>
                  <p className="muted" style={{ marginTop: '0.45rem' }}>
                    Draft and submitted paid-rest requests block final save until they are approved or rejected.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void fetchPaidRestRecords(activeYear, activeMonth, true);
                    void fetchPaidRestBalances(activeYear, activeMonth, true);
                  }}
                  disabled={isLoadingPaidRest || isLoadingPaidRestBalances}
                >
                  {isLoadingPaidRest || isLoadingPaidRestBalances ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {paidRestRecords.length === 0 ? (
                <p className="muted">No paid-rest requests for this month yet.</p>
              ) : (
                <div className="payroll-leave-list">
                  {paidRestRecords.map((paidRestRecord) => (
                    <div key={paidRestRecord.id} className="payroll-leave-item">
                      <div className="payroll-leave-item-header">
                        <div>
                          <div className="payroll-leave-item-title">
                            {paidRestRecord.employee_name || 'Employee'} · {paidRestRecord.rest_date}
                          </div>
                          <div className="payroll-leave-item-copy">
                            {paidRestRecord.duration_unit.replace('_', ' ')}
                            {paidRestRecord.linked_attendance_shift ? ` · ${paidRestRecord.linked_attendance_shift}` : ''}
                            {' · '}
                            {formatDayBalance(paidRestRecord.paid_rest_days)} day(s)
                            {paidRestRecord.department_name ? ` · ${paidRestRecord.department_name}` : ''}
                          </div>
                        </div>
                        <span className={`payroll-status-badge payroll-status-badge-${paidRestRecord.submission_status.replace('_', '-')}`}>
                          {getPaidRestStatusLabel(paidRestRecord.submission_status)}
                        </span>
                      </div>
                      {paidRestRecord.employee_reason && (
                        <div className="payroll-leave-item-copy">Reason: {paidRestRecord.employee_reason}</div>
                      )}
                      {paidRestRecord.manager_note && (
                        <div className="payroll-leave-item-copy">Note: {paidRestRecord.manager_note}</div>
                      )}
                      <div className="payroll-leave-actions">
                        {paidRestRecord.submission_status === 'draft' && (
                          <button type="button" className="btn btn-outline" onClick={() => void applyPaidRestAction(paidRestRecord, 'submit')} disabled={isSavingPaidRest}>Submit</button>
                        )}
                        {(paidRestRecord.submission_status === 'draft' || paidRestRecord.submission_status === 'submitted' || paidRestRecord.submission_status === 'rejected') && (
                          <button type="button" className="btn btn-outline" onClick={() => void applyPaidRestAction(paidRestRecord, 'approve')} disabled={isSavingPaidRest}>Approve</button>
                        )}
                        {(paidRestRecord.submission_status === 'draft' || paidRestRecord.submission_status === 'submitted' || paidRestRecord.submission_status === 'approved') && (
                          <button type="button" className="btn btn-outline" onClick={() => void applyPaidRestAction(paidRestRecord, 'reject')} disabled={isSavingPaidRest}>Reject</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="payroll-time-label">Month balances</div>
              <p className="muted" style={{ marginTop: '0.45rem' }}>
                Balances rebuild from department grant rules plus approved paid-rest usage for the selected month.
              </p>
              {paidRestBalances.length === 0 ? (
                <p className="muted" style={{ marginTop: '0.8rem' }}>No paid-rest balances available for this month yet.</p>
              ) : (
                <div className="payroll-leave-list" style={{ marginTop: '0.8rem' }}>
                  {paidRestBalances.map((balance) => (
                    <div key={balance.id} className="payroll-leave-item">
                      <div className="payroll-leave-item-header">
                        <div>
                          <div className="payroll-leave-item-title">{balance.employee_name || 'Employee'}</div>
                          <div className="payroll-leave-item-copy">
                            {balance.department_name || 'No department'}
                          </div>
                        </div>
                        <span className="pill">Closing {formatDayBalance(balance.closing_balance_days)} day(s)</span>
                      </div>
                      <div className="payroll-leave-item-copy">
                        Opening {formatDayBalance(balance.opening_balance_days)} · Granted {formatDayBalance(balance.granted_days)} · Used {formatDayBalance(balance.used_days)} · Cap {formatDayBalance(balance.carry_forward_cap_days)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
          <h2 className="section-title">Attendance Records</h2>
          <span className="pill">Draft + Final</span>
        </div>
        {employees.length === 0 ? (
          <p className="muted">No active employee attendance records yet. Upload or load a month to start resolving.</p>
        ) : (
          <div className="overflow-x-auto payroll-table-shell" style={{ marginTop: '1rem' }}>
            <table className="table payroll-records-table" style={{ minWidth: '1200px' }}>
              <thead>
                <tr>
                  <th>Worker ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  {dayNumbers.map((day) => {
                    const dayMeta = attendanceMeta
                      ? getCalendarDayMeta(attendanceMeta.year, attendanceMeta.month, day)
                      : null;

                    return (
                      <th key={`day-${day}`}>
                        <div className={`payroll-day-header${dayMeta?.isWeekend ? ' payroll-day-header-weekend' : ''}`}>
                          <span className="payroll-day-heading">Day {day}</span>
                          <span className="payroll-day-date">{dayMeta?.dateLabel || `Day ${day}`}</span>
                          <span className="payroll-day-weekday">{dayMeta?.weekdayLabel || '-'}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, employeeIndex) => (
                  <AttendanceEmployeeRow
                    key={`${employee.workerId || employee.employeeName || 'employee'}-${employeeIndex}`}
                    employee={employee}
                    attendanceMeta={attendanceMeta!}
                    employeeIndex={employeeIndex}
                    dayNumbers={dayNumbers}
                    editMode={editMode}
                    onOpenResolvePopup={openResolvePopup}
                    overtimeDecisionMap={overtimeDecisionMap}
                    onOpenOvertimePopup={openOvertimePopup}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activePopup && activePopupDayRecord && activePopupEmployee && (
        <div className="payroll-modal-backdrop">
          <div className="card payroll-modal-card">
            <div className="payroll-modal-header">
              <div>
                <h3 className="section-title" style={{ marginBottom: 0 }}>Resolve Attendance</h3>
                <p className="muted" style={{ marginTop: '0.4rem' }}>
                  {activePopupEmployee.employeeName || activePopupEmployee.workerId || 'Employee'} · Day {activePopup.day} · {activePopupCalendar?.dateLabel || ''} · {activePopupCalendar?.weekdayLabel || ''} · {activePopup.step === 'morning' ? 'Morning shift' : 'Afternoon shift'}
                </p>
              </div>
              <div className="pill">{activePopup.draftStatus === 'missing' ? 'Needs review' : 'Re-edit allowed'}</div>
            </div>

            {activePopupDayRecord.rawLogs.length > 0 && (
              <div className="payroll-raw-log-panel">
                <div className="payroll-time-label">Sheet logs</div>
                <div className="payroll-raw-log-copy">{activePopupDayRecord.rawLogs.join(' · ')}</div>
              </div>
            )}

            {activePopupRosterDay?.isWorking && getExpectedShiftLabel(activePopupRosterDay) && (
              <div className="payroll-raw-log-panel">
                <div className="payroll-time-label">Roster expectation</div>
                <div className="payroll-raw-log-copy">{getExpectedShiftLabel(activePopupRosterDay)}</div>
              </div>
            )}

            <div className="payroll-time-grid">
              <TimePickerField
                label="Check-in"
                value={activePopup.draftIn}
                onChange={(value) => updatePopupTime('in', value)}
              />
              <TimePickerField
                label="Check-out"
                value={activePopup.draftOut}
                onChange={(value) => updatePopupTime('out', value)}
              />
            </div>

            <div className="payroll-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => saveResolution('absent')}
              >
                Mark Absent
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => saveResolution('manual')}
              >
                Save Shift
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ justifySelf: 'start' }}
              onClick={() => setActivePopup(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeOvertimePopup && (
        <div className="payroll-modal-backdrop">
          <div className="card payroll-modal-card">
            <div className="payroll-modal-header">
              <div>
                <h3 className="section-title" style={{ marginBottom: 0 }}>Review Overtime</h3>
                <p className="muted" style={{ marginTop: '0.4rem' }}>
                  {activeOvertimePopup.candidate.employeeName || activeOvertimePopup.candidate.workerId || 'Employee'} · {activeOvertimePopup.candidate.attendanceDate} · {activeOvertimePopup.candidate.shiftKey} shift
                </p>
              </div>
              <div className="pill">Potential {formatMinuteDuration(activeOvertimePopup.candidate.potentialMinutes)}</div>
            </div>

            <div className="payroll-raw-log-panel">
              <div className="payroll-time-label">Blue OT block</div>
              <div className="payroll-raw-log-copy">
                {activeOvertimePopup.candidate.rosterEndTime} - {activeOvertimePopup.candidate.actualCheckoutTime}
              </div>
            </div>

            <label className="payroll-inline-toggle">
              <input
                type="checkbox"
                checked={activeOvertimePopup.narrowed}
                onChange={(event) => setActiveOvertimePopup((previous) => previous ? { ...previous, narrowed: event.target.checked } : previous)}
              />
              <span>Narrow it down</span>
            </label>

            {activeOvertimePopup.narrowed && (
              <div className="payroll-time-grid">
                <TimePickerField
                  label="Approved start"
                  value={activeOvertimePopup.approvedStart}
                  onChange={(value) => updateOvertimePopupField('approvedStart', value)}
                />
                <TimePickerField
                  label="Approved end"
                  value={activeOvertimePopup.approvedEnd}
                  onChange={(value) => updateOvertimePopupField('approvedEnd', value)}
                />
              </div>
            )}

            <label className="form-field">
              <span>Decision reason</span>
              <textarea
                className="textarea"
                rows={3}
                value={activeOvertimePopup.draftReason}
                onChange={(event) => updateOvertimePopupField('draftReason', event.target.value)}
              />
            </label>

            <div className="payroll-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void saveOvertimeDecision('denied')}
                disabled={isSavingOvertime}
              >
                {isSavingOvertime ? 'Saving...' : 'Deny Block'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void saveOvertimeDecision('approved')}
                disabled={isSavingOvertime}
              >
                Approve All
              </button>
              {activeOvertimePopup.narrowed && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveOvertimeDecision('partially_approved')}
                  disabled={isSavingOvertime}
                >
                  Save Narrowed Decision
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ justifySelf: 'start' }}
              onClick={() => setActiveOvertimePopup(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}