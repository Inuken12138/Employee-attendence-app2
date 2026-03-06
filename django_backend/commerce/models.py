from django.db import models

from core.models import Product, User


class Cart(models.Model):
    class Status(models.TextChoices):
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
        return f"Cart({self.user.username}, {self.status})"


class CartItem(models.Model):
    class SourceType(models.TextChoices):
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
        self.line_total = float(self.quantity) * float(self.unit_price)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"CartItem({self.product.product_id}, qty={self.quantity}, source={self.source_type})"


class Order(models.Model):
    class Status(models.TextChoices):
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
        return f"Order({self.user.username}, {self.status}, total={self.total})"


class OrderItem(models.Model):
    class SourceType(models.TextChoices):
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
        self.line_total = float(self.quantity) * float(self.unit_price)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"OrderItem({self.product.product_id}, qty={self.quantity}, source={self.source_type})"
