'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: number;
  product_id: string;
  name: string;
  price: number;
  slug: string;
  image_url: string | null;
  is_best_seller: boolean;
  category_name: string;
  category_slug: string;
}

export default function ProductsSearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('query') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (query) {
      setLoading(true);
      fetch(`http://localhost:8000/api/products/?search=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          setProducts(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error searching products:', err);
          setLoading(false);
        });
    } else {
      // If no query, show all products
      fetch('http://localhost:8000/api/products/')
        .then(res => res.json())
        .then(data => {
          setProducts(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching products:', err);
          setLoading(false);
        });
    }
  }, [query]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 3vw' }}>
      <h1 className="hero-title" style={{ marginBottom: '2rem' }}>
        {query ? `Search results for "${query}"` : 'All Products'}
      </h1>

      {loading ? (
        <div className="muted" style={{ padding: '2rem' }}>Loading...</div>
      ) : products.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">No products found.</p>
          {query && (
            <p className="muted" style={{ marginTop: '1rem' }}>
              Try a different search term or <Link href="/cat/products-products" style={{ color: 'var(--accent-2)' }}>browse categories</Link>.
            </p>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.5rem',
        }}>
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/p/${product.slug}`}
              className="card"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                padding: '1rem',
                position: 'relative',
              }}
            >
              {product.is_best_seller && (
                <div style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}>
                  Best seller
                </div>
              )}
              <div style={{
                width: '100%',
                aspectRatio: '1',
                backgroundColor: 'rgba(245, 242, 234, 0.08)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '0.8rem',
                overflow: 'hidden',
              }}>
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(245, 242, 234, 0.12)',
                  }} />
                )}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 500, marginBottom: '0.4rem' }}>
                {product.name}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--ink-3)', marginBottom: '0.4rem' }}>
                {product.category_name}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-1)' }}>
                ${product.price.toFixed(2)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
