from rest_framework import serializers

from commerce.models import Cart, CartItem, Order, OrderItem


class CartProductSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_id = serializers.CharField()
    name = serializers.CharField()
    slug = serializers.CharField()
    image_url = serializers.SerializerMethodField()

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class CartItemSerializer(serializers.ModelSerializer):
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
    items = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    total_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'status', 'items', 'subtotal', 'total_quantity', 'created_at', 'updated_at']

    def get_items(self, obj):
        items = obj.items.select_related('product', 'kitchen_bundle__project').order_by('created_at', 'id')
        return CartItemSerializer(items, many=True, context=self.context).data

    def get_subtotal(self, obj):
        return round(sum(item.line_total for item in obj.items.all()), 2)

    def get_total_quantity(self, obj):
        return sum(item.quantity for item in obj.items.all())


class AddProductToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(required=False, min_value=1, default=1)


class OrderItemSerializer(serializers.ModelSerializer):
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
    items = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'status', 'subtotal', 'tax', 'total', 'placed_at', 'items']
        read_only_fields = fields

    def get_items(self, obj):
        items = obj.items.select_related('product').order_by('created_at', 'id')
        return OrderItemSerializer(items, many=True, context=self.context).data
