'use client';
import { useState, useEffect } from 'react';

interface Employee {
  id: number;
  name: string;
  salary: number;
  //created_at: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmployee, setNewEmployee] = useState({ name: '', salary: '' });
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all employees
  const fetchEmployees = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/employees/');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  // Create new employee
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
          salary: parseFloat(newEmployee.salary),
        }),
      });
      
      if (response.ok) {
        setNewEmployee({ name: '', salary: '' });
        fetchEmployees(); // Refresh the list
      }
    } catch (error) {
      console.error('Error creating employee:', error);
    }
  };

  // Search employees
  const searchEmployees = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/search/?name=${searchTerm}`);
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error searching employees:', error);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Employee Management</h1>
      
      {/* Create Employee Form */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Add New Employee</h2>
        <form onSubmit={createEmployee} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={newEmployee.name}
              onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Salary</label>
            <input
              type="number"
              step="0.01"
              value={newEmployee.salary}
              onChange={(e) => setNewEmployee({ ...newEmployee, salary: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
          >
            Add Employee
          </button>
        </form>
      </div>

      {/* Search */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Search Employees</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-2"
          />
          <button
            onClick={searchEmployees}
            className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600"
          >
            Search
          </button>
          <button
            onClick={fetchEmployees}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
          >
            Show All
          </button>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Employees</h2>
        {employees.length === 0 ? (
          <p className="text-gray-500">No employees found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Salary</th>
                  <th className="px-4 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className="border-b">
                    <td className="px-4 py-2">{employee.id}</td>
                    <td className="px-4 py-2">{employee.name}</td>
                    <td className="px-4 py-2">${employee.salary}</td>
                    <td className="px-4 py-2">
                      {/* {new Date(employee.created_at).toLocaleDateString()} */}
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