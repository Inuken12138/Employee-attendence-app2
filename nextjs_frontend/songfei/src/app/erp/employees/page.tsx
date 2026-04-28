export default function EmployeesPage() {
  return (
    <div>
      <div className="kicker">People Ops</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Employee control center</h1>
      <p className="hero-copy">
        Manage worker records, maintain department rules, and resolve monthly attendance inside one ERP flow.
      </p>
      <div className="grid-3" style={{ marginTop: '2rem' }}>
        <a href="/erp/employees/departments" className="card" style={{ display: 'grid', gap: '0.8rem' }}>
          <span className="pill">Departments</span>
          <h2 className="section-title">Department Rules</h2>
          <p className="muted">Create departments, turn shop paid rest on or off, and control coverage settings without touching code.</p>
          <span className="btn btn-outline" style={{ justifySelf: 'start' }}>Open Departments</span>
        </a>
        <a href="/erp/employees/crud" className="card card-glass" style={{ display: 'grid', gap: '0.8rem' }}>
          <span className="pill">Directory</span>
          <h2 className="section-title">Employee Records</h2>
          <p className="muted">Add, search, and maintain core employee details including optional department assignment.</p>
          <span className="btn btn-outline" style={{ justifySelf: 'start' }}>Open Records</span>
        </a>
        <a href="/erp/employees/payroll" className="card" style={{ display: 'grid', gap: '0.8rem' }}>
          <span className="pill">Payroll</span>
          <h2 className="section-title">Attendance Resolution</h2>
          <p className="muted">Upload attendance sheets, manage leave and paid rest, and save monthly attendance records.</p>
          <span className="btn btn-primary" style={{ justifySelf: 'start' }}>Run Payroll</span>
        </a>
      </div>
    </div>
  );
}