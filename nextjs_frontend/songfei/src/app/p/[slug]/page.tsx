'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import AddToCartButton from '@/features/commerce/components/AddToCartButton';
import { buildApiUrl } from '@/lib/api';
import RatingStars from '../../components/RatingStars';
import useErrorPopup from '../../hooks/useErrorPopup';

interface Product {
  id: number;
  product_id: string;
  name: string;
  price: number;
  description: string;
  slug: string;
  image_url: string | null;
  is_best_seller: boolean;
  is_new: boolean;
  category_name: string;
  category_slug: string;
  colour?: string;
  material?: string;
  rating?: number | null;
  ratingCount?: number | null;
}

interface Review {
  id: number;
  rating: number;
  title: string;
  body: string;
  created_at: string;
  verified_purchase: boolean;
  user_username: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const { showErrorPopup } = useErrorPopup();

  useEffect(() => {
    if (!slug) return;

    setLoading(true);
    fetch(buildApiUrl(`/products/?slug=${slug}`))
      .then(res => res.json())
      .then(data => {
        if (!data.length) {
          setProduct(null);
          setLoading(false);
          return;
        }
        setProduct(data[0]);
        setLoading(false);
      })
      .catch(() => {
        showErrorPopup('Error fetching product.');
        setLoading(false);
      });
  }, [showErrorPopup, slug]);

  useEffect(() => {
    if (!product) return;

    setReviewsLoading(true);
    fetch(buildApiUrl(`/reviews/?product=${product.id}`))
      .then(res => res.json())
      .then(data => {
        const normalized = Array.isArray(data) ? data : (data?.results || []);
        setReviews(normalized);
        setReviewsLoading(false);
      })
      .catch(() => {
        showErrorPopup('Error fetching reviews.');
        setReviewsLoading(false);
      });
  }, [product, showErrorPopup]);

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Loading...</div>;
  }

  if (!product) {
    return <div style={{ padding: '2rem' }}>Product not found</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 3vw 4rem' }}>
      <nav style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <Link href="/" style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>Products</Link>
        {product.category_slug && (
          <>
            {' > '}
            <Link href={`/cat/${product.category_slug}`} style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>
              {product.category_name}
            </Link>
          </>
        )}
        {' > '}
        <span style={{ color: 'var(--ink-1)' }}>{product.name}</span>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(300px, 0.8fr)', gap: '3rem' }}>
        <div>
          <div
            style={{
              width: '100%',
              aspectRatio: '4 / 5',
              backgroundColor: 'rgba(245, 242, 234, 0.08)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--edge)',
              position: 'relative',
            }}
          >
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 520px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(245, 242, 234, 0.12)' }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem' }}>
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                style={{
                  width: '82px',
                  height: '82px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--edge)',
                  backgroundColor: 'rgba(245, 242, 234, 0.08)',
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="hero-title" style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>
                {product.name}
              </h1>
              <div style={{ fontSize: '0.95rem', color: 'var(--ink-3)' }}>
                {product.category_name}
              </div>
            </div>
            {product.is_best_seller && (
              <div style={{
                backgroundColor: 'var(--danger)',
                color: 'white',
                padding: '0.35rem 0.7rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}>
                Best seller
              </div>
            )}
          </div>

          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <RatingStars rating={product.rating} count={product.ratingCount} size={16} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--accent-1)', marginBottom: '1rem' }}>
            ${product.price.toFixed(2)}
          </div>

          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <AddToCartButton productId={product.id} className="btn btn-primary" style={{ flex: 1 }} />
              <button className="btn btn-outline">♡</button>
            </div>
            <AddToCartButton productId={product.id} mode="buyNow" className="btn btn-outline" style={{ width: '100%' }} />
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Details</h3>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              {product.description || 'A timeless piece designed for everyday life, built to last and easy to love.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
              <div>
                <div style={{ color: 'var(--ink-3)' }}>Product ID</div>
                <div>{product.product_id}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ink-3)' }}>Material</div>
                <div>{product.material || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ink-3)' }}>Colour</div>
                <div>{product.colour || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ink-3)' }}>New</div>
                <div>{product.is_new ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section style={{ marginTop: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="section-title">Reviews</h2>
          <Link href="/login" className="btn btn-outline">Write a review</Link>
        </div>

        {reviewsLoading ? (
          <div className="muted" style={{ padding: '1rem' }}>Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="muted" style={{ padding: '1rem' }}>No reviews yet. Be the first to review this product.</div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {reviews.map((review) => (
              <div key={review.id} className="card" style={{ padding: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{review.user_username}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--ink-3)' }}>
                      {new Date(review.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {review.verified_purchase && (
                    <span style={{
                      backgroundColor: 'rgba(111, 213, 199, 0.15)',
                      color: 'var(--accent-2)',
                      border: '1px solid var(--accent-2)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      Verified purchase
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <RatingStars rating={review.rating} showCount={false} />
                </div>
                {review.title && (
                  <div style={{ marginTop: '0.6rem', fontWeight: 600 }}>{review.title}</div>
                )}
                {review.body && (
                  <p className="muted" style={{ marginTop: '0.4rem' }}>{review.body}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
