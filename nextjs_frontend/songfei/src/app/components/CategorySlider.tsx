'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useErrorPopup from '../hooks/useErrorPopup';

interface Category {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
}

export default function CategorySlider() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { showErrorPopup } = useErrorPopup();

  useEffect(() => {
    fetch('http://localhost:8000/api/categories/?parent=null')
      .then(res => res.json())
      .then(data => {
        setCategories(data);
        setLoading(false);
      })
      .catch(err => {
        showErrorPopup('Error fetching categories.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="muted">Loading categories...</div>;
  }

  if (categories.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p className="muted">No categories yet — add products in ERP.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '3rem' }}>
      <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Shop by Category</h2>
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        overflowX: 'auto',
        paddingBottom: '1rem',
        scrollbarWidth: 'thin',
      }}>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/cat/${category.slug}`}
            style={{
              minWidth: '200px',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div className="card" style={{
              padding: '1rem',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '1',
                backgroundColor: 'rgba(245, 242, 234, 0.08)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {category.image_url ? (
                  <img
                    src={category.image_url}
                    alt={category.name}
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
              <div style={{
                fontSize: '0.95rem',
                fontWeight: 500,
                textAlign: 'center',
              }}>
                {category.name}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
