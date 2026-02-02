'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function StoreHeader() {
  const router = useRouter();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('query') as string;
    if (query) {
      router.push(`/products?query=${encodeURIComponent(query)}`);
    }
  };

  return (
    <header className="app-header">
      <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
        Songfei Store
      </Link>
      <nav className="nav-links">
        <Link className="nav-link" href="/">Shop</Link>
        <Link className="nav-link" href="/cat/products-products">Products</Link>
      </nav>
      <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: '400px', margin: '0 2rem' }}>
        <input
          type="text"
          name="query"
          placeholder="What are you looking for?"
          style={{
            width: '100%',
            padding: '0.65rem 1rem',
            borderRadius: '999px',
            border: '1px solid rgba(245, 242, 234, 0.12)',
            background: 'rgba(8, 9, 14, 0.7)',
            color: 'var(--ink-1)',
            fontSize: '0.95rem',
          }}
        />
      </form>
      <div className="header-actions">
        <Link className="btn btn-ghost" href="/login">Sign in</Link>
        <Link className="btn btn-primary" href="/erp">ERP</Link>
      </div>
    </header>
  );
}
