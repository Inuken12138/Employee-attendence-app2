/**
 * Collects every cart-related HTTP request in one place.
 *
 * Commerce UI components import these helpers instead of calling fetch directly,
 * which keeps cart endpoint paths, HTTP methods, and request payload formats
 * consistent across the storefront.
 */

import { apiJson } from '@/lib/api';

import type { AddProductToCartResponse, Cart, CartItem, Order } from '../types/cart';

/** Loads the shopper's current cart summary and line items. */
export async function fetchCart(): Promise<Cart> {
  return apiJson<Cart>('/cart/');
}

/** Adds a catalog product to the cart with the requested quantity. */
export async function addProductToCart(productId: number, quantity = 1): Promise<AddProductToCartResponse> {
  return apiJson<AddProductToCartResponse>('/cart/add-product/', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, quantity }),
  });
}

/** Changes the quantity for an existing cart line item. */
export async function updateCartItem(itemId: number, quantity: number): Promise<CartItem> {
  return apiJson<CartItem>(`/cart/items/${itemId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
}

/** Removes one line item from the cart entirely. */
export async function removeCartItem(itemId: number): Promise<void> {
  return apiJson<void>(`/cart/items/${itemId}/`, {
    method: 'DELETE',
  });
}

/** Submits the current cart to the backend and creates an order. */
export async function checkoutCart(): Promise<Order> {
  return apiJson<Order>('/cart/checkout/', {
    method: 'POST',
  });
}
