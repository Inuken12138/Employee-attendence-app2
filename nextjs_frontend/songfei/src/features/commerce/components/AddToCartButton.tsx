'use client';

/**
 * Reusable commerce UI component.
 *
 * These components render cart or product-purchase interactions and delegate data changes back to feature-level state or API helpers.
 */

/**
 * Reusable storefront button for adding one product to the cart.
 *
 * It handles login gating, calls the cart API, and optionally turns an add-to-
 * cart action into a "buy now" redirect straight to the cart page.
 */

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { buildLoginRedirectUrl, hasAuthToken } from '@/lib/auth';

import { addProductToCart } from '../api/cartApi';

/** Adds a product to the cart and updates the button state to reflect progress or success. */
export default function AddToCartButton({
  productId,
  mode = 'add',
  className,
  style,
}: {
  productId: number;
  mode?: 'add' | 'buyNow';
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { showErrorPopup } = useErrorPopup();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  /** Performs the guarded add-to-cart flow and redirects when buy-now mode is used. */
  const handleClick = async () => {
    if (!hasAuthToken()) {
      router.push(buildLoginRedirectUrl(pathname || '/products'));
      return;
    }

    setLoading(true);
  setAdded(false);
    try {
      await addProductToCart(productId, 1);
      if (mode === 'buyNow') {
        router.push('/cart');
        return;
      }
      setAdded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add this product to the cart.';
      showErrorPopup(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className={className} style={style} onClick={() => void handleClick()} disabled={loading}>
      {loading ? 'Adding…' : added ? 'Added to cart' : mode === 'buyNow' ? 'Buy now' : 'Add to cart'}
    </button>
  );
}
