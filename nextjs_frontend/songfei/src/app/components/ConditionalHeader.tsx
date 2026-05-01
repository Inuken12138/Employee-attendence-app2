'use client';

/**
 * Shared application UI component.
 *
 * This file contains reusable presentation logic that is consumed by multiple storefront or ERP routes.
 */

/**
 * Switches between the store header and a simplified ERP/auth header.
 *
 * The app serves both customer storefront routes and internal ERP routes. This
 * component keeps the header appropriate for whichever section the user is in.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import StoreHeader from './StoreHeader';

/** Chooses which header variant to render for the current pathname. */
export default function ConditionalHeader() {
  const pathname = usePathname();
  
  // Show minimal/ERP header for ERP and login routes
  const isErpRoute = pathname?.startsWith('/erp') || pathname?.startsWith('/login');
  
  if (isErpRoute) {
    return (
      <header className="app-header">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          Songfei ERP
        </Link>
        <nav className="nav-links">
          <Link className="nav-link" href="/">Overview</Link>
          <Link className="nav-link" href="/erp">ERP</Link>
          <Link className="nav-link" href="/erp/inventory">Inventory</Link>
          <Link className="nav-link" href="/erp/employees">Employees</Link>
        </nav>
        <div className="header-actions">
          <Link className="btn btn-ghost" href="/login">Sign in</Link>
          <Link className="btn btn-primary" href="/erp">Launch ERP</Link>
        </div>
      </header>
    );
  }
  
  // Show store header for all other routes
  return <StoreHeader />;
}
