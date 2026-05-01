"""Admin registrations for cart and order models.

These classes tune how commerce records appear in Django admin so operations or
developers can inspect carts and orders without writing SQL.
"""

from django.contrib import admin

from commerce.models import Cart, CartItem, Order, OrderItem


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    """Expose carts in admin with the fields most useful for support work."""

    list_display = ('user', 'status', 'updated_at')
    list_filter = ('status',)
    search_fields = ('user__username',)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    """Show cart lines together with lock flags used by the kitchen designer."""

    list_display = ('cart', 'product', 'quantity', 'source_type', 'is_quantity_locked', 'is_removal_locked')
    list_filter = ('source_type', 'is_quantity_locked', 'is_removal_locked')
    search_fields = ('cart__user__username', 'product__name', 'product__product_id')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """Show order state and totals for quick order-history inspection."""

    list_display = ('id', 'user', 'status', 'total', 'placed_at')
    list_filter = ('status',)
    search_fields = ('user__username',)


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    """Show line-item details for placed orders."""

    list_display = ('order', 'product', 'quantity', 'source_type', 'line_total')
    list_filter = ('source_type',)
    search_fields = ('order__user__username', 'product__name', 'product__product_id')
