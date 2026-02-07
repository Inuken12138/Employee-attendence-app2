import React, { ReactNode } from 'react';
import Link from 'next/link';
import { Literata, Unbounded } from 'next/font/google';
import './globals.css';
import ConditionalHeader from './components/ConditionalHeader';
import ErrorPopupProvider from './components/ErrorPopupProvider';

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '500', '600', '700'],
});

const unbounded = Unbounded({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${literata.variable} ${unbounded.variable}`} suppressHydrationWarning>
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
