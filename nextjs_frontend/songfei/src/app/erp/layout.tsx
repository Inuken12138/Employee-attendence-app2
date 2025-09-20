import React, { ReactNode } from 'react';

export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex' }}>
      <aside style={{ width: '200px', background: '#f5f5f5', padding: '1rem' }}>
        <h3>ERP Menu</h3>
        <ul>
          <li><a href="/erp">Dashboard</a></li>
          <li><a href="/erp/employees">Employees</a></li>
          <li><a href="/erp/inventory">Inventory</a></li>
          <li><a href="/erp/salary">Salary Calc</a></li>
          <li><a href="/erp/products">Manage Products</a></li>
        </ul>
      </aside>
      <main style={{ flexGrow: 1, padding: '1rem' }}>{children}</main>
    </div>
  );
}