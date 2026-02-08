import React, { ReactNode } from 'react';
import './globals.css';
import ConditionalHeader from './components/ConditionalHeader';
import ErrorPopupProvider from './components/ErrorPopupProvider';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ErrorPopupProvider>
          <div className="app-shell">
            <ConditionalHeader />
            <main className="app-main">{children}</main>
            <footer className="app-footer">
              <span>© 2026 Songfei Operations Suite</span>
              <span className="muted">Precision inventory, payroll, and attendance.</span>
            </footer>
          </div>
        </ErrorPopupProvider>
      </body>
    </html>
  );
}
