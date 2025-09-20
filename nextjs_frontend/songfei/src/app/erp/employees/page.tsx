'use client';
import { useEffect, useState } from 'react';

interface Employee {
  id: number;
  name: string;
  position: string;
  base_salary: number;
  bonus: number;
  deductions: number;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    const fetchEmployees = async () => {
      const res = await fetch('http://localhost:8000/api/employees/', {
        headers: {
          Authorization: `Token ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      setEmployees(data);
    };

    fetchEmployees();
  }, []);

  return (
    <div>
      <h2>All Employees</h2>
      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Position</th>
            <th>Base Salary</th>
            <th>Bonus</th>
            <th>Deductions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id}>
              <td>{emp.name}</td>
              <td>{emp.position}</td>
              <td>{emp.base_salary}</td>
              <td>{emp.bonus}</td>
              <td>{emp.deductions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}