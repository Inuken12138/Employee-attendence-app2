'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '../../../hooks/useErrorPopup';

interface Department {
  id: number;
  name: string;
  code?: string | null;
  description: string;
  is_active: boolean;
  shop_paid_rest_enabled: boolean;
  paid_rest_days_granted_per_month: string;
  paid_rest_carry_forward_cap_days: string;
  minimum_staff_required_per_shift: number;
  allow_half_day_paid_rest: boolean;
}

interface DepartmentFormState {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  shopPaidRestEnabled: boolean;
  paidRestDaysGrantedPerMonth: string;
  paidRestCarryForwardCapDays: string;
  minimumStaffRequiredPerShift: string;
  allowHalfDayPaidRest: boolean;
}

const DEPARTMENT_API = 'http://localhost:8000/api/departments/';

const createEmptyForm = (): DepartmentFormState => ({
  name: '',
  code: '',
  description: '',
  isActive: true,
  shopPaidRestEnabled: false,
  paidRestDaysGrantedPerMonth: '2.00',
  paidRestCarryForwardCapDays: '9999.00',
  minimumStaffRequiredPerShift: '2',
  allowHalfDayPaidRest: true,
});

const sortDepartments = (departments: Department[]) => {
  return [...departments].sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
};

const flattenApiErrors = (data: unknown): string[] => {
  if (!data || typeof data !== 'object') {
    return ['Something went wrong.'];
  }

  if ('error' in data) {
    const errorValue = (data as { error?: unknown }).error;
    if (typeof errorValue === 'string') {
      return [errorValue];
    }
    if (errorValue && typeof errorValue === 'object') {
      return flattenApiErrors(errorValue);
    }
  }

  const messages: string[] = [];
  Object.entries(data as Record<string, unknown>).forEach(([field, value]) => {
    if (Array.isArray(value)) {
      messages.push(`${field}: ${value.join(' ')}`);
      return;
    }
    if (typeof value === 'string') {
      messages.push(`${field}: ${value}`);
      return;
    }
    if (value && typeof value === 'object') {
      flattenApiErrors(value).forEach((message) => messages.push(`${field}: ${message}`));
    }
  });

  return messages.length > 0 ? messages : ['Something went wrong.'];
};

const mapDepartmentToForm = (department: Department): DepartmentFormState => ({
  name: department.name,
  code: department.code || '',
  description: department.description || '',
  isActive: department.is_active,
  shopPaidRestEnabled: department.shop_paid_rest_enabled,
  paidRestDaysGrantedPerMonth: String(department.paid_rest_days_granted_per_month || '2.00'),
  paidRestCarryForwardCapDays: String(department.paid_rest_carry_forward_cap_days || '9999.00'),
  minimumStaffRequiredPerShift: String(department.minimum_staff_required_per_shift || 2),
  allowHalfDayPaidRest: department.allow_half_day_paid_rest,
});

