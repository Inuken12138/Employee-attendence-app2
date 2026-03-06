export interface CartProductSummary {
  id: number;
  product_id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

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

export interface Cart {
  id: number;
  status: string;
  items: CartItem[];
  subtotal: number;
  total_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface AddProductToCartResponse {
  cart: Cart;
  item_id: number;
}

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

export interface Order {
  id: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  placed_at: string;
  items: OrderItem[];
}
