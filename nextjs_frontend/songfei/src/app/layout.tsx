/**
 * Defines the top-level HTML shell for every page in the Next.js app.
 *
 * New developers can treat this as the shared frame for the whole frontend:
 * global CSS is loaded here, the header/footer live here, and the error popup
 * provider wraps every route so child pages can surface failures consistently.
 */
import React, { ReactNode } from 'react';
import './globals.css';
import ConditionalHeader from './components/ConditionalHeader';
import ErrorPopupProvider from './components/ErrorPopupProvider';

/** Wraps every route with the global app shell and shared providers. */
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
