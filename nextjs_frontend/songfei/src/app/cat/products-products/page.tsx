'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import useErrorPopup from '../../hooks/useErrorPopup';

interface Category {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  children: Category[];
}

export default function ProductsCataloguePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { showErrorPopup } = useErrorPopup();

  useEffect(() => {
    // Fetch root categories
    fetch('http://localhost:8000/api/categories/?parent=null')
      .then(res => res.json())
      .then(async (rootCategories) => {
        // Fetch children for each root category
        const categoriesWithChildren = await Promise.all(
          rootCategories.map(async (cat: Category) => {
            const childrenRes = await fetch(`http://localhost:8000/api/categories/?parent=${cat.id}`);
            const children = await childrenRes.json();
            return { ...cat, children };
          })
        );
        setCategories(categoriesWithChildren);
        setLoading(false);
      })
      .catch(() => {
        showErrorPopup('Error fetching categories.');
        setLoading(false);
      });
  }, [showErrorPopup]);

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 3vw' }}>
      <h1 className="hero-title" style={{ marginBottom: '2rem' }}>Products</h1>
      
      {categories.map((category) => (
        <section key={category.id} style={{ marginBottom: '4rem' }}>
          <div style={{
            width: '100%',
            height: '300px',
            backgroundColor: 'rgba(245, 242, 234, 0.08)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1.5rem',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {category.image_url ? (
              <Image
                src={category.image_url}
                alt={category.name}
                fill
                sizes="(max-width: 1024px) 100vw, 1200px"
                style={{
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
          
          <h2 className="section-title" style={{ marginBottom: '1rem' }}>{category.name}</h2>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <Link
              href={`/cat/${category.slug}`}
              className="btn btn-outline"
              style={{ marginBottom: '1rem', display: 'inline-block' }}
            >
              Shop all
            </Link>
          </div>
          
          {category.children && category.children.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '1rem',
            }}>
              {category.children.map((child) => (
                <Link
                  key={child.id}
                  href={`/cat/${child.slug}`}
                  style={{
                    padding: '0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--edge)',
                    textDecoration: 'none',
                    color: 'var(--ink-2)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-2)';
                    e.currentTarget.style.color = 'var(--ink-1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--edge)';
                    e.currentTarget.style.color = 'var(--ink-2)';
                  }}
                >
                  {child.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