const buildPayload = (form: DepartmentFormState) => ({
  name: form.name.trim(),
  code: form.code.trim() || null,
  description: form.description.trim(),
  is_active: form.isActive,
  shop_paid_rest_enabled: form.shopPaidRestEnabled,
  paid_rest_days_granted_per_month: Number.parseFloat(form.paidRestDaysGrantedPerMonth || '0'),
  paid_rest_carry_forward_cap_days: Number.parseFloat(form.paidRestCarryForwardCapDays || '0'),
  minimum_staff_required_per_shift: Number.parseInt(form.minimumStaffRequiredPerShift || '0', 10),
  allow_half_day_paid_rest: form.allowHalfDayPaidRest,
});

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState<DepartmentFormState>(createEmptyForm);
  const [activeDepartmentId, setActiveDepartmentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inlineErrors, setInlineErrors] = useState<string[]>([]);
  const { showErrorPopup } = useErrorPopup();

  const activeDepartment = useMemo(
    () => departments.find((department) => department.id === activeDepartmentId) || null,
    [activeDepartmentId, departments],
  );

  const refreshDepartments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(DEPARTMENT_API);
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(flattenApiErrors(data).join(' '));
        return;
      }

      startTransition(() => {
        setDepartments(sortDepartments(data as Department[]));
      });
    } catch {
      showErrorPopup('Failed to load departments.');
    } finally {
      setIsLoading(false);
    }
  }, [showErrorPopup]);

  useEffect(() => {
    void refreshDepartments();
  }, [refreshDepartments]);

  const updateForm = useCallback((field: keyof DepartmentFormState, value: string | boolean) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }, []);

  const resetEditor = useCallback(() => {
    setActiveDepartmentId(null);
    setForm(createEmptyForm());
    setInlineErrors([]);
  }, []);

  const openEditor = useCallback((department: Department) => {
    setActiveDepartmentId(department.id);
    setForm(mapDepartmentToForm(department));
    setInlineErrors([]);
  }, []);

  const saveDepartment = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setInlineErrors([]);

    try {
      setIsSaving(true);
      const response = await fetch(activeDepartmentId ? `${DEPARTMENT_API}${activeDepartmentId}/` : DEPARTMENT_API, {
        method: activeDepartmentId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await response.json();
      if (!response.ok) {
        setInlineErrors(flattenApiErrors(data));
        return;
      }

      startTransition(() => {
        setDepartments((previous) => {
          const nextDepartments = activeDepartmentId
            ? previous.map((department) => (department.id === (data as Department).id ? (data as Department) : department))
            : [...previous, data as Department];
          return sortDepartments(nextDepartments);
        });
      });
      resetEditor();
    } catch {
      showErrorPopup('Failed to save department.');
    } finally {
      setIsSaving(false);
    }
  }, [activeDepartmentId, form, resetEditor, showErrorPopup]);

  const toggleDepartmentActive = useCallback(async (department: Department) => {
    try {
      setIsSaving(true);
      const response = await fetch(`${DEPARTMENT_API}${department.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !department.is_active }),
      });
      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(flattenApiErrors(data).join(' '));
        return;
      }

      startTransition(() => {
        setDepartments((previous) => sortDepartments(previous.map((item) => (
          item.id === department.id ? data as Department : item
        ))));
      });
      if (activeDepartmentId === department.id) {
        setForm(mapDepartmentToForm(data as Department));
      }
    } catch {
      showErrorPopup('Failed to update department status.');
    } finally {
      setIsSaving(false);
    }
  }, [activeDepartmentId, showErrorPopup]);

  const deleteDepartment = useCallback(async (department: Department) => {
    const confirmed = window.confirm(`Delete ${department.name}? If the department is already in use, the backend will deactivate it instead.`);
    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch(`${DEPARTMENT_API}${department.id}/`, {
        method: 'DELETE',
      });

      if (response.status === 204) {
        startTransition(() => {
          setDepartments((previous) => previous.filter((item) => item.id !== department.id));
        });
        if (activeDepartmentId === department.id) {
          resetEditor();
        }
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        showErrorPopup(flattenApiErrors(data).join(' '));
        return;
      }

      startTransition(() => {
        setDepartments((previous) => sortDepartments(previous.map((item) => (
          item.id === department.id ? data as Department : item
        ))));
      });
      if (activeDepartmentId === department.id) {
        setForm(mapDepartmentToForm(data as Department));
      }
    } catch {
      showErrorPopup('Failed to delete department.');
    } finally {
      setIsDeleting(false);
    }
  }, [activeDepartmentId, resetEditor, showErrorPopup]);

  const activeDepartmentCount = useMemo(
    () => departments.filter((department) => department.is_active).length,
    [departments],
  );
  const paidRestEnabledCount = useMemo(
    () => departments.filter((department) => department.shop_paid_rest_enabled).length,
    [departments],
  );

  return (
    <div>
      <div className="kicker">Departments</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Configure teams before payroll rules go live.</h1>
      <p className="hero-copy">
        Departments are the control layer for shop paid rest: monthly grants, carry-forward caps, half-day eligibility, and minimum on-duty coverage.
      </p>

      <div className="grid-2" style={{ marginTop: '2rem' }}>
        <form className="card card-glass form-grid" onSubmit={saveDepartment}>
          <div>
            <span className="pill">{activeDepartment ? 'Edit' : 'Create'}</span>
            <h2 className="section-title" style={{ marginTop: '1rem' }}>
              {activeDepartment ? `Edit ${activeDepartment.name}` : 'New Department'}
            </h2>
            <p className="muted" style={{ marginTop: '0.6rem' }}>
              Keep department names human-readable. Paid-rest settings only apply when the toggle is switched on.
            </p>
          </div>

          <div className="form-field">
            <label>Department Name</label>
            <input className="input" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
          </div>

          <div className="form-field">
            <label>Code</label>
            <input className="input" value={form.code} onChange={(event) => updateForm('code', event.target.value)} placeholder="Optional short code" />
          </div>

          <label className="form-field">
            <span>Description</span>
            <textarea className="textarea" rows={3} value={form.description} onChange={(event) => updateForm('description', event.target.value)} />
          </label>

          <div className="employee-status-panel">
            <div>
              <div className="payroll-time-label">Department Status</div>
              <p className="muted" style={{ marginTop: '0.45rem' }}>
                Inactive departments stay on historical records but should not be used for new assignments.
              </p>
            </div>
            <div className="employee-status-actions">
              <button type="button" className={`employee-status-chip${form.isActive ? ' employee-status-chip-active' : ''}`} onClick={() => updateForm('isActive', true)}>
                Active
              </button>
              <button type="button" className={`employee-status-chip${!form.isActive ? ' employee-status-chip-inactive' : ''}`} onClick={() => updateForm('isActive', false)}>
                Inactive
              </button>
            </div>
          </div>

          <label className="payroll-inline-toggle">
            <input type="checkbox" checked={form.shopPaidRestEnabled} onChange={(event) => updateForm('shopPaidRestEnabled', event.target.checked)} />
            <span>Enable shop paid rest for this department</span>
          </label>

          <div className="grid-2">
            <label className="form-field">
              <span>Granted days per month</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.5"
                value={form.paidRestDaysGrantedPerMonth}
                onChange={(event) => updateForm('paidRestDaysGrantedPerMonth', event.target.value)}
                disabled={!form.shopPaidRestEnabled}
              />
            </label>
            <label className="form-field">
              <span>Carry-forward cap days</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.5"
                value={form.paidRestCarryForwardCapDays}
                onChange={(event) => updateForm('paidRestCarryForwardCapDays', event.target.value)}
                disabled={!form.shopPaidRestEnabled}
              />
            </label>
          </div>

          <div className="grid-2">
            <label className="form-field">
              <span>Minimum staff per shift</span>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={form.minimumStaffRequiredPerShift}
                onChange={(event) => updateForm('minimumStaffRequiredPerShift', event.target.value)}
                disabled={!form.shopPaidRestEnabled}
              />
            </label>
            <label className="payroll-inline-toggle" style={{ alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={form.allowHalfDayPaidRest}
                onChange={(event) => updateForm('allowHalfDayPaidRest', event.target.checked)}
                disabled={!form.shopPaidRestEnabled}
              />
              <span>Allow half-day paid rest</span>
            </label>
          </div>

          {inlineErrors.length > 0 ? (
            <div className="employee-note-panel">
              <div className="payroll-time-label">Validation</div>
              <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem', color: '#f7b07f' }}>
                {inlineErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="employee-modal-actions">
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : activeDepartment ? 'Save Department' : 'Create Department'}
            </button>
            <button type="button" className="btn btn-outline" onClick={resetEditor}>
              Reset
            </button>
          </div>
        </form>

        <div className="card">
          <span className="pill">Overview</span>
          <h2 className="section-title" style={{ marginTop: '1rem' }}>Department Pulse</h2>
          <div className="grid-3" style={{ marginTop: '1.2rem' }}>
            <div className="stat">
              <span className="stat-value">{departments.length}</span>
              <span className="stat-label">Departments</span>
            </div>
            <div className="stat">
              <span className="stat-value">{activeDepartmentCount}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat">
              <span className="stat-value">{paidRestEnabledCount}</span>
              <span className="stat-label">Paid Rest Enabled</span>
            </div>
          </div>
          <div className="divider" />
          <p className="muted">
            For shop teams using floating paid rest, pair a paid-rest-enabled department with an all-week base roster. The repeating roster stays stable, and approved paid-rest requests become the real day-off overlay.
          </p>
        </div>
      </div>

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <h2 className="section-title">Department Directory</h2>
          <button type="button" className="btn btn-outline" onClick={() => void refreshDepartments()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading ? (
          <p className="muted">Loading departments...</p>
        ) : departments.length === 0 ? (
          <p className="muted">No departments created yet.</p>
        ) : (
          <div className="payroll-leave-list" style={{ marginTop: '1rem' }}>
            {departments.map((department) => (
              <div key={department.id} className="payroll-leave-item">
                <div className="payroll-leave-item-header">
                  <div>
                    <div className="payroll-leave-item-title">
                      {department.name}
                      {department.code ? ` · ${department.code}` : ''}
                    </div>
                    <div className="payroll-leave-item-copy">
                      {department.is_active ? 'Active' : 'Inactive'}
                      {department.shop_paid_rest_enabled ? ' · shop paid rest enabled' : ' · shop paid rest disabled'}
                    </div>
                  </div>
                  <span className={`payroll-status-badge ${department.shop_paid_rest_enabled ? 'payroll-status-badge-approved' : 'payroll-status-badge-draft'}`}>
                    {department.shop_paid_rest_enabled ? 'Paid Rest On' : 'Paid Rest Off'}
                  </span>
                </div>

                {department.description ? (
                  <div className="payroll-leave-item-copy">{department.description}</div>
                ) : null}

                <div className="payroll-leave-item-copy">
                  Grant {department.paid_rest_days_granted_per_month} day(s) / month · Cap {department.paid_rest_carry_forward_cap_days} · Minimum on duty {department.minimum_staff_required_per_shift}
                  {department.allow_half_day_paid_rest ? ' · Half day allowed' : ' · Full day only'}
                </div>

                <div className="payroll-leave-actions">
                  <button type="button" className="btn btn-outline" onClick={() => openEditor(department)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => void toggleDepartmentActive(department)} disabled={isSaving}>
                    {department.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => void deleteDepartment(department)} disabled={isDeleting}>
                    {isDeleting ? 'Working...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}