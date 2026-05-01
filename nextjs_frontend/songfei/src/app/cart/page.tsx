/**
 * Keeps the route file for /cart intentionally small.
 *
 * The real cart logic lives in the commerce feature folder. This page exists so
 * App Router can expose the route while the reusable screen stays feature-owned.
 */
import CartScreen from '@/features/commerce/pages/CartScreen';

/** Mounts the commerce cart screen for the /cart route. */
export default function CartPage() {
  return <CartScreen />;
}
