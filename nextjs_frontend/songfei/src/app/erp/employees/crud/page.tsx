'use client';

import {
  startTransition,
  type FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';

import useErrorPopup from '../../../hooks/useErrorPopup';

type EditorTab = 'details' | 'roster';
type RosterMode = 'saved' | 'builder';
type RosterPreset = 'standard' | 'all-week' | 'alternating-sunday-off';

interface EmployeeRosterAssignment {
  template_id: number | null;
  template_name: string | null;
  cycle_length_weeks: number | null;
  effective_start_date: string | null;
  summary_lines: string[];
}

interface Employee {
  id: number;
  name: string;
  base_salary: number;
  worker_id: string | null;
  is_active: boolean;
  roster_assignment?: EmployeeRosterAssignment | null;
}

interface RosterDay {
  week_index: number;
  day_of_week: number;
  is_working: boolean;
  morning_in: string;
  morning_out: string;
  afternoon_in: string;
  afternoon_out: string;
}

interface RosterTemplate {
  id: number;
  name: string;
  description: string;
  cycle_length_weeks: number;
  schedule: RosterDay[];
  is_active: boolean;
  usage_count: number;
  summary_lines: string[];
  created_at: string;
  updated_at: string;
}

interface NewEmployeeState {
  name: string;
  salary: string;
  workerId: string;
}

interface EmployeeFormState {
  name: string;
  salary: string;
  workerId: string;
  isActive: boolean;
}

interface ShiftTimes {
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  afternoonOut: string;
}

interface RosterBuilderState {
  name: string;
  description: string;
  cycleLengthWeeks: number;
  defaultTimes: ShiftTimes;
  schedule: RosterDay[];
  activeWeek: number;
  expandedDayKey: string | null;
}

interface EmployeeEditorState {
  employeeId: number;
  activeTab: EditorTab;
  rosterMode: RosterMode;
  selectedTemplateId: number | null;
  effectiveStartDate: string;
  confirmDelete: boolean;
  form: EmployeeFormState;
  builder: RosterBuilderState;
}

interface CompactTimeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface RosterTemplateCardProps {
  template: RosterTemplate;
  selected: boolean;
  isAssigned: boolean;
  onSelect: () => void;
}

interface RosterDayCardProps {
  day: RosterDay;
  defaultTimes: ShiftTimes;
  isExpanded: boolean;
  onToggleWorking: () => void;
  onUseDefaults: () => void;
  onToggleExpanded: () => void;
  onChangeTime: (field: keyof Pick<RosterDay, 'morning_in' | 'morning_out' | 'afternoon_in' | 'afternoon_out'>, value: string) => void;
}

const EMPLOYEE_API = 'http://localhost:8000/api/employees/';
const ROSTER_TEMPLATE_API = 'http://localhost:8000/api/roster-templates/';
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_PRESETS = ['00', '05', '10', '15', '30', '45'];
const DEFAULT_SHIFT_TIMES: ShiftTimes = {
  morningIn: '08:00',
  morningOut: '12:00',
  afternoonIn: '13:00',
  afternoonOut: '17:30',
};

const numberFormatter = new Intl.NumberFormat('en-US');

const extractApiError = (data: unknown, fallbackMessage: string) => {
  if (!data || typeof data !== 'object') {
    return fallbackMessage;
  }

  if ('error' in data && typeof data.error === 'string') {
    return data.error;
  }

  for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0) {
      return `${field}: ${value.join(' ')}`;
    }
    if (typeof value === 'string') {
      return `${field}: ${value}`;
    }
  }

  return fallbackMessage;
};

const normalizeTimeValue = (value: string) => {
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

const adjustTimeByMinutes = (value: string, delta: number) => {
  const normalizedValue = normalizeTimeValue(value) || '00:00';
  const [hourText, minuteText] = normalizedValue.split(':');
  const totalMinutes = Number.parseInt(hourText, 10) * 60 + Number.parseInt(minuteText, 10);
  const nextMinutes = (totalMinutes + delta + 1440) % 1440;
  const nextHour = Math.floor(nextMinutes / 60);
  const nextMinute = nextMinutes % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
};

const formatShiftPreview = (value: string) => normalizeTimeValue(value) || '--:--';

const cloneDefaultTimes = (): ShiftTimes => ({ ...DEFAULT_SHIFT_TIMES });

const getTodayIso = () => new Date().toISOString().slice(0, 10);

const getDayKey = (weekIndex: number, dayOfWeek: number) => `${weekIndex}-${dayOfWeek}`;

const sortEmployees = (employees: Employee[]) => {
  return [...employees].sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }
    return left.id - right.id;
  });
};

const sortRosterTemplates = (templates: RosterTemplate[]) => {
  return [...templates].sort((left, right) => left.name.localeCompare(right.name));
};

const buildBlankSchedule = (cycleLengthWeeks: number, defaultTimes = cloneDefaultTimes()) => {
  const schedule: RosterDay[] = [];

  for (let weekIndex = 1; weekIndex <= cycleLengthWeeks; weekIndex += 1) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      schedule.push({
        week_index: weekIndex,
        day_of_week: dayOfWeek,
        is_working: false,
        morning_in: defaultTimes.morningIn,
        morning_out: defaultTimes.morningOut,
        afternoon_in: defaultTimes.afternoonIn,
        afternoon_out: defaultTimes.afternoonOut,
      });
    }
  }

  return schedule;
};

