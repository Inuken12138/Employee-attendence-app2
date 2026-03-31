'use client';

import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '../../../hooks/useErrorPopup';

type ShiftStatus = 'present' | 'absent' | 'missing' | 'off';
type ShiftKey = 'morning' | 'afternoon';
type ShiftTone = 'locked' | 'missing' | 'resolved';

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

interface ParsedEmployeePayload {
  employee_db_id?: number | null;
  employee_id?: string | null;
  worker_id?: string | null;
  employee_name?: string | null;
  department?: string | null;
  roster_assignment?: PayrollRosterAssignmentPayload | null;
  day_logs?: Record<string, string[]>;
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
}

interface AttendanceEmployeeRowProps {
  employee: AttendanceEmployee;
  attendanceMeta: AttendanceMeta;
  employeeIndex: number;
  dayNumbers: number[];
  editMode: boolean;
  onOpenResolvePopup: (employeeIndex: number, day: number, step: ShiftKey) => void;
}

const API_BASE = 'http://localhost:8000/api/payroll/attendance-records';
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

const getErrorMessage = (data: unknown): string | undefined => {
  if (data && typeof data === 'object' && 'error' in data) {
    const errorValue = (data as { error?: string }).error;
    if (typeof errorValue === 'string') {
      return errorValue;
    }
  }
  return undefined;
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
  if (value === 'present' || value === 'absent' || value === 'missing' || value === 'off') {
    return value;
  }
  return 'missing';
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
}: AttendanceDayCellProps) {
  const isOffDay = isRosterOffDay(dayRecord, rosterDay);
  const canEdit = editMode && dayRecord.editable && !isOffDay;
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
        canEdit={canEdit}
        onOpen={() => onOpenResolvePopup(employeeIndex, day, 'morning')}
      />
      <AttendanceShiftCard
        title="Afternoon"
        shift={dayRecord.afternoon}
        tone={afternoonTone}
        canEdit={canEdit}
        onOpen={() => onOpenResolvePopup(employeeIndex, day, 'afternoon')}
      />
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
}: AttendanceEmployeeRowProps) {
  return (
    <tr className="payroll-table-row">
      <td>{employee.workerId || '-'}</td>
      <td>{employee.employeeName || '-'}</td>
      <td>{employee.department || '-'}</td>
      {dayNumbers.map((day) => {
        const dayRecord = employee.days[String(day)] || buildBlankDayRecord();
        const rosterDay = resolveRosterDay(employee.rosterAssignment, attendanceMeta.year, attendanceMeta.month, day);

        return (
          <td key={`${employeeIndex}-${day}`} className="payroll-table-cell">
            <AttendanceDayCell
              dayRecord={dayRecord}
              rosterDay={rosterDay}
              employeeIndex={employeeIndex}
              day={day}
              editMode={editMode}
              onOpenResolvePopup={onOpenResolvePopup}
            />
          </td>
        );
      })}
    </tr>
  );
});

export default function EmployeePayrollPage() {
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [attendanceMeta, setAttendanceMeta] = useState<AttendanceMeta | null>(null);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSavingFinal, setIsSavingFinal] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [activePopup, setActivePopup] = useState<ResolvePopupState | null>(null);
  const { showErrorPopup } = useErrorPopup();

  const daysInMonth = attendanceMeta?.daysInMonth || 31;
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);
  const finalAttendanceHistory = useMemo(
    () => attendanceHistory.filter((record) => record.status === 'final'),
    [attendanceHistory],
  );
  const draftAttendanceHistory = useMemo(
    () => attendanceHistory.filter((record) => record.status === 'draft'),
    [attendanceHistory],
  );

  const hasUnresolved = useMemo(() => {
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
      setEmployees(nextEmployees);
      setUploadMonth(meta.month);
      setUploadYear(meta.year);
    });
  }, []);

  const fetchAttendanceHistory = useCallback(async (shouldReportErrors = false) => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`${API_BASE}/history/`);
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
    if (!attendanceFile) {
      showErrorPopup('Please select an attendance file.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', attendanceFile);

      const response = await fetch(`${API_BASE}/parse/`, {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ParsedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to upload attendance sheet.');
        return;
      }

      applyAttendanceState(buildAttendanceMeta(data, 'parsed'), mapParsedEmployees(data));
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
        `${API_BASE}${isDraft ? '/drafts/' : '/'}?year=${requestYear}&month=${requestMonth}`,
      );
      const data = (await response.json()) as SavedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to load attendance records.');
        return;
      }

      applyAttendanceState(buildAttendanceMeta(data, mode), mapSavedEmployees(data));
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
      showErrorPopup('You need to fill out all missing attendance before you can save.');
      return;
    }

    const payload = buildSavePayload();
    if (!payload) {
      return;
    }

    const setter = mode === 'final' ? setIsSavingFinal : setIsSavingDraft;
    try {
      setter(true);
      const response = await fetch(`${API_BASE}/${mode === 'final' ? 'save/' : 'save-draft/'}`, {
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
      setActivePopup(null);
      void fetchAttendanceHistory();
    } catch {
      showErrorPopup('Failed to save attendance records.');
    } finally {
      setter(false);
    }
  };

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
      setEmployees((previous) => {
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
              <label>Attendance .xls File</label>
              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={(e) => setAttendanceFile(e.target.files?.[0] || null)}
                className="input"
                required
              />
            </div>
            <p className="muted" style={{ marginTop: '-0.2rem' }}>
              The parser now reads the sheet header for 考勤日期, then you can override the active month below if that header is wrong.
            </p>
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
              {hasUnresolved ? (
                <p style={{ color: '#d97962', marginTop: '0.4rem' }}>
                  Unresolved shifts remain.
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
    </div>
  );
}