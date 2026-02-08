'use client';
import { useMemo, useState } from 'react';
import useErrorPopup from '../../../hooks/useErrorPopup';

type ShiftStatus = 'present' | 'absent' | 'missing';

interface ShiftPayload {
  in: string;
  out: string;
  status: ShiftStatus;
}

interface DayRecord {
  rawLogs: string[];
  morning: ShiftPayload;
  afternoon: ShiftPayload;
  mode: 'normal' | 'abnormal';
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
  step: 'morning' | 'afternoon';
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

const API_BASE = 'http://localhost:8000/api/payroll/attendance-records';

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

const buildDayRecordFromLogs = (logs: string[]): DayRecord => {
  if (logs.length === 4) {
    return {
      rawLogs: logs,
      morning: { in: logs[0], out: logs[1], status: 'present' },
      afternoon: { in: logs[2], out: logs[3], status: 'present' },
      mode: 'normal',
    };
  }

  return {
    rawLogs: logs,
    morning: emptyShift(),
    afternoon: emptyShift(),
    mode: 'abnormal',
  };
};

const buildDayRecordFromSaved = (dayPayload?: SavedDayPayload): DayRecord => {
  const rawLogs = Array.isArray(dayPayload?.raw_logs) ? dayPayload?.raw_logs || [] : [];
  const morning = dayPayload?.morning || {};
  const afternoon = dayPayload?.afternoon || {};
  const morningPayload: ShiftPayload = {
    in: String(morning.in || ''),
    out: String(morning.out || ''),
    status: (morning.status as ShiftStatus) || 'missing',
  };
  const afternoonPayload: ShiftPayload = {
    in: String(afternoon.in || ''),
    out: String(afternoon.out || ''),
    status: (afternoon.status as ShiftStatus) || 'missing',
  };

  const isResolved = morningPayload.status !== 'missing' && afternoonPayload.status !== 'missing';
  const mode: 'normal' | 'abnormal' = isResolved ? 'normal' : rawLogs.length === 4 ? 'normal' : 'abnormal';

  return {
    rawLogs,
    morning: morningPayload,
    afternoon: afternoonPayload,
    mode,
  };
};

export default function EmployeePayrollPage() {
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [attendanceMeta, setAttendanceMeta] = useState<{ year: number; month: number; daysInMonth: number; status: string } | null>(null);
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
        day.mode === 'abnormal' || day.morning.status === 'missing' || day.afternoon.status === 'missing'
      )
    );
  }, [employees]);

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

      const parsedDayNumbers = Array.from({ length: data.days_in_month || 31 }, (_, index) => index + 1);
      const parsedEmployees: AttendanceEmployee[] = (data.employees || []).map((employee) => {
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

      setAttendanceMeta({
        year: data.year,
        month: data.month,
        daysInMonth: data.days_in_month,
        status: 'parsed',
      });
      setEmployees(parsedEmployees);
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
        `${API_BASE}${isDraft ? '/drafts/' : '/'}?year=${uploadYear}&month=${uploadMonth}`
      );
      const data = (await response.json()) as SavedAttendanceResponse;
      if (!response.ok) {
        showErrorPopup(getErrorMessage(data) || 'Failed to load attendance records.');
        return;
      }

      const loadedDayNumbers = Array.from({ length: data.days_in_month || 31 }, (_, index) => index + 1);
      const mappedEmployees: AttendanceEmployee[] = (data.employees || []).map((employee) => {
        const days: Record<string, DayRecord> = {};
        const dayMap = employee.days || {};

        loadedDayNumbers.forEach((day) => {
          const dayPayload = dayMap[String(day)] || {};
          days[String(day)] = buildDayRecordFromSaved(dayPayload);
        });

        return {
          employeeDbId: employee.employee_db_id || null,
          workerId: employee.worker_id || null,
          employeeName: employee.employee_name || null,
          department: employee.department || null,
          days,
        };
      });

      setAttendanceMeta({
        year: data.year,
        month: data.month,
        daysInMonth: data.days_in_month,
        status: data.status || mode,
      });
      setEmployees(mappedEmployees);
    } catch {
      showErrorPopup('Failed to load attendance records.');
    } finally {
      setter(false);
    }
  };

  const buildSavePayload = () => {
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
  };

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

      setAttendanceMeta({
        year: data.year,
        month: data.month,
        daysInMonth: data.days_in_month,
        status: data.status || mode,
      });
      const savedDayNumbers = Array.from({ length: data.days_in_month || 31 }, (_, index) => index + 1);
      setEmployees(
        (data.employees || []).map((employee) => {
          const days: Record<string, DayRecord> = {};
          const dayMap = employee.days || {};
          savedDayNumbers.forEach((day) => {
            const dayPayload = dayMap[String(day)];
            days[String(day)] = buildDayRecordFromSaved(dayPayload);
          });

          return {
            employeeDbId: employee.employee_db_id || null,
            workerId: employee.worker_id || null,
            employeeName: employee.employee_name || null,
            department: employee.department || null,
            days,
          };
        })
      );
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

  const openResolvePopup = (employeeIndex: number, day: number, step?: 'morning' | 'afternoon') => {
    const dayRecord = employees[employeeIndex].days[String(day)];
    const nextStep = step || (dayRecord.morning.status === 'missing' ? 'morning' : 'afternoon');
    setActivePopup({ employeeIndex, day, step: nextStep });
  };

  const updateDayRecord = (employeeIndex: number, day: number, updater: (record: DayRecord) => DayRecord) => {
    setEmployees((prev) => {
      const next = [...prev];
      const employee = { ...next[employeeIndex] };
      const dayKey = String(day);
      employee.days = { ...employee.days, [dayKey]: updater(employee.days[dayKey]) };
      next[employeeIndex] = employee;
      return next;
    });
  };

  const saveResolution = (type: 'manual' | 'absent') => {
    if (!activePopup) {
      return;
    }

    const { employeeIndex, day, step } = activePopup;
    updateDayRecord(employeeIndex, day, (record) => {
      const updated: DayRecord = {
        ...record,
        morning: { ...record.morning },
        afternoon: { ...record.afternoon },
      };

      const target = step === 'morning' ? updated.morning : updated.afternoon;
      if (type === 'absent') {
        target.status = 'absent';
        target.in = '';
        target.out = '';
      } else {
        target.status = 'present';
      }

      if (updated.mode === 'abnormal') {
        const bothResolved = updated.morning.status !== 'missing' && updated.afternoon.status !== 'missing';
        if (bothResolved) {
          updated.mode = 'normal';
        }
      }

      return updated;
    });

    setActivePopup(null);
  };

  const updatePopupTime = (field: 'in' | 'out', value: string) => {
    if (!activePopup) {
      return;
    }

    const { employeeIndex, day, step } = activePopup;
    updateDayRecord(employeeIndex, day, (record) => {
      const updated: DayRecord = {
        ...record,
        morning: { ...record.morning },
        afternoon: { ...record.afternoon },
      };
      const target = step === 'morning' ? updated.morning : updated.afternoon;
      target[field] = value;
      return updated;
    });
  };

  const renderShiftLabel = (shift: ShiftPayload) => {
    if (shift.status === 'absent') {
      return 'Absent';
    }
    if (!shift.in && !shift.out) {
      return '--';
    }
    return `${shift.in} - ${shift.out}`;
  };

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="section-title">Attendance Records</h2>
          <span className="pill">Draft + Final</span>
        </div>
        {employees.length === 0 ? (
          <p className="muted">No attendance records yet. Upload or load a month to start resolving.</p>
        ) : (
          <div className="overflow-x-auto" style={{ marginTop: '1rem' }}>
            <table className="table" style={{ minWidth: '1200px' }}>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  {dayNumbers.map((day) => (
                    <th key={`day-${day}`}>Day {day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, employeeIndex) => (
                  <tr key={`${employee.workerId || employee.employeeName}-${employeeIndex}`}>
                    <td>{employee.workerId || '-'}</td>
                    <td>{employee.employeeName || '-'}</td>
                    <td>{employee.department || '-'}</td>
                    {dayNumbers.map((day) => {
                      const dayRecord = employee.days[String(day)];
                      const showAbnormal = dayRecord.mode === 'abnormal';
                      const morningMissing = dayRecord.morning.status === 'missing';
                      const afternoonMissing = dayRecord.afternoon.status === 'missing';
                      const cellClickable = editMode && (showAbnormal || morningMissing || afternoonMissing);

                      return (
                        <td key={`${employeeIndex}-${day}`}>
                          {showAbnormal ? (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (cellClickable) {
                                  openResolvePopup(employeeIndex, day);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && cellClickable) {
                                  openResolvePopup(employeeIndex, day);
                                }
                              }}
                              style={{
                                background: '#c75757',
                                color: '#fff7f3',
                                padding: '0.6rem',
                                borderRadius: '12px',
                                minHeight: '72px',
                                cursor: cellClickable ? 'pointer' : 'default',
                                whiteSpace: 'pre-line',
                              }}
                            >
                              {dayRecord.rawLogs.length > 0 ? dayRecord.rawLogs.join('\n') : 'No logs'}
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (editMode && morningMissing) {
                                    openResolvePopup(employeeIndex, day, 'morning');
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' && editMode && morningMissing) {
                                    openResolvePopup(employeeIndex, day, 'morning');
                                  }
                                }}
                                style={{
                                  background: morningMissing ? '#c75757' : 'rgba(255, 255, 255, 0.08)',
                                  color: morningMissing ? '#fff7f3' : 'inherit',
                                  padding: '0.4rem',
                                  borderRadius: '10px',
                                  cursor: editMode && morningMissing ? 'pointer' : 'default',
                                }}
                              >
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.7 }}>Morning</div>
                                <div style={{ fontWeight: 600 }}>{renderShiftLabel(dayRecord.morning)}</div>
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (editMode && afternoonMissing) {
                                    openResolvePopup(employeeIndex, day, 'afternoon');
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' && editMode && afternoonMissing) {
                                    openResolvePopup(employeeIndex, day, 'afternoon');
                                  }
                                }}
                                style={{
                                  background: afternoonMissing ? '#c75757' : 'rgba(255, 255, 255, 0.08)',
                                  color: afternoonMissing ? '#fff7f3' : 'inherit',
                                  padding: '0.4rem',
                                  borderRadius: '10px',
                                  cursor: editMode && afternoonMissing ? 'pointer' : 'default',
                                }}
                              >
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.7 }}>Afternoon</div>
                                <div style={{ fontWeight: 600 }}>{renderShiftLabel(dayRecord.afternoon)}</div>
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activePopup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 8, 17, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1.5rem',
          }}
        >
          <div className="card" style={{ width: 'min(520px, 92vw)' }}>
            <h3 className="section-title">Resolve Attendance</h3>
            <p className="muted" style={{ marginTop: '0.4rem' }}>
              Day {activePopup.day} · {activePopup.step === 'morning' ? 'Morning shift' : 'Afternoon shift'}
            </p>
            <div className="form-grid" style={{ marginTop: '1.2rem' }}>
              <div className="form-field">
                <label>Check-in</label>
                <input
                  type="text"
                  className="input"
                  value={
                    activePopup.step === 'morning'
                      ? employees[activePopup.employeeIndex].days[String(activePopup.day)].morning.in
                      : employees[activePopup.employeeIndex].days[String(activePopup.day)].afternoon.in
                  }
                  onChange={(e) => updatePopupTime('in', e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Check-out</label>
                <input
                  type="text"
                  className="input"
                  value={
                    activePopup.step === 'morning'
                      ? employees[activePopup.employeeIndex].days[String(activePopup.day)].morning.out
                      : employees[activePopup.employeeIndex].days[String(activePopup.day)].afternoon.out
                  }
                  onChange={(e) => updatePopupTime('out', e.target.value)}
                />
              </div>
            </div>
            <div className="form-grid" style={{ marginTop: '1.2rem' }}>
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
              style={{ marginTop: '1rem' }}
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
