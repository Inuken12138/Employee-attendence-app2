export default function EmployeesPage() {
  return (
    <div>
      <div className="kicker">People Ops</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Employee control center</h1>
      <p className="hero-copy">
        Manage employee records, update compensation data, and process monthly payroll in one flow.
      </p>
      <div className="grid-2" style={{ marginTop: '2rem' }}>
        <a href="/erp/employees/crud" className="card card-glass" style={{ display: 'grid', gap: '0.8rem' }}>
          <span className="pill">Directory</span>
          <h2 className="section-title">Employee Records</h2>
          <p className="muted">Add, search, and maintain core employee details.</p>
          <span className="btn btn-outline" style={{ justifySelf: 'start' }}>Open Records</span>
        </a>
        <a href="/erp/employees/payroll" className="card" style={{ display: 'grid', gap: '0.8rem' }}>
          <span className="pill">Payroll</span>
          <h2 className="section-title">Monthly Salary Calculation</h2>
          <p className="muted">Upload attendance sheets and finalize payroll outputs.</p>
          <span className="btn btn-primary" style={{ justifySelf: 'start' }}>Run Payroll</span>
        </a>
      </div>
    </div>
  );
}