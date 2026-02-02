import React, { ReactNode } from 'react';
import Link from 'next/link';

export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 160px)' }}>
      <aside className="sidebar">
        <div>
          <div className="pill">ERP Suite</div>
          <h3 style={{ marginTop: '1rem' }}>Operations</h3>
          <p className="muted" style={{ marginTop: '0.6rem' }}>
            Navigate core modules and keep workflows consistent across teams.
          </p>
        </div>
        <nav className="sidebar-nav">
          <Link className="sidebar-link" href="/erp">
            Dashboard <span className="muted">↗</span>
          </Link>
          <div>
            <div className="muted" style={{ fontSize: '0.7rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
              Employees
            </div>
            <div className="sidebar-group">
              <Link className="sidebar-link" href="/erp/employees/crud">
                Employee Records <span className="muted">↗</span>
              </Link>
              <Link className="sidebar-link" href="/erp/employees/payroll">
                Payroll Ops <span className="muted">↗</span>
              </Link>
            </div>
          </div>
          <Link className="sidebar-link" href="/erp/inventory">
            Inventory <span className="muted">↗</span>
          </Link>
          <Link className="sidebar-link" href="/erp/products">
            Products <span className="muted">↗</span>
          </Link>
        </nav>
        <div className="card card-glass" style={{ marginTop: 'auto' }}>
          <div className="stat">
            <span className="stat-value">6</span>
            <span className="stat-label">Teams Online</span>
          </div>
          <div className="divider" />
          <Link className="btn btn-outline" href="/login">Switch User</Link>
        </div>
      </aside>
      <main style={{ flexGrow: 1, padding: '2rem 3vw' }}>{children}</main>
    </div>
  );
}