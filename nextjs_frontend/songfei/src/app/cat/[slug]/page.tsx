'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import RatingStars from '../../components/RatingStars';
import useErrorPopup from '../../hooks/useErrorPopup';

interface Category {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  breadcrumb: Array<{ id: number; name: string; slug: string }>;
  level: number;
  children_count: number;
}

interface Product {
  id: number;
  product_id: string;
  name: string;
  price: number;
  slug: string;
  image_url: string | null;
  is_best_seller: boolean;
  is_new: boolean;
  rating?: number | null;
  ratingCount?: number | null;
}

export default function CategoryPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [category, setCategory] = useState<Category | null>(null);
  const [children, setChildren] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const { showErrorPopup } = useErrorPopup();

  useEffect(() => {
    if (!slug) return;

    // Fetch category by slug
    fetch(`http://localhost:8000/api/categories/?slug=${slug}`)
      .then(res => res.json())
      .then(async (data) => {
        if (data.length === 0) {
          setLoading(false);
          return;
        }
        const cat = data[0];
        setCategory(cat);

        // Fetch parent if exists
        if (cat.breadcrumb && cat.breadcrumb.length > 1) {
          const parentSlug = cat.breadcrumb[cat.breadcrumb.length - 2].slug;
          const parentRes = await fetch(`http://localhost:8000/api/categories/?slug=${parentSlug}`);
          const parentData = await parentRes.json();
          if (parentData.length > 0) {
            setParentCategory(parentData[0]);
          }
        }

        // Fetch children
        const childrenRes = await fetch(`http://localhost:8000/api/categories/?parent=${cat.id}`);
        const childrenData = await childrenRes.json();
        setChildren(childrenData);

        // Fetch products - for level 3+ include descendants
        const includeDescendants = cat.level >= 3;
        const productsUrl = `http://localhost:8000/api/products/?category_slug=${slug}&include_descendants=${includeDescendants}`;
        const productsRes = await fetch(productsUrl);
        const productsData = await productsRes.json();
        setProducts(productsData);

        setLoading(false);
      })
      .catch(() => {
        showErrorPopup('Error fetching category.');
        setLoading(false);
      });
  }, [showErrorPopup, slug]);

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Loading...</div>;
  }

  if (!category) {
    return <div style={{ padding: '2rem' }}>Category not found</div>;
  }

  const isLevel2 = category.level === 2;
  const hasChildren = children.length > 0;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 3vw' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <Link href="/" style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>Products</Link>
        {category.breadcrumb.map((crumb, idx) => (
          <span key={crumb.id}>
            {' > '}
            {idx === category.breadcrumb.length - 1 ? (
              <span style={{ color: 'var(--ink-1)' }}>{crumb.name}</span>
            ) : (
              <Link href={`/cat/${crumb.slug}`} style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <h1 className="hero-title" style={{ marginBottom: '2rem' }}>{category.name}</h1>

      {/* Subcategory Slider (if has children) */}
      {hasChildren && (
        <div style={{ marginBottom: '3rem' }}>
          <div style={{
            display: 'flex',
            gap: '1.5rem',
            overflowX: 'auto',
            paddingBottom: '1rem',
          }}>
            {/* Back to parent */}
            {parentCategory && (
              <Link
                href={`/cat/${parentCategory.slug}`}
                className="card"
                style={{
                  minWidth: '200px',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>↑</div>
                <div style={{ fontSize: '0.9rem', textAlign: 'center' }}>{parentCategory.name}</div>
              </Link>
            )}

            {/* Children */}
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/cat/${child.slug}`}
                className="card"
                style={{
                  minWidth: '200px',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: '1rem',
                }}
              >
                <div style={{
                  width: '100%',
                  aspectRatio: '1',
                  backgroundColor: 'rgba(245, 242, 234, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '0.8rem',
                }}>
                  {child.image_url && (
                    <img
                      src={child.image_url}
                      alt={child.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-md)',
                      }}
                    />
                  )}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 500, textAlign: 'center' }}>
                  {child.name}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Body */}
      {isLevel2 ? (
        // Level 2: CTA blocks
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          marginTop: '2rem',
        }}>
          <div className="card card-glass" style={{ padding: '2rem' }}>
            <h3 className="section-title">Discover new offers for IKEA Family members*</h3>
            <p className="muted" style={{ marginTop: '1rem' }}>
              Join our membership program to access exclusive deals and early access to new products.
            </p>
          </div>
          <div className="card card-glass" style={{ padding: '2rem' }}>
            <h3 className="section-title">Free delivery on orders over $100</h3>
            <p className="muted" style={{ marginTop: '1rem' }}>
              Enjoy free shipping when you spend $100 or more on selected items.
            </p>
          </div>
        </div>
      ) : (
        // Level 3+: Product grid with filters
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
          {/* Sidebar Filters */}
          <aside style={{ position: 'sticky', top: '6rem', height: 'fit-content' }}>
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1rem' }}>
                Filters
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--ink-3)', display: 'block', marginBottom: '0.5rem' }}>
                    Sort
                  </label>
                  <select className="select" style={{ width: '100%' }}>
                    <option>Name A-Z</option>
                    <option>Price Low-High</option>
                    <option>Price High-Low</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--ink-3)', display: 'block', marginBottom: '0.5rem' }}>
                    Best seller
                  </label>
                  <input type="checkbox" />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--ink-3)', display: 'block', marginBottom: '0.5rem' }}>
                    New products
                  </label>
                  <input type="checkbox" />
                </div>
              </div>
            </div>
          </aside>

          {/* Product Grid */}
          <div>
            {products.length === 0 ? (
              <div className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
                No products found in this category.
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
                    <div style={{ marginBottom: '0.35rem' }}>
                      <RatingStars rating={product.rating} count={product.ratingCount} />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-1)' }}>
                      ${product.price.toFixed(2)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
