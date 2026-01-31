import React, { ReactNode } from 'react';

export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex' }}>
      <aside style={{ width: '220px', background: '#f5f5f5', padding: '1rem' }}>
        <h3>ERP Menu</h3>
        <ul style={{ listStyle: 'none', paddingLeft: 0, marginTop: '1rem' }}>
          <li style={{ marginBottom: '0.5rem' }}><a href="/erp">Dashboard</a></li>
          <li style={{ marginBottom: '0.5rem' }}>
            <details>
              <summary style={{ cursor: 'pointer' }}>Employees</summary>
              <ul style={{ listStyle: 'none', paddingLeft: '1rem', marginTop: '0.5rem' }}>
                <li style={{ marginBottom: '0.5rem' }}><a href="/erp/employees/crud">Employee CRUD</a></li>
                <li><a href="/erp/employees/payroll">Monthly Salary Calculation</a></li>
              </ul>
            </details>
          </li>
          <li style={{ marginBottom: '0.5rem' }}><a href="/erp/inventory">Inventory</a></li>
          <li><a href="/erp/products">Manage Products</a></li>
        </ul>
      </aside>
      <main style={{ flexGrow: 1, padding: '1rem' }}>{children}</main>
    </div>
  );
}