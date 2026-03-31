'use client';

import { memo, startTransition, useCallback, useMemo, useState } from 'react';

import useErrorPopup from '../../../hooks/useErrorPopup';

type ShiftStatus = 'present' | 'absent' | 'missing';
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

interface AttendanceEmployee {
  employeeDbId?: number | null;
  workerId: string | null;
  employeeName: string | null;
  department: string | null;
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
  employee_id?: string | null;
  worker_id?: string | null;
  employee_name?: string | null;
  department?: string | null;
  day_logs?: Record<string, string[]>;
}

interface ParsedAttendanceResponse {
  year: number;
  month: number;
  days_in_month: number;
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
  days?: Record<string, SavedDayPayload>;
}

interface SavedAttendanceResponse {
  year: number;
  month: number;
  days_in_month: number;
  status?: string;
  employees: SavedEmployeePayload[];
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
  employeeIndex: number;
  day: number;
  editMode: boolean;
  onOpenResolvePopup: (employeeIndex: number, day: number, step: ShiftKey) => void;
}

interface AttendanceEmployeeRowProps {
  employee: AttendanceEmployee;
  employeeIndex: number;
  dayNumbers: number[];
  editMode: boolean;
  onOpenResolvePopup: (employeeIndex: number, day: number, step: ShiftKey) => void;
}

const API_BASE = 'http://localhost:8000/api/payroll/attendance-records';
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_PRESETS = ['00', '05', '10', '15', '30', '45'];

const emptyShift = (): ShiftPayload => ({ in: '', out: '', status: 'missing' });

const getErrorMessage = (data: unknown): string | undefined => {
  if (data && typeof data === 'object' && 'error' in data) {
    const errorValue = (data as { error?: string }).error;
    if (typeof errorValue === 'string') {
      return errorValue;
    }
  }
  return undefined;
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

const getSuggestedTime = (step: ShiftKey, field: 'in' | 'out') => {
  if (step === 'morning') {
    return field === 'in' ? '08:00' : '12:00';
  }
  return field === 'in' ? '13:00' : '17:00';
};

const getShiftLabel = (shift: ShiftPayload) => {
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
      status: (morning.status as ShiftStatus) || 'missing',
    },
    afternoon: {
      in: normalizeTimeValue(String(afternoon.in || '')),
      out: normalizeTimeValue(String(afternoon.out || '')),
      status: (afternoon.status as ShiftStatus) || 'missing',
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
      workerId: employee.worker_id || employee.employee_id || null,
      employeeName: employee.employee_name || null,
      department: employee.department || null,
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
  employeeIndex,
  day,
  editMode,
  onOpenResolvePopup,
}: AttendanceDayCellProps) {
  const canEdit = editMode && dayRecord.editable;
  const morningTone = getShiftTone(dayRecord, 'morning');
  const afternoonTone = getShiftTone(dayRecord, 'afternoon');

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
    </div>
  );
});

const AttendanceEmployeeRow = memo(function AttendanceEmployeeRow({
  employee,
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
      {dayNumbers.map((day) => (
        <td key={`${employeeIndex}-${day}`} className="payroll-table-cell">
          <AttendanceDayCell
            dayRecord={employee.days[String(day)]}
            employeeIndex={employeeIndex}
            day={day}
            editMode={editMode}
            onOpenResolvePopup={onOpenResolvePopup}
          />
        </td>
      ))}
    </tr>
  );
});

