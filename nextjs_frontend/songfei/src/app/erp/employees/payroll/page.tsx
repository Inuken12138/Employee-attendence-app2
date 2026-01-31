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
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Monthly Salary Calculation</h1>

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Attendance Sheet</h2>
        <form onSubmit={uploadAttendance} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Attendance .xls File</label>
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={(e) => setAttendanceFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full"
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Month</label>
              <input
                type="number"
                min={1}
                max={12}
                value={uploadMonth}
                onChange={(e) => setUploadMonth(Number(e.target.value))}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Year</label>
              <input
                type="number"
                value={uploadYear}
                onChange={(e) => setUploadYear(Number(e.target.value))}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isUploading}
            className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-60"
          >
            {isUploading ? 'Uploading...' : 'Upload & Calculate Payroll'}
          </button>
        </form>

        {payrollMeta && (
          <div className="mt-4 text-sm text-gray-700">
            Payroll Period: {payrollMeta.year}-{String(payrollMeta.month).padStart(2, '0')} | Working Days: {payrollMeta.working_days}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Monthly Payroll Results</h2>
        {payrollResults.length === 0 ? (
          <p className="text-gray-500">No payroll results yet. Upload an attendance sheet to calculate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">Employee ID</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Valid Days</th>
                  <th className="px-4 py-2 text-left">Working Days</th>
                  <th className="px-4 py-2 text-left">Monthly Salary (Kip)</th>
                </tr>
              </thead>
              <tbody>
                {payrollResults.map((result, index) => (
                  <tr key={`${result.employee_id}-${index}`} className="border-b">
                    <td className="px-4 py-2">{result.employee_id || '-'}</td>
                    <td className="px-4 py-2">{result.employee_name || '-'}</td>
                    <td className="px-4 py-2">{result.valid_days}</td>
                    <td className="px-4 py-2">{result.working_days}</td>
                    <td className="px-4 py-2">{result.monthly_salary.toLocaleString()}</td>
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
