/**
 * Declares the cart and order shapes returned by the commerce API.
 *
 * These interfaces are the shared contract between the storefront UI and the
 * backend responses, so new developers can read this file to understand what a
 * cart, cart item, and order look like in the frontend state layer.
 */

/** Minimal product fields needed when a product appears inside a cart or order. */
export interface CartProductSummary {
  id: number;
  product_id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

/** One editable line item inside the shopper's active cart. */
export interface CartItem {
  id: number;
  product: CartProductSummary;
  quantity: number;
  unit_price: number;
  line_total: number;
  source_type: 'catalog' | 'kitchen_bundle';
  kitchen_bundle: number | null;
  is_quantity_locked: boolean;
  is_removal_locked: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** The active basket the shopper is currently building. */
export interface Cart {
  id: number;
  status: string;
  items: CartItem[];
  subtotal: number;
  total_quantity: number;
  created_at: string;
  updated_at: string;
}

/** Response returned when a product is added to the cart. */
export interface AddProductToCartResponse {
  cart: Cart;
  item_id: number;
}

/** One purchased line item captured on a submitted order. */
export interface OrderItem {
  id: number;
  product: CartProductSummary;
  quantity: number;
  unit_price: number;
  line_total: number;
  source_type: 'catalog' | 'kitchen_bundle';
  kitchen_bundle: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Finalized checkout data returned after the cart becomes an order. */
export interface Order {
  id: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  placed_at: string;
  items: OrderItem[];
}