export default function EmployeePayrollPage() {
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [attendanceMeta, setAttendanceMeta] = useState<AttendanceMeta | null>(null);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isSavingFinal, setIsSavingFinal] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [activePopup, setActivePopup] = useState<ResolvePopupState | null>(null);
  const { showErrorPopup } = useErrorPopup();

  const daysInMonth = attendanceMeta?.daysInMonth || 31;
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);

  const hasUnresolved = useMemo(() => {
    return employees.some((employee) =>
      Object.values(employee.days).some((day) =>
        day.morning.status === 'missing' || day.afternoon.status === 'missing'
      )
    );
  }, [employees]);

  const activePopupDayRecord = activePopup
    ? employees[activePopup.employeeIndex]?.days[String(activePopup.day)] || null
    : null;
  const activePopupEmployee = activePopup ? employees[activePopup.employeeIndex] || null : null;

  const applyAttendanceState = useCallback((meta: AttendanceMeta, nextEmployees: AttendanceEmployee[]) => {
    startTransition(() => {
      setAttendanceMeta(meta);
      setEmployees(nextEmployees);
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
      formData.append('month', String(uploadMonth));
      formData.append('year', String(uploadYear));

      const response = await fetch(`${API_BASE}/parse/`, {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ParsedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to upload attendance sheet.');
        return;
      }

      applyAttendanceState(
        {
          year: data.year,
          month: data.month,
          daysInMonth: data.days_in_month,
          status: 'parsed',
        },
        mapParsedEmployees(data),
      );
      setActivePopup(null);
    } catch {
      showErrorPopup('Failed to upload attendance sheet.');
    } finally {
      setIsUploading(false);
    }
  };

  const loadSavedRecords = async (mode: 'final' | 'draft') => {
    const isDraft = mode === 'draft';
    const setter = isDraft ? setIsLoadingDraft : setIsLoadingSaved;

    try {
      setter(true);
      const response = await fetch(
        `${API_BASE}${isDraft ? '/drafts/' : '/'}?year=${uploadYear}&month=${uploadMonth}`,
      );
      const data = (await response.json()) as SavedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to load attendance records.');
        return;
      }

      applyAttendanceState(
        {
          year: data.year,
          month: data.month,
          daysInMonth: data.days_in_month,
          status: data.status || mode,
        },
        mapSavedEmployees(data),
      );
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

        Object.entries(employee.days).forEach(([day, dayRecord]) => {
          daysPayload[day] = {
            raw_logs: dayRecord.rawLogs,
            morning: dayRecord.morning,
            afternoon: dayRecord.afternoon,
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
  }, [attendanceMeta, employees]);

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

      applyAttendanceState(
        {
          year: data.year,
          month: data.month,
          daysInMonth: data.days_in_month,
          status: data.status || mode,
        },
        mapSavedEmployees(data),
      );
      setActivePopup(null);
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
    const shift = employees[employeeIndex]?.days[String(day)]?.[step];
    if (!shift) {
      return;
    }

    setActivePopup({
      employeeIndex,
      day,
      step,
      draftIn: normalizeTimeValue(shift.in) || getSuggestedTime(step, 'in'),
      draftOut: normalizeTimeValue(shift.out) || getSuggestedTime(step, 'out'),
      draftStatus: shift.status,
    });
  }, [employees]);

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
        const dayRecord = employee.days[dayKey];
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
        Upload attendance sheets, resolve missing shifts, and save final or draft reports.
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
            <div className="grid-2">
              <div className="form-field">
                <label>Month</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={uploadMonth}
                  onChange={(e) => setUploadMonth(Number(e.target.value))}
                  className="input"
                />
              </div>
              <div className="form-field">
                <label>Year</label>
                <input
                  type="number"
                  value={uploadYear}
                  onChange={(e) => setUploadYear(Number(e.target.value))}
                  className="input"
                />
              </div>
            </div>
            <button type="submit" disabled={isUploading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {isUploading ? 'Uploading...' : 'Upload & Parse Attendance'}
            </button>
          </form>
        </div>

        <div className="card floating-panel">
          <div className="pill">Controls</div>
          <h2 className="section-title" style={{ marginTop: '1rem' }}>Month Controls</h2>
          <div className="form-grid" style={{ marginTop: '1.2rem' }}>
            <div className="stat">
              <span className="stat-value">{uploadYear}</span>
              <span className="stat-label">Year</span>
            </div>
            <div className="stat">
              <span className="stat-value">{String(uploadMonth).padStart(2, '0')}</span>
              <span className="stat-label">Month</span>
            </div>
          </div>
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
          {attendanceMeta ? (
            <div style={{ marginTop: '1.2rem' }}>
              <div className="pill">{attendanceMeta.status}</div>
              <p className="muted" style={{ marginTop: '0.6rem' }}>
                Active month: {attendanceMeta.year}-{String(attendanceMeta.month).padStart(2, '0')}
              </p>
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
                  {dayNumbers.map((day) => (
                    <th key={`day-${day}`}>Day {day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, employeeIndex) => (
                  <AttendanceEmployeeRow
                    key={`${employee.workerId || employee.employeeName || 'employee'}-${employeeIndex}`}
                    employee={employee}
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
                  {activePopupEmployee.employeeName || activePopupEmployee.workerId || 'Employee'} · Day {activePopup.day} · {activePopup.step === 'morning' ? 'Morning shift' : 'Afternoon shift'}
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