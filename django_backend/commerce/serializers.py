"""Serializer layer for the commerce cart and checkout APIs.

Serializers translate database objects into JSON payloads the frontend can
consume, and validate incoming cart mutations before views touch the models.
"""

from rest_framework import serializers

from commerce.models import Cart, CartItem, Order, OrderItem


class CartProductSummarySerializer(serializers.Serializer):
    """Small product snapshot embedded inside cart and order responses."""

    id = serializers.IntegerField()
    product_id = serializers.CharField()
    name = serializers.CharField()
    slug = serializers.CharField()
    image_url = serializers.SerializerMethodField()

    def get_image_url(self, obj):
        """Return an absolute image URL when request context is available."""

        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class CartItemSerializer(serializers.ModelSerializer):
    """Serialize a single cart line together with its product summary."""

    product = CartProductSummarySerializer(read_only=True)

    class Meta:
        model = CartItem
        fields = [
            'id',
            'product',
            'quantity',
            'unit_price',
            'line_total',
            'source_type',
            'kitchen_bundle',
            'is_quantity_locked',
            'is_removal_locked',
            'metadata',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['unit_price', 'line_total', 'source_type', 'kitchen_bundle', 'metadata', 'created_at', 'updated_at']


class CartSerializer(serializers.ModelSerializer):
    """Serialize a cart with computed totals and nested line items."""

    items = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    total_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'status', 'items', 'subtotal', 'total_quantity', 'created_at', 'updated_at']

    def get_items(self, obj):
        """Return cart items in stable creation order for predictable UI rendering."""

        items = obj.items.select_related('product', 'kitchen_bundle__project').order_by('created_at', 'id')
        return CartItemSerializer(items, many=True, context=self.context).data

    def get_subtotal(self, obj):
        """Sum persisted line totals to produce the cart subtotal."""

        return round(sum(item.line_total for item in obj.items.all()), 2)

    def get_total_quantity(self, obj):
        """Return the number of units currently inside the cart."""

        return sum(item.quantity for item in obj.items.all())


class AddProductToCartSerializer(serializers.Serializer):
    """Validate the minimal payload required to add a catalog product to cart."""

    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(required=False, min_value=1, default=1)


class OrderItemSerializer(serializers.ModelSerializer):
    """Serialize an immutable order line for order-history responses."""

    product = CartProductSummarySerializer(read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id',
            'product',
            'quantity',
            'unit_price',
            'line_total',
            'source_type',
            'kitchen_bundle',
            'metadata',
            'created_at',
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    """Serialize an order together with the line items captured at checkout."""

    items = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'status', 'subtotal', 'tax', 'total', 'placed_at', 'items']
        read_only_fields = fields

    def get_items(self, obj):
        """Return ordered line items so order detail screens can render them."""

        items = obj.items.select_related('product').order_by('created_at', 'id')
        return OrderItemSerializer(items, many=True, context=self.context).data
