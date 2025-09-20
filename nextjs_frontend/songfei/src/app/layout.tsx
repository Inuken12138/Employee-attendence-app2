import React, { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ padding: '1rem', background: '#eee' }}>
          <a href="/">🏠 Home</a> | <a href="/products">🛍️ Products</a> | <a href="/cart">🛒 Cart</a> | <a href="/login">🔐 Login</a>
        </header>
        <main>{children}</main>
        <footer style={{ padding: '1rem', background: '#eee', marginTop: '2rem' }}>
          <p>© 2024 Your Shop Name</p>
        </footer>
      </body>
    </html>
  );
}
