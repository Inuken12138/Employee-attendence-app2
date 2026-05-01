/**
 * Displays a read-only star rating for product reviews.
 *
 * The component converts a numeric rating into a partially filled five-star bar
 * and can optionally show how many reviews produced that score.
 */

import React from 'react';

interface RatingStarsProps {
  rating?: number | null;
  count?: number | null;
  size?: number;
  showCount?: boolean;
}

/** Converts a numeric rating into the visual star strip used on product cards and detail pages. */
export default function RatingStars({ rating, count, size = 14, showCount = true }: RatingStarsProps) {
  const safeRating = Math.max(0, Math.min(5, rating ?? 0));
  /** Helper used by this module to manage percent. */
  const percent = (safeRating / 5) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ position: 'relative', fontSize: size, lineHeight: 1, letterSpacing: '2px' }}>
        <span style={{ color: 'rgba(245, 242, 234, 0.35)' }}>★★★★★</span>
        <span
          style={{
            color: 'var(--ink-1)',
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${percent}%`,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          ★★★★★
        </span>
      </div>
      {showCount && typeof count === 'number' && (
        <span style={{ fontSize: '0.85rem', color: 'var(--ink-3)' }}>({count})</span>
      )}
    </div>
  );
}
