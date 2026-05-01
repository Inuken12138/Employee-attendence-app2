"""Behavior tests for the commerce API.

These tests document the expected cart workflow for new contributors: add a
product, authenticate with either session or token auth, respect planner locks,
and create an order during checkout.
"""

from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

from commerce.models import CartItem, Order
from core.models import Category, Product, User
from planner.models import KitchenCartBundle, KitchenProject, KitchenProjectVersion


class CartApiTests(APITestCase):
    """Exercise the main customer cart and checkout flows."""

    def setUp(self):
        """Create a test user and one purchasable product for cart scenarios."""

        self.user = User.objects.create_user(username='cart-user', password='secret123', role='customer')
        self.category = Category.objects.create(name='Kitchen', slug='kitchen-cart')
        self.product = Product.objects.create(product_id='PRD-001', name='Drawer Front', price=49.0, category=self.category)
        self.client.force_authenticate(user=self.user)

    def test_add_product_to_cart(self):
        """Adding a product should create a cart line and update totals."""

        response = self.client.post('/api/cart/add-product/', {'product_id': self.product.id, 'quantity': 2}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['cart']['total_quantity'], 2)
        self.assertEqual(len(response.data['cart']['items']), 1)
        self.assertEqual(response.data['cart']['items'][0]['product']['id'], self.product.id)

    def test_token_auth_can_access_cart_endpoints(self):
        """Cart endpoints should work with token authentication as well as session auth."""

        self.client.force_authenticate(user=None)
        token = Token.objects.create(user=self.user)

        response = self.client.get(
            '/api/cart/',
            HTTP_AUTHORIZATION=f'Token {token.key}',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_quantity'], 0)

    def test_locked_bundle_item_cannot_be_removed(self):
        """Planner-owned bundle rows should reject direct cart deletion."""

        project = KitchenProject.objects.create(owner=self.user, title='Bundle project')
        version = KitchenProjectVersion.objects.create(project=project, version_name='Version 1', created_by=self.user, version_number=1)
        project.current_version = version
        project.save(update_fields=['current_version', 'updated_at'])
        bundle = KitchenCartBundle.objects.create(project=project, project_version=version, bundle_total=98.0)
        cart_response = self.client.get('/api/cart/')
        cart_id = cart_response.data['id']

        item = CartItem.objects.create(
            cart=self.user.cart,
            product=self.product,
            quantity=2,
            unit_price=self.product.price,
            source_type='kitchen_bundle',
            kitchen_bundle=bundle,
            is_quantity_locked=True,
            is_removal_locked=True,
        )

        delete_response = self.client.delete(f'/api/cart/items/{item.id}/')
        self.assertEqual(delete_response.status_code, 400)
        self.assertIn('locked', delete_response.data['detail'])

    def test_checkout_creates_order_and_clears_cart(self):
        """Checkout should create an order snapshot and empty the active cart."""

        self.client.post('/api/cart/add-product/', {'product_id': self.product.id, 'quantity': 2}, format='json')

        response = self.client.post('/api/cart/checkout/')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['subtotal'], 98.0)
        self.assertEqual(response.data['tax'], 9.8)
        self.assertEqual(response.data['total'], 107.8)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Order.objects.first().items.count(), 1)
        self.assertEqual(self.user.cart.items.count(), 0)
