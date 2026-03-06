'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { buildLoginRedirectUrl, hasAuthToken } from '@/lib/auth';

import { checkoutCart, fetchCart, removeCartItem, updateCartItem } from '../api/cartApi';
import CartItemRow from '../components/CartItemRow';
import type { Cart, Order } from '../types/cart';

export default function CartScreen() {
  const { showErrorPopup } = useErrorPopup();
  const [cart, setCart] = useState<Cart | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const loadCart = useCallback(async () => {
    if (!hasAuthToken()) {
      setLoading(false);
      setCart(null);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchCart();
      setCart(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load the active cart.';
      showErrorPopup(message);
    } finally {
      setLoading(false);
    }
  }, [showErrorPopup]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  const handleUpdateQuantity = async (itemId: number, quantity: number) => {
    setBusyItemId(itemId);
    try {
      await updateCartItem(itemId, quantity);
      await loadCart();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update this cart line.';
      showErrorPopup(message);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRemove = async (itemId: number) => {
    setBusyItemId(itemId);
    try {
      await removeCartItem(itemId);
      await loadCart();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove this cart line.';
      showErrorPopup(message);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const data = await checkoutCart();
      setOrder(data);
      await loadCart();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create an order from the cart.';
      showErrorPopup(message);
    } finally {
      setCheckingOut(false);
    }
  };

  if (!hasAuthToken()) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="pill">Cart access</div>
        <h1 className="section-title" style={{ marginTop: '1rem' }}>Sign in to open your cart</h1>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          The cart is account-backed so ordinary products and kitchen design bundles stay synchronized across sessions.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <Link className="btn btn-primary" href={buildLoginRedirectUrl('/cart')}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Loading cart…</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div className="pill">Cart</div>
          <h1 className="section-title" style={{ marginTop: '1rem' }}>Your active basket</h1>
        </div>
        <div style={{ fontWeight: 700, color: 'var(--accent-1)' }}>${cart?.subtotal.toFixed(2) || '0.00'}</div>
      </div>

      {order && (
        <div className="card card-glass" style={{ padding: '1.2rem' }}>
          <div className="pill">Order created</div>
          <div style={{ marginTop: '0.7rem', fontWeight: 600 }}>Order #{order.id}</div>
          <div className="muted" style={{ marginTop: '0.35rem' }}>
            Pending checkout record created with total ${order.total.toFixed(2)}.
          </div>
        </div>
      )}

      {!cart || cart.items.length === 0 ? (
        <div className="card" style={{ padding: '1.5rem' }}>
          <p className="muted">Your cart is empty.</p>
          <div style={{ marginTop: '1rem' }}>
            <Link className="btn btn-outline" href="/products">
              Browse products
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {cart.items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onUpdateQuantity={handleUpdateQuantity}
                onRemove={handleRemove}
                busy={busyItemId === item.id}
              />
            ))}
          </div>

          <div className="card card-glass" style={{ padding: '1.2rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div className="muted">Subtotal</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>${cart.subtotal.toFixed(2)}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="muted">Kitchen bundles stay locked and traceable back to their source project.</div>
              <button type="button" className="btn btn-primary" onClick={() => void handleCheckout()} disabled={checkingOut}>
                {checkingOut ? 'Creating order…' : 'Checkout'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
