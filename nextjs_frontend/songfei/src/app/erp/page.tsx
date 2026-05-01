/**
 * Landing dashboard for the internal ERP workspace.
 *
 * It acts as a lightweight operational cockpit with links into the people and
 * inventory modules plus placeholder health metrics.
 */
import Link from 'next/link';

/** Shows the ERP summary cards and quick links into major operational modules. */
export default function ErpDashboard() {
  return (
    <div className="grid-2">
      <div>
        <div className="kicker">ERP Command</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
          A focused cockpit for Songfei operations.
        </h1>
        <p className="hero-copy">
          Track every employee action, inventory adjustment, and payroll cycle from a single system of record.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <Link className="btn btn-primary" href="/erp/inventory">
            Review Inventory
          </Link>
          <Link className="btn btn-outline" href="/erp/employees">
            People Hub
          </Link>
        </div>
      </div>
      <div className="card card-glass">
        <div className="pill">System Health</div>
        <h2 className="section-title" style={{ marginTop: '1rem' }}>Today&apos;s pulse</h2>
        <div className="grid-2" style={{ marginTop: '1.5rem' }}>
          <div className="stat">
            <span className="stat-value">12</span>
            <span className="stat-label">Low Stock Alerts</span>
          </div>
          <div className="stat">
            <span className="stat-value">86</span>
            <span className="stat-label">Active Staff</span>
          </div>
          <div className="stat">
            <span className="stat-value">4</span>
            <span className="stat-label">Pending Approvals</span>
          </div>
          <div className="stat">
            <span className="stat-value">98%</span>
            <span className="stat-label">Attendance Rate</span>
          </div>
        </div>
        <div className="divider" />
        <p className="muted">
          Use the sidebar to access each module. Live data will appear here once connected to the backend metrics.
        </p>
      </div>
    </div>
  );
}