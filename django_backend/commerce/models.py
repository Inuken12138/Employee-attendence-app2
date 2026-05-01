"""Cart and order persistence for the storefront and planner checkout flow.

The ``commerce`` app stores a single active cart per user, the items inside
that cart, and the immutable order records created during checkout. Kitchen
designer bundles also land here, which is why some fields reference the
``planner`` app.
"""

from django.db import models

from core.models import Product, User


class Cart(models.Model):
    """Represents the shopper's current cart or a cart lifecycle state.

    Each user has one cart record that is kept active and reused between cart
    operations. Status makes it possible to preserve history if the workflow is
    expanded later.
    """

    class Status(models.TextChoices):
        """Enumerate the business states a cart can be in."""

        ACTIVE = 'active', 'Active'
        CHECKED_OUT = 'checked_out', 'Checked out'
        ABANDONED = 'abandoned', 'Abandoned'

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='cart')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        """Return a short admin/debug label for the cart."""

        return f"Cart({self.user.username}, {self.status})"


class CartItem(models.Model):
    """A single purchasable line inside a cart.

    Items can originate from the normal product catalog or from a generated
    kitchen bundle. Lock flags prevent the cart UI from changing bundle-driven
    rows that should instead be edited in the kitchen designer.
    """

    class SourceType(models.TextChoices):
        """Identify where the cart line originally came from."""

        CATALOG = 'catalog', 'Catalog'
        KITCHEN_BUNDLE = 'kitchen_bundle', 'Kitchen bundle'

    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='cart_items')
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.FloatField(default=0)
    line_total = models.FloatField(default=0)
    source_type = models.CharField(max_length=20, choices=SourceType.choices, default=SourceType.CATALOG)
    kitchen_bundle = models.ForeignKey('planner.KitchenCartBundle', on_delete=models.SET_NULL, null=True, blank=True, related_name='cart_items')
    is_quantity_locked = models.BooleanField(default=False)
    is_removal_locked = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at', 'id']

    def save(self, *args, **kwargs):
        """Recalculate the line total before persisting the item.

        This keeps the database value consistent even if quantity or unit price
        changed earlier in the request.
        """

        self.line_total = float(self.quantity) * float(self.unit_price)
        super().save(*args, **kwargs)

    def __str__(self):
        """Return a compact debug label for the cart item."""

        return f"CartItem({self.product.product_id}, qty={self.quantity}, source={self.source_type})"


class Order(models.Model):
    """Immutable checkout snapshot created from a cart submission."""

    class Status(models.TextChoices):
        """Enumerate the lifecycle states of an order after checkout."""

        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'
        FULFILLED = 'fulfilled', 'Fulfilled'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    cart = models.ForeignKey(Cart, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    subtotal = models.FloatField(default=0)
    tax = models.FloatField(default=0)
    total = models.FloatField(default=0)
    placed_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-placed_at', '-created_at']

    def __str__(self):
        """Return a short human-readable description for logging/admin."""

        return f"Order({self.user.username}, {self.status}, total={self.total})"


class OrderItem(models.Model):
    """A frozen copy of a purchased cart line stored under an order."""

    class SourceType(models.TextChoices):
        """Preserve whether the purchased line came from catalog or planner."""

        CATALOG = 'catalog', 'Catalog'
        KITCHEN_BUNDLE = 'kitchen_bundle', 'Kitchen bundle'

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='order_items')
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.FloatField(default=0)
    line_total = models.FloatField(default=0)
    source_type = models.CharField(max_length=20, choices=SourceType.choices, default=SourceType.CATALOG)
    kitchen_bundle = models.ForeignKey('planner.KitchenCartBundle', on_delete=models.SET_NULL, null=True, blank=True, related_name='order_items')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def save(self, *args, **kwargs):
        """Recalculate the order-line total before saving.

        Order totals should not depend on callers remembering to set
        ``line_total`` themselves.
        """

        self.line_total = float(self.quantity) * float(self.unit_price)
        super().save(*args, **kwargs)

    def __str__(self):
        """Return a concise label for admin and debugging output."""

        return f"OrderItem({self.product.product_id}, qty={self.quantity}, source={self.source_type})"
