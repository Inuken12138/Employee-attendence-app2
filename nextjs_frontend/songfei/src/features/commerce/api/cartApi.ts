import { apiJson } from '@/lib/api';

import type { AddProductToCartResponse, Cart, CartItem, Order } from '../types/cart';

export async function fetchCart(): Promise<Cart> {
  return apiJson<Cart>('/cart/');
}

export async function addProductToCart(productId: number, quantity = 1): Promise<AddProductToCartResponse> {
  return apiJson<AddProductToCartResponse>('/cart/add-product/', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, quantity }),
  });
}

export async function updateCartItem(itemId: number, quantity: number): Promise<CartItem> {
  return apiJson<CartItem>(`/cart/items/${itemId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
}

export async function removeCartItem(itemId: number): Promise<void> {
  return apiJson<void>(`/cart/items/${itemId}/`, {
    method: 'DELETE',
  });
}

export async function checkoutCart(): Promise<Order> {
  return apiJson<Order>('/cart/checkout/', {
    method: 'POST',
  });
}