const normalizeRosterSchedule = (cycleLengthWeeks: number, schedule: RosterDay[], defaultTimes: ShiftTimes) => {
  const scheduleMap = new Map<string, RosterDay>();

  buildBlankSchedule(cycleLengthWeeks, defaultTimes).forEach((entry) => {
    scheduleMap.set(getDayKey(entry.week_index, entry.day_of_week), entry);
  });

  schedule.forEach((entry) => {
    if (entry.week_index > cycleLengthWeeks) {
      return;
    }

    scheduleMap.set(getDayKey(entry.week_index, entry.day_of_week), {
      week_index: entry.week_index,
      day_of_week: entry.day_of_week,
      is_working: Boolean(entry.is_working),
      morning_in: normalizeTimeValue(entry.morning_in) || defaultTimes.morningIn,
      morning_out: normalizeTimeValue(entry.morning_out) || defaultTimes.morningOut,
      afternoon_in: normalizeTimeValue(entry.afternoon_in) || defaultTimes.afternoonIn,
      afternoon_out: normalizeTimeValue(entry.afternoon_out) || defaultTimes.afternoonOut,
    });
  });

  return Array.from(scheduleMap.values()).sort((left, right) => {
    if (left.week_index !== right.week_index) {
      return left.week_index - right.week_index;
    }
    return left.day_of_week - right.day_of_week;
  });
};

const applyDefaultsToWorkingDays = (schedule: RosterDay[], defaultTimes: ShiftTimes) => {
  return schedule.map((entry) => {
    if (!entry.is_working) {
      return entry;
    }

    return {
      ...entry,
      morning_in: defaultTimes.morningIn,
      morning_out: defaultTimes.morningOut,
      afternoon_in: defaultTimes.afternoonIn,
      afternoon_out: defaultTimes.afternoonOut,
    };
  });
};

const buildPresetBuilder = (preset: RosterPreset, employeeName: string) => {
  const defaultTimes = cloneDefaultTimes();
  const baseName = employeeName ? `${employeeName} roster` : 'Roster template';

  if (preset === 'all-week') {
    const schedule = buildBlankSchedule(1, defaultTimes).map((entry) => ({ ...entry, is_working: true }));
    return {
      name: `${baseName} · all week`,
      description: '7-day roster with the same split shift every day.',
      cycleLengthWeeks: 1,
      defaultTimes,
      schedule,
      activeWeek: 1,
      expandedDayKey: null,
    };
  }

  if (preset === 'alternating-sunday-off') {
    const schedule = buildBlankSchedule(2, defaultTimes).map((entry) => {
      const sundayOffOnWeekTwo = entry.week_index === 2 && entry.day_of_week === 6;
      return {
        ...entry,
        is_working: !sundayOffOnWeekTwo,
      };
    });

    return {
      name: `${baseName} · alternating Sunday off`,
      description: 'Week 1 works seven days, week 2 rests on Sunday.',
      cycleLengthWeeks: 2,
      defaultTimes,
      schedule,
      activeWeek: 1,
      expandedDayKey: null,
    };
  }

  const schedule = buildBlankSchedule(1, defaultTimes).map((entry) => ({
    ...entry,
    is_working: entry.day_of_week < 6,
  }));

  return {
    name: `${baseName} · Mon-Sat`,
    description: 'Monday to Saturday split shift with Sunday off.',
    cycleLengthWeeks: 1,
    defaultTimes,
    schedule,
    activeWeek: 1,
    expandedDayKey: null,
  };
};

const createEditorState = (employee: Employee): EmployeeEditorState => ({
  employeeId: employee.id,
  activeTab: 'details',
  rosterMode: 'saved',
  selectedTemplateId: employee.roster_assignment?.template_id ?? null,
  effectiveStartDate: employee.roster_assignment?.effective_start_date || getTodayIso(),
  confirmDelete: false,
  form: {
    name: employee.name,
    salary: String(employee.base_salary),
    workerId: employee.worker_id || '',
    isActive: employee.is_active,
  },
  builder: buildPresetBuilder('standard', employee.name),
});

const formatRosterDaySummary = (day: RosterDay) => {
  if (!day.is_working) {
    return 'Rest day';
  }

  return `${day.morning_in}-${day.morning_out} / ${day.afternoon_in}-${day.afternoon_out}`;
};

const isUsingDefaultTimes = (day: RosterDay, defaultTimes: ShiftTimes) => {
  return (
    day.morning_in === defaultTimes.morningIn &&
    day.morning_out === defaultTimes.morningOut &&
    day.afternoon_in === defaultTimes.afternoonIn &&
    day.afternoon_out === defaultTimes.afternoonOut
  );
};

