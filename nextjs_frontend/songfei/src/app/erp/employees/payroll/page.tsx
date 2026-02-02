'use client';
import { useState } from 'react';

interface PayrollResult {
  employee_id: string | null;
  employee_name: string | null;
  valid_days: number;
  working_days: number;
  monthly_salary: number;
}

export default function EmployeePayrollPage() {
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [payrollResults, setPayrollResults] = useState<PayrollResult[]>([]);
  const [payrollMeta, setPayrollMeta] = useState<{ year: number; month: number; working_days: number } | null>(null);
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [isUploading, setIsUploading] = useState(false);

  const uploadAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceFile) {
      alert('Please select an attendance file.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', attendanceFile);
      formData.append('month', String(uploadMonth));
      formData.append('year', String(uploadYear));

      const response = await fetch('http://localhost:8000/api/payroll/upload-attendance/', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data?.error || 'Failed to upload attendance sheet.');
        return;
      }

      setPayrollResults(data.results || []);
      setPayrollMeta({
        year: data.year,
        month: data.month,
        working_days: data.working_days,
      });
    } catch (error) {
      console.error('Error uploading attendance:', error);
      alert('Failed to upload attendance sheet.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <div className="kicker">Payroll Ops</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Close payroll with confidence.</h1>
      <p className="hero-copy">
        Upload attendance sheets, validate totals, and export payroll summaries in minutes.
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
              {isUploading ? 'Uploading...' : 'Upload & Calculate Payroll'}
            </button>
          </form>
        </div>

        <div className="card floating-panel">
          <div className="pill">Summary</div>
          <h2 className="section-title" style={{ marginTop: '1rem' }}>Payroll Period</h2>
          {payrollMeta ? (
            <div className="form-grid" style={{ marginTop: '1.2rem' }}>
              <div className="stat">
                <span className="stat-value">{payrollMeta.year}</span>
                <span className="stat-label">Year</span>
              </div>
              <div className="stat">
                <span className="stat-value">{String(payrollMeta.month).padStart(2, '0')}</span>
                <span className="stat-label">Month</span>
              </div>
              <div className="stat">
                <span className="stat-value">{payrollMeta.working_days}</span>
                <span className="stat-label">Working Days</span>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: '1rem' }}>Upload a sheet to populate payroll summary.</p>
          )}
        </div>
      </div>

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="section-title">Monthly Payroll Results</h2>
          <span className="pill">Report</span>
        </div>
        {payrollResults.length === 0 ? (
          <p className="muted">No payroll results yet. Upload an attendance sheet to calculate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Valid Days</th>
                  <th>Working Days</th>
                  <th>Monthly Salary (Kip)</th>
                </tr>
              </thead>
              <tbody>
                {payrollResults.map((result, index) => (
                  <tr key={`${result.employee_id}-${index}`} className={index % 2 === 0 ? 'table-row-highlight' : ''}>
                    <td>{result.employee_id || '-'}</td>
                    <td>{result.employee_name || '-'}</td>
                    <td>{result.valid_days}</td>
                    <td>{result.working_days}</td>
                    <td>{result.monthly_salary.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
