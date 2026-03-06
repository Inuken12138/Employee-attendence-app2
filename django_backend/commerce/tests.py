from rest_framework.test import APITestCase

from commerce.models import CartItem, Order
from core.models import Category, Product, User
from planner.models import KitchenCartBundle, KitchenProject, KitchenProjectVersion


class CartApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='cart-user', password='secret123', role='customer')
        self.category = Category.objects.create(name='Kitchen', slug='kitchen-cart')
        self.product = Product.objects.create(product_id='PRD-001', name='Drawer Front', price=49.0, category=self.category)
        self.client.force_authenticate(user=self.user)

    def test_add_product_to_cart(self):
        response = self.client.post('/api/cart/add-product/', {'product_id': self.product.id, 'quantity': 2}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['cart']['total_quantity'], 2)
        self.assertEqual(len(response.data['cart']['items']), 1)
        self.assertEqual(response.data['cart']['items'][0]['product']['id'], self.product.id)

    def test_locked_bundle_item_cannot_be_removed(self):
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
        self.client.post('/api/cart/add-product/', {'product_id': self.product.id, 'quantity': 2}, format='json')

        response = self.client.post('/api/cart/checkout/')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['subtotal'], 98.0)
        self.assertEqual(response.data['tax'], 9.8)
        self.assertEqual(response.data['total'], 107.8)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Order.objects.first().items.count(), 1)
        self.assertEqual(self.user.cart.items.count(), 0)
