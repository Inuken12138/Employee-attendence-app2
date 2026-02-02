'use client';
import { useState, useEffect } from 'react';

interface Employee {
  id: number;
  name: string;
  base_salary: number;
}

export default function EmployeeCrudPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmployee, setNewEmployee] = useState({ name: '', salary: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchEmployees = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/employees/');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const createEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:8000/api/employees/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newEmployee.name,
          base_salary: parseFloat(newEmployee.salary),
        }),
      });

      if (response.ok) {
        setNewEmployee({ name: '', salary: '' });
        fetchEmployees();
      }
    } catch (error) {
      console.error('Error creating employee:', error);
    }
  };

  const searchEmployees = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/search/?name=${searchTerm}`);
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error searching employees:', error);
    }
  };

  const deleteEmployee = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        const response = await fetch(`http://localhost:8000/api/employees/${id}/`, {
          method: 'DELETE',
        });

        if (response.ok) {
          fetchEmployees();
        }
      } catch (error) {
        console.error('Error deleting employee:', error);
      }
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  return (
    <div>
      <div className="kicker">Employee Records</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Keep every staff detail aligned.</h1>
      <p className="hero-copy">
        Add new hires, update salary baselines, and search the roster instantly.
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
                onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                className="input"
                placeholder="Employee name"
                required
              />
            </div>
            <div className="form-field">
              <label>Base Salary (Kip)</label>
              <input
                type="number"
                step="0.01"
                value={newEmployee.salary}
                onChange={(e) => setNewEmployee({ ...newEmployee, salary: e.target.value })}
                className="input"
                placeholder="e.g. 1200000"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
              Add Employee
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="section-title">Search Directory</h2>
          <div className="form-grid" style={{ marginTop: '1.2rem' }}>
            <div className="form-field">
              <label>Search by name</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="input"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <button onClick={searchEmployees} className="btn btn-outline">Search</button>
              <button onClick={fetchEmployees} className="btn btn-ghost">Show All</button>
            </div>
          </div>
          <div className="divider" />
          <div className="stat">
            <span className="stat-value">{employees.length}</span>
            <span className="stat-label">Visible Employees</span>
          </div>
        </div>
      </div>

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
          <h2 className="section-title">Active Employees</h2>
          <span className="pill">Roster</span>
        </div>
        {employees.length === 0 ? (
          <p className="muted">No employees found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Salary</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, index) => (
                  <tr key={employee.id} className={index % 2 === 0 ? 'table-row-highlight' : ''}>
                    <td>{employee.id}</td>
                    <td>{employee.name}</td>
                    <td>{employee.base_salary.toLocaleString()}</td>
                    <td className="muted">—</td>
                    <td>
                      <button
                        onClick={() => deleteEmployee(employee.id)}
                        className="btn btn-outline"
                        style={{ borderColor: 'rgba(255, 107, 107, 0.4)', color: 'var(--danger)' }}
                      >
                        Delete
                      </button>
                    </td>
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
