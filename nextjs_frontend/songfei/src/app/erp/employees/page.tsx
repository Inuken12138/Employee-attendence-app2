export default function EmployeesPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Employees</h1>
      <p className="text-gray-600 mb-6">
        Choose a section from the Employees menu to manage records or calculate monthly salary.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <a
          href="/erp/employees/crud"
          className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-blue-400"
        >
          <h2 className="text-xl font-semibold mb-2">Employee CRUD</h2>
          <p className="text-gray-600">Add, search, update, and delete employee records.</p>
        </a>
        <a
          href="/erp/employees/payroll"
          className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-purple-400"
        >
          <h2 className="text-xl font-semibold mb-2">Monthly Salary Calculation</h2>
          <p className="text-gray-600">Upload attendance sheets and view payroll results.</p>
        </a>
      </div>
    </div>
  );
}