function CompactTimeInput({ label, value, onChange }: CompactTimeInputProps) {
  const { hour, minute } = splitTimeValue(value);

  return (
    <div className="roster-mini-time">
      <div className="roster-mini-time-header">
        <span>{label}</span>
        <strong>{formatShiftPreview(value)}</strong>
      </div>
      <div className="roster-mini-time-selects">
        <select className="select" value={hour} onChange={(event) => onChange(`${event.target.value}:${minute}`)}>
          {HOUR_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select className="select" value={minute} onChange={(event) => onChange(`${hour}:${event.target.value}`)}>
          {MINUTE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="roster-mini-time-chip-strip">
        <button type="button" className="payroll-time-chip payroll-time-chip-muted" onClick={() => onChange(adjustTimeByMinutes(value, -5))}>-5m</button>
        <button type="button" className="payroll-time-chip payroll-time-chip-muted" onClick={() => onChange(adjustTimeByMinutes(value, 5))}>+5m</button>
        {MINUTE_PRESETS.map((preset) => (
          <button key={preset} type="button" className="payroll-time-chip payroll-time-chip-muted" onClick={() => onChange(`${hour}:${preset}`)}>
            :{preset}
          </button>
        ))}
      </div>
    </div>
  );
}

function RosterTemplateCard({ template, selected, isAssigned, onSelect }: RosterTemplateCardProps) {
  return (
    <button
      type="button"
      className={`roster-template-card${selected ? ' roster-template-card-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="roster-template-card-header">
        <div>
          <div className="roster-template-card-title">{template.name}</div>
          <div className="roster-template-card-meta">
            {template.cycle_length_weeks} week cycle · {template.usage_count} assigned
          </div>
        </div>
        {isAssigned ? <span className="pill">Assigned</span> : null}
      </div>
      {template.description ? <p className="muted">{template.description}</p> : null}
      <div className="roster-summary-list">
        {template.summary_lines.map((line) => (
          <span key={line} className="roster-summary-line">{line}</span>
        ))}
      </div>
    </button>
  );
}

function RosterDayCard({
  day,
  defaultTimes,
  isExpanded,
  onToggleWorking,
  onUseDefaults,
  onToggleExpanded,
  onChangeTime,
}: RosterDayCardProps) {
  return (
    <div className={`roster-day-card${day.is_working ? '' : ' roster-day-card-off'}`}>
      <div className="roster-day-header">
        <div>
          <div className="roster-day-title">{WEEKDAY_LABELS[day.day_of_week]}</div>
          <div className="roster-day-copy">{formatRosterDaySummary(day)}</div>
        </div>
        <button type="button" className="btn btn-outline" onClick={onToggleWorking}>
          {day.is_working ? 'Working' : 'Day Off'}
        </button>
      </div>

      {day.is_working ? (
        <>
          <div className="roster-day-meta">
            <span className="pill">{isUsingDefaultTimes(day, defaultTimes) ? 'Using defaults' : 'Custom hours'}</span>
          </div>
          <div className="roster-day-actions">
            <button type="button" className="btn btn-ghost" onClick={onUseDefaults}>Use Defaults</button>
            <button type="button" className="btn btn-outline" onClick={onToggleExpanded}>
              {isExpanded ? 'Hide Customiser' : 'Customise'}
            </button>
          </div>
          {isExpanded ? (
            <div className="roster-mini-time-grid">
              <CompactTimeInput label="Morning in" value={day.morning_in} onChange={(value) => onChangeTime('morning_in', value)} />
              <CompactTimeInput label="Morning out" value={day.morning_out} onChange={(value) => onChangeTime('morning_out', value)} />
              <CompactTimeInput label="Afternoon in" value={day.afternoon_in} onChange={(value) => onChangeTime('afternoon_in', value)} />
              <CompactTimeInput label="Afternoon out" value={day.afternoon_out} onChange={(value) => onChangeTime('afternoon_out', value)} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">No shifts are expected on this day.</p>
      )}
    </div>
  );
}

export default function EmployeeCrudPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rosterTemplates, setRosterTemplates] = useState<RosterTemplate[]>([]);
  const [newEmployee, setNewEmployee] = useState<NewEmployeeState>({ name: '', salary: '', workerId: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false);
  const [activeEditor, setActiveEditor] = useState<EmployeeEditorState | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const { showErrorPopup } = useErrorPopup();

  const activeEmployee = useMemo(() => {
    if (!activeEditor) {
      return null;
    }
    return employees.find((employee) => employee.id === activeEditor.employeeId) || null;
  }, [activeEditor, employees]);

  const visibleEmployees = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();
    if (!query) {
      return employees;
    }

    return employees.filter((employee) => {
      const fields = [
        employee.name,
        employee.worker_id || '',
        employee.is_active ? 'active' : 'inactive',
        String(employee.id),
      ];
      return fields.some((field) => field.toLowerCase().includes(query));
    });
  }, [deferredSearchTerm, employees]);

  const activeCount = useMemo(() => employees.filter((employee) => employee.is_active).length, [employees]);

  const bootstrapPage = useCallback(async () => {
    try {
      setIsLoading(true);
      const [employeesResponse, templatesResponse] = await Promise.all([
        fetch(EMPLOYEE_API),
        fetch(ROSTER_TEMPLATE_API),
      ]);
      const employeesData = await employeesResponse.json();
      const templatesData = await templatesResponse.json();

      if (!employeesResponse.ok) {
        throw new Error(extractApiError(employeesData, 'Failed to fetch employees.'));
      }
      if (!templatesResponse.ok) {
        throw new Error(extractApiError(templatesData, 'Failed to fetch roster templates.'));
      }

      startTransition(() => {
        setEmployees(sortEmployees(employeesData as Employee[]));
        setRosterTemplates(sortRosterTemplates(templatesData as RosterTemplate[]));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load employee directory.';
      showErrorPopup(message);
    } finally {
      setIsLoading(false);
    }
  }, [showErrorPopup]);

  useEffect(() => {
    void bootstrapPage();
  }, [bootstrapPage]);

  useEffect(() => {
    if (activeEditor && !activeEmployee) {
      setActiveEditor(null);
    }
  }, [activeEditor, activeEmployee]);

  const syncEmployeeInState = useCallback((updatedEmployee: Employee) => {
    startTransition(() => {
      setEmployees((previous) => sortEmployees(previous.map((employee) => (
        employee.id === updatedEmployee.id ? updatedEmployee : employee
      ))));
      setActiveEditor((previous) => {
        if (!previous || previous.employeeId !== updatedEmployee.id) {
          return previous;
        }

        return {
          ...previous,
          form: {
            name: updatedEmployee.name,
            salary: String(updatedEmployee.base_salary),
            workerId: updatedEmployee.worker_id || '',
            isActive: updatedEmployee.is_active,
          },
          selectedTemplateId: updatedEmployee.roster_assignment?.template_id ?? previous.selectedTemplateId,
          effectiveStartDate: updatedEmployee.roster_assignment?.effective_start_date || previous.effectiveStartDate,
          confirmDelete: false,
        };
      });
    });
  }, []);

  const createEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newEmployee.name.trim();
    const parsedSalary = Number.parseFloat(newEmployee.salary);
    if (!trimmedName || Number.isNaN(parsedSalary)) {
      showErrorPopup('Enter a valid employee name and base salary.');
      return;
    }

    try {
      setIsCreatingEmployee(true);
      const response = await fetch(EMPLOYEE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          base_salary: parsedSalary,
          worker_id: newEmployee.workerId.trim() || null,
          is_active: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(extractApiError(data, 'Failed to create employee.'));
        return;
      }

      startTransition(() => {
        setEmployees((previous) => sortEmployees([...previous, data as Employee]));
      });
      setNewEmployee({ name: '', salary: '', workerId: '' });
    } catch {
      showErrorPopup('Failed to create employee.');
    } finally {
      setIsCreatingEmployee(false);
    }
  };

  const openEditor = (employee: Employee) => {
    setActiveEditor(createEditorState(employee));
  };

  const updateEditor = (updater: (previous: EmployeeEditorState) => EmployeeEditorState) => {
    setActiveEditor((previous) => {
      if (!previous) {
        return previous;
      }
      return updater(previous);
    });
  };

  const saveEmployeeDetails = async () => {
    if (!activeEditor) {
      return;
    }

    const parsedSalary = Number.parseFloat(activeEditor.form.salary);
    if (!activeEditor.form.name.trim() || Number.isNaN(parsedSalary)) {
      showErrorPopup('Enter a valid name and base salary before saving.');
      return;
    }

    try {
      setIsSavingEmployee(true);
      const response = await fetch(`${EMPLOYEE_API}${activeEditor.employeeId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeEditor.form.name.trim(),
          base_salary: parsedSalary,
          worker_id: activeEditor.form.workerId.trim() || null,
          is_active: activeEditor.form.isActive,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        showErrorPopup(extractApiError(data, 'Failed to update employee.'));
        return;
      }

      syncEmployeeInState(data as Employee);
    } catch {
      showErrorPopup('Failed to update employee.');
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const assignRosterTemplate = async (templateId: number) => {
    if (!activeEditor) {
      return;
    }
    if (!activeEditor.effectiveStartDate) {
      showErrorPopup('Choose the date this roster cycle starts.');
      return;
    }

    try {
      setIsSavingRoster(true);
      const response = await fetch(`${EMPLOYEE_API}${activeEditor.employeeId}/roster-assignment/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          effective_start_date: activeEditor.effectiveStartDate,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        showErrorPopup(extractApiError(data, 'Failed to assign roster.'));
        return;
      }

      syncEmployeeInState(data as Employee);
      updateEditor((previous) => ({
        ...previous,
        rosterMode: 'saved',
        selectedTemplateId: templateId,
      }));
    } catch {
      showErrorPopup('Failed to assign roster.');
    } finally {
      setIsSavingRoster(false);
    }
  };

  const clearRosterAssignment = async () => {
    if (!activeEditor) {
      return;
    }

    try {
      setIsSavingRoster(true);
      const response = await fetch(`${EMPLOYEE_API}${activeEditor.employeeId}/roster-assignment/`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        showErrorPopup(extractApiError(data, 'Failed to clear roster assignment.'));
        return;
      }

      syncEmployeeInState(data as Employee);
      updateEditor((previous) => ({
        ...previous,
        selectedTemplateId: null,
      }));
    } catch {
      showErrorPopup('Failed to clear roster assignment.');
    } finally {
      setIsSavingRoster(false);
    }
  };

  const createTemplateAndAssign = async () => {
    if (!activeEditor) {
      return;
    }

    const builderName = activeEditor.builder.name.trim();
    if (!builderName) {
      showErrorPopup('Name the roster template before saving it.');
      return;
    }

    if (!activeEditor.effectiveStartDate) {
      showErrorPopup('Choose the date this roster cycle starts.');
      return;
    }

    try {
      setIsSavingRoster(true);
      const templateResponse = await fetch(ROSTER_TEMPLATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: builderName,
          description: activeEditor.builder.description.trim(),
          cycle_length_weeks: activeEditor.builder.cycleLengthWeeks,
          schedule: activeEditor.builder.schedule,
          is_active: true,
        }),
      });
      const templateData = await templateResponse.json();

      if (!templateResponse.ok) {
        showErrorPopup(extractApiError(templateData, 'Failed to save roster template.'));
        return;
      }

      startTransition(() => {
        setRosterTemplates((previous) => sortRosterTemplates([...previous, templateData as RosterTemplate]));
      });

      await assignRosterTemplate((templateData as RosterTemplate).id);
    } catch {
      showErrorPopup('Failed to save roster template.');
    } finally {
      setIsSavingRoster(false);
    }
  };

  const deleteEmployee = async () => {
    if (!activeEditor) {
      return;
    }

    if (!activeEditor.confirmDelete) {
      updateEditor((previous) => ({ ...previous, confirmDelete: true }));
      return;
    }

    if (!window.confirm(`Delete ${activeEditor.form.name}? This cannot be undone.`)) {
      return;
    }

    try {
      setIsDeletingEmployee(true);
      const response = await fetch(`${EMPLOYEE_API}${activeEditor.employeeId}/`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        showErrorPopup('Failed to delete employee.');
        return;
      }

      startTransition(() => {
        setEmployees((previous) => previous.filter((employee) => employee.id !== activeEditor.employeeId));
      });
      setActiveEditor(null);
    } catch {
      showErrorPopup('Failed to delete employee.');
    } finally {
      setIsDeletingEmployee(false);
    }
  };

  const activeWeekSchedule = useMemo(() => {
    if (!activeEditor) {
      return [] as RosterDay[];
    }

    return activeEditor.builder.schedule.filter((entry) => entry.week_index === activeEditor.builder.activeWeek);
  }, [activeEditor]);

  return (
    <div>
      <div className="kicker">Employee Records</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Edit people once, keep payroll aligned.</h1>
      <p className="hero-copy">
        Attendance matching now depends on both the machine worker ID and the employee name, so this directory doubles as the control room for identity, status, and reusable shift rosters.
      </p>

      <div className="grid-2" style={{ marginTop: '2rem' }}>
        <div className="card card-glass">
          <h2 className="section-title">Add New Employee</h2>
          <form onSubmit={createEmployee} className="form-grid" style={{ marginTop: '1.2rem' }}>
            <div className="form-field">
              <label>Name</label>
              <input
                type="text"
                value={newEmployee.name}
                onChange={(event) => setNewEmployee((previous) => ({ ...previous, name: event.target.value }))}
                className="input"
                placeholder="Employee name exactly as exported by the machine"
                required
              />
            </div>
            <div className="form-field">
              <label>Base Salary (Kip)</label>
              <input
                type="number"
                step="0.01"
                value={newEmployee.salary}
                onChange={(event) => setNewEmployee((previous) => ({ ...previous, salary: event.target.value }))}
                className="input"
                placeholder="e.g. 1200000"
                required
              />
            </div>
            <div className="form-field">
              <label>Worker ID</label>
              <input
                type="text"
                value={newEmployee.workerId}
                onChange={(event) => setNewEmployee((previous) => ({ ...previous, workerId: event.target.value }))}
                className="input"
                placeholder="Machine employee ID / 工号"
              />
            </div>
            <p className="muted">
              Keep the name and worker ID aligned with the fingerprint export. The system now treats that pair as the attendance identity.
            </p>
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={isCreatingEmployee}>
              {isCreatingEmployee ? 'Adding Employee...' : 'Add Employee'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="section-title">Directory Pulse</h2>
          <div className="form-grid" style={{ marginTop: '1.2rem' }}>
            <div className="form-field">
              <label>Search employees</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by ID, name, worker ID, or status"
                className="input"
              />
            </div>
          </div>
          <div className="divider" />
          <div className="grid-3">
            <div className="stat">
              <span className="stat-value">{visibleEmployees.length}</span>
              <span className="stat-label">Visible Employees</span>
            </div>
            <div className="stat">
              <span className="stat-value">{activeCount}</span>
              <span className="stat-label">Active Staff</span>
            </div>
            <div className="stat">
              <span className="stat-value">{rosterTemplates.length}</span>
              <span className="stat-label">Saved Rosters</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <h2 className="section-title">Employee Directory</h2>
          <span className="pill">Popup Editor</span>
        </div>
        {isLoading ? (
          <p className="muted">Loading employees and roster templates...</p>
        ) : visibleEmployees.length === 0 ? (
          <p className="muted">No employees match the current search.</p>
        ) : (
          <div className="overflow-x-auto" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Salary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((employee, index) => (
                  <tr key={employee.id} className={index % 2 === 0 ? 'table-row-highlight' : ''}>
                    <td>{employee.id}</td>
                    <td>{employee.name}</td>
                    <td>{numberFormatter.format(employee.base_salary)}</td>
                    <td>
                      <span className="pill" style={{ color: employee.is_active ? '#9cf0b9' : '#f7b07f' }}>
                        {employee.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-outline" onClick={() => openEditor(employee)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeEditor && activeEmployee ? (
        <div className="employee-modal-backdrop">
          <div className="card employee-modal-card">
            <div className="employee-modal-header">
              <div>
                <div className="kicker">Employee Editor</div>
                <h2 className="section-title" style={{ marginBottom: 0 }}>{activeEmployee.name}</h2>
                <p className="muted" style={{ marginTop: '0.45rem' }}>
                  ERP ID {activeEmployee.id} · Worker ID {activeEmployee.worker_id || 'Not set'}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setActiveEditor(null)}>Close</button>
            </div>

            <div className="employee-modal-tabs">
              <button
                type="button"
                className={`employee-modal-tab${activeEditor.activeTab === 'details' ? ' employee-modal-tab-active' : ''}`}
                onClick={() => updateEditor((previous) => ({ ...previous, activeTab: 'details' }))}
              >
                Details
              </button>
              <button
                type="button"
                className={`employee-modal-tab${activeEditor.activeTab === 'roster' ? ' employee-modal-tab-active' : ''}`}
                onClick={() => updateEditor((previous) => ({ ...previous, activeTab: 'roster' }))}
              >
                Roster
              </button>
            </div>

            {activeEditor.activeTab === 'details' ? (
              <div className="employee-editor-grid">
                <div className="form-field">
                  <label>Internal ERP ID</label>
                  <input type="text" className="input" value={String(activeEmployee.id)} readOnly />
                </div>
                <div className="form-field">
                  <label>Employee Name</label>
                  <input
                    type="text"
                    className="input"
                    value={activeEditor.form.name}
                    onChange={(event) => updateEditor((previous) => ({
                      ...previous,
                      form: { ...previous.form, name: event.target.value },
                    }))}
                  />
                </div>
                <div className="form-field">
                  <label>Worker ID</label>
                  <input
                    type="text"
                    className="input"
                    value={activeEditor.form.workerId}
                    onChange={(event) => updateEditor((previous) => ({
                      ...previous,
                      form: { ...previous.form, workerId: event.target.value },
                    }))}
                  />
                </div>
                <div className="form-field">
                  <label>Base Salary (Kip)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={activeEditor.form.salary}
                    onChange={(event) => updateEditor((previous) => ({
                      ...previous,
                      form: { ...previous.form, salary: event.target.value },
                    }))}
                  />
                </div>

                <div className="employee-status-panel">
                  <div>
                    <div className="payroll-time-label">Payroll Status</div>
                    <p className="muted" style={{ marginTop: '0.45rem' }}>
                      Only active employees appear in the payroll attendance page.
                    </p>
                  </div>
                  <div className="employee-status-actions">
                    <button
                      type="button"
                      className={`employee-status-chip${activeEditor.form.isActive ? ' employee-status-chip-active' : ''}`}
                      onClick={() => updateEditor((previous) => ({
                        ...previous,
                        form: { ...previous.form, isActive: true },
                      }))}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      className={`employee-status-chip${!activeEditor.form.isActive ? ' employee-status-chip-inactive' : ''}`}
                      onClick={() => updateEditor((previous) => ({
                        ...previous,
                        form: { ...previous.form, isActive: false },
                      }))}
                    >
                      Inactive
                    </button>
                  </div>
                </div>

                <div className="employee-note-panel">
                  <div className="payroll-time-label">Attendance Identity</div>
                  <p className="muted" style={{ marginTop: '0.45rem' }}>
                    Keep the employee name and worker ID in sync with the fingerprint export. The parser now uses that exact pair to decide which attendance rows belong to this employee.
                  </p>
                </div>

                <div className="employee-modal-actions">
                  <button type="button" className="btn btn-primary" onClick={saveEmployeeDetails} disabled={isSavingEmployee}>
                    {isSavingEmployee ? 'Saving Changes...' : 'Save Details'}
                  </button>
                </div>

                <div className="employee-danger-zone">
                  <div>
                    <div className="payroll-time-label">Danger Zone</div>
                    <p className="muted" style={{ marginTop: '0.45rem' }}>
                      Delete removes the employee record and its roster assignment. The modal asks twice before it proceeds.
                    </p>
                  </div>
                  <div className="employee-modal-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ borderColor: 'rgba(255, 107, 107, 0.4)', color: 'var(--danger)' }}
                      onClick={deleteEmployee}
                      disabled={isDeletingEmployee}
                    >
                      {activeEditor.confirmDelete ? (isDeletingEmployee ? 'Deleting...' : 'Confirm Delete') : 'Delete Employee'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-grid">
                <div className="employee-roster-assignment-card">
                  <div className="employee-roster-assignment-header">
                    <div>
                      <div className="payroll-time-label">Current Assignment</div>
                      <h3 style={{ margin: '0.45rem 0 0' }}>{activeEmployee.roster_assignment?.template_name || 'No roster assigned yet'}</h3>
                    </div>
                    {activeEmployee.roster_assignment?.template_name ? <span className="pill">Live</span> : <span className="pill">Unset</span>}
                  </div>
                  {activeEmployee.roster_assignment?.summary_lines?.length ? (
                    <div className="roster-summary-list">
                      {activeEmployee.roster_assignment.summary_lines.map((line) => (
                        <span key={line} className="roster-summary-line">{line}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Assign a template so payroll can understand expected work days and alternating cycles later on.</p>
                  )}
                  <div className="form-field" style={{ marginTop: '1rem' }}>
                    <label>Cycle Start Date</label>
                    <input
                      type="date"
                      className="input"
                      value={activeEditor.effectiveStartDate}
                      onChange={(event) => updateEditor((previous) => ({ ...previous, effectiveStartDate: event.target.value }))}
                    />
                  </div>
                  <p className="muted">
                    This anchor date tells the system when week 1 starts, which is required for rotating rosters like the alternating Sunday-off pattern.
                  </p>
                </div>

                <div className="employee-modal-tabs">
                  <button
                    type="button"
                    className={`employee-modal-tab${activeEditor.rosterMode === 'saved' ? ' employee-modal-tab-active' : ''}`}
                    onClick={() => updateEditor((previous) => ({ ...previous, rosterMode: 'saved' }))}
                  >
                    Saved Rosters
                  </button>
                  <button
                    type="button"
                    className={`employee-modal-tab${activeEditor.rosterMode === 'builder' ? ' employee-modal-tab-active' : ''}`}
                    onClick={() => updateEditor((previous) => ({ ...previous, rosterMode: 'builder' }))}
                  >
                    Build New
                  </button>
                </div>

                {activeEditor.rosterMode === 'saved' ? (
                  <>
                    <div className="roster-template-grid">
                      {rosterTemplates.map((template) => (
                        <RosterTemplateCard
                          key={template.id}
                          template={template}
                          selected={activeEditor.selectedTemplateId === template.id}
                          isAssigned={activeEmployee.roster_assignment?.template_id === template.id}
                          onSelect={() => updateEditor((previous) => ({ ...previous, selectedTemplateId: template.id }))}
                        />
                      ))}
                    </div>
                    <div className="employee-modal-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => activeEditor.selectedTemplateId && assignRosterTemplate(activeEditor.selectedTemplateId)}
                        disabled={isSavingRoster || !activeEditor.selectedTemplateId}
                      >
                        {isSavingRoster ? 'Saving Roster...' : 'Assign Selected Roster'}
                      </button>
                      <button type="button" className="btn btn-outline" onClick={clearRosterAssignment} disabled={isSavingRoster}>
                        Clear Roster
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="form-grid">
                    <div className="roster-builder-panel">
                      <div className="roster-builder-header">
                        <div>
                          <div className="payroll-time-label">Preset Patterns</div>
                          <p className="muted" style={{ marginTop: '0.45rem' }}>
                            Start from a common pattern, then fine-tune the days that differ.
                          </p>
                        </div>
                        <div className="roster-preset-strip">
                          <button type="button" className="btn btn-outline" onClick={() => updateEditor((previous) => ({ ...previous, builder: buildPresetBuilder('standard', previous.form.name) }))}>Mon-Sat</button>
                          <button type="button" className="btn btn-outline" onClick={() => updateEditor((previous) => ({ ...previous, builder: buildPresetBuilder('all-week', previous.form.name) }))}>All Week</button>
                          <button type="button" className="btn btn-outline" onClick={() => updateEditor((previous) => ({ ...previous, builder: buildPresetBuilder('alternating-sunday-off', previous.form.name) }))}>Alt Sunday Off</button>
                        </div>
                      </div>

                      <div className="grid-2" style={{ marginTop: '1rem' }}>
                        <div className="form-field">
                          <label>Roster Name</label>
                          <input
                            type="text"
                            className="input"
                            value={activeEditor.builder.name}
                            onChange={(event) => updateEditor((previous) => ({
                              ...previous,
                              builder: { ...previous.builder, name: event.target.value },
                            }))}
                            placeholder="e.g. Sales 7-day rotation"
                          />
                        </div>
                        <div className="form-field">
                          <label>Cycle Length</label>
                          <select
                            className="select"
                            value={activeEditor.builder.cycleLengthWeeks}
                            onChange={(event) => {
                              const nextCycleLength = Number.parseInt(event.target.value, 10);
                              updateEditor((previous) => ({
                                ...previous,
                                builder: {
                                  ...previous.builder,
                                  cycleLengthWeeks: nextCycleLength,
                                  activeWeek: Math.min(previous.builder.activeWeek, nextCycleLength),
                                  schedule: normalizeRosterSchedule(nextCycleLength, previous.builder.schedule, previous.builder.defaultTimes),
                                  expandedDayKey:
                                    previous.builder.expandedDayKey && Number.parseInt(previous.builder.expandedDayKey.split('-')[0], 10) <= nextCycleLength
                                      ? previous.builder.expandedDayKey
                                      : null,
                                },
                              }));
                            }}
                          >
                            <option value={1}>1 week</option>
                            <option value={2}>2 weeks</option>
                            <option value={3}>3 weeks</option>
                            <option value={4}>4 weeks</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-field" style={{ marginTop: '1rem' }}>
                        <label>Description</label>
                        <textarea
                          className="textarea"
                          rows={3}
                          value={activeEditor.builder.description}
                          onChange={(event) => updateEditor((previous) => ({
                            ...previous,
                            builder: { ...previous.builder, description: event.target.value },
                          }))}
                          placeholder="Optional note about who uses this roster"
                        />
                      </div>

                      <div className="payroll-time-grid" style={{ marginTop: '1rem' }}>
                        <div className="payroll-time-card">
                          <div className="payroll-time-card-header">
                            <div>
                              <div className="payroll-time-label">Default Morning Shift</div>
                              <div className="payroll-time-help">Applied to working days unless you customise a specific day.</div>
                            </div>
                          </div>
                          <div className="roster-mini-time-grid">
                            <CompactTimeInput
                              label="Morning in"
                              value={activeEditor.builder.defaultTimes.morningIn}
                              onChange={(value) => updateEditor((previous) => ({
                                ...previous,
                                builder: {
                                  ...previous.builder,
                                  defaultTimes: { ...previous.builder.defaultTimes, morningIn: value },
                                },
                              }))}
                            />
                            <CompactTimeInput
                              label="Morning out"
                              value={activeEditor.builder.defaultTimes.morningOut}
                              onChange={(value) => updateEditor((previous) => ({
                                ...previous,
                                builder: {
                                  ...previous.builder,
                                  defaultTimes: { ...previous.builder.defaultTimes, morningOut: value },
                                },
                              }))}
                            />
                          </div>
                        </div>

                        <div className="payroll-time-card">
                          <div className="payroll-time-card-header">
                            <div>
                              <div className="payroll-time-label">Default Afternoon Shift</div>
                              <div className="payroll-time-help">Use the same minute-precise controls as attendance resolution.</div>
                            </div>
                          </div>
                          <div className="roster-mini-time-grid">
                            <CompactTimeInput
                              label="Afternoon in"
                              value={activeEditor.builder.defaultTimes.afternoonIn}
                              onChange={(value) => updateEditor((previous) => ({
                                ...previous,
                                builder: {
                                  ...previous.builder,
                                  defaultTimes: { ...previous.builder.defaultTimes, afternoonIn: value },
                                },
                              }))}
                            />
                            <CompactTimeInput
                              label="Afternoon out"
                              value={activeEditor.builder.defaultTimes.afternoonOut}
                              onChange={(value) => updateEditor((previous) => ({
                                ...previous,
                                builder: {
                                  ...previous.builder,
                                  defaultTimes: { ...previous.builder.defaultTimes, afternoonOut: value },
                                },
                              }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="employee-modal-actions" style={{ marginTop: '1rem' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => updateEditor((previous) => ({
                            ...previous,
                            builder: {
                              ...previous.builder,
                              schedule: applyDefaultsToWorkingDays(previous.builder.schedule, previous.builder.defaultTimes),
                            },
                          }))}
                        >
                          Apply Defaults To Working Days
                        </button>
                      </div>

                      <div className="roster-week-tabs">
                        {Array.from({ length: activeEditor.builder.cycleLengthWeeks }, (_, index) => index + 1).map((weekNumber) => (
                          <button
                            key={weekNumber}
                            type="button"
                            className={`roster-week-tab${activeEditor.builder.activeWeek === weekNumber ? ' roster-week-tab-active' : ''}`}
                            onClick={() => updateEditor((previous) => ({
                              ...previous,
                              builder: { ...previous.builder, activeWeek: weekNumber, expandedDayKey: null },
                            }))}
                          >
                            Week {weekNumber}
                          </button>
                        ))}
                      </div>

                      <div className="roster-day-grid">
                        {activeWeekSchedule.map((day) => (
                          <RosterDayCard
                            key={getDayKey(day.week_index, day.day_of_week)}
                            day={day}
                            defaultTimes={activeEditor.builder.defaultTimes}
                            isExpanded={activeEditor.builder.expandedDayKey === getDayKey(day.week_index, day.day_of_week)}
                            onToggleWorking={() => updateEditor((previous) => ({
                              ...previous,
                              builder: {
                                ...previous.builder,
                                schedule: previous.builder.schedule.map((entry) => {
                                  if (entry.week_index !== day.week_index || entry.day_of_week !== day.day_of_week) {
                                    return entry;
                                  }

                                  if (entry.is_working) {
                                    return { ...entry, is_working: false };
                                  }

                                  return {
                                    ...entry,
                                    is_working: true,
                                    morning_in: previous.builder.defaultTimes.morningIn,
                                    morning_out: previous.builder.defaultTimes.morningOut,
                                    afternoon_in: previous.builder.defaultTimes.afternoonIn,
                                    afternoon_out: previous.builder.defaultTimes.afternoonOut,
                                  };
                                }),
                              },
                            }))}
                            onUseDefaults={() => updateEditor((previous) => ({
                              ...previous,
                              builder: {
                                ...previous.builder,
                                schedule: previous.builder.schedule.map((entry) => {
                                  if (entry.week_index !== day.week_index || entry.day_of_week !== day.day_of_week) {
                                    return entry;
                                  }

                                  return {
                                    ...entry,
                                    morning_in: previous.builder.defaultTimes.morningIn,
                                    morning_out: previous.builder.defaultTimes.morningOut,
                                    afternoon_in: previous.builder.defaultTimes.afternoonIn,
                                    afternoon_out: previous.builder.defaultTimes.afternoonOut,
                                  };
                                }),
                              },
                            }))}
                            onToggleExpanded={() => updateEditor((previous) => ({
                              ...previous,
                              builder: {
                                ...previous.builder,
                                expandedDayKey:
                                  previous.builder.expandedDayKey === getDayKey(day.week_index, day.day_of_week)
                                    ? null
                                    : getDayKey(day.week_index, day.day_of_week),
                              },
                            }))}
                            onChangeTime={(field, value) => updateEditor((previous) => ({
                              ...previous,
                              builder: {
                                ...previous.builder,
                                schedule: previous.builder.schedule.map((entry) => {
                                  if (entry.week_index !== day.week_index || entry.day_of_week !== day.day_of_week) {
                                    return entry;
                                  }

                                  return {
                                    ...entry,
                                    [field]: normalizeTimeValue(value),
                                  };
                                }),
                              },
                            }))}
                          />
                        ))}
                      </div>

                      <div className="employee-modal-actions">
                        <button type="button" className="btn btn-primary" onClick={createTemplateAndAssign} disabled={isSavingRoster}>
                          {isSavingRoster ? 'Saving Roster...' : 'Save Template And Assign'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
