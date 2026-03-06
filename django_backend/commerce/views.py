from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from commerce.models import Cart, CartItem, Order, OrderItem
from commerce.serializers import AddProductToCartSerializer, CartItemSerializer, CartSerializer, OrderSerializer
from core.models import Product


def get_or_create_active_cart(user):
    cart, _ = Cart.objects.get_or_create(user=user, defaults={'status': Cart.Status.ACTIVE})
    if cart.status != Cart.Status.ACTIVE:
        cart.status = Cart.Status.ACTIVE
        cart.save(update_fields=['status', 'updated_at'])
    return cart


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = get_or_create_active_cart(request.user)
        serializer = CartSerializer(cart, context={'request': request})
        return Response(serializer.data)


class CartItemListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = get_or_create_active_cart(request.user)
        items = cart.items.select_related('product', 'kitchen_bundle__project').order_by('created_at', 'id')
        serializer = CartItemSerializer(items, many=True, context={'request': request})
        return Response(serializer.data)


class AddProductToCartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = AddProductToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = get_object_or_404(Product, pk=serializer.validated_data['product_id'])
        quantity = serializer.validated_data['quantity']
        cart = get_or_create_active_cart(request.user)

        item = cart.items.filter(
            product=product,
            source_type=CartItem.SourceType.CATALOG,
            kitchen_bundle__isnull=True,
        ).first()

        if item:
            item.quantity += quantity
            item.unit_price = product.price
            item.save(update_fields=['quantity', 'unit_price', 'line_total', 'updated_at'])
        else:
            item = CartItem.objects.create(
                cart=cart,
                product=product,
                quantity=quantity,
                unit_price=product.price,
                source_type=CartItem.SourceType.CATALOG,
            )

        response_serializer = CartSerializer(cart, context={'request': request})
        return Response({'cart': response_serializer.data, 'item_id': item.id}, status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_item(self, request, item_id):
        cart = get_or_create_active_cart(request.user)
        return get_object_or_404(cart.items.select_related('product', 'kitchen_bundle__project'), pk=item_id)

    def patch(self, request, item_id):
        item = self._get_item(request, item_id)
        if item.is_quantity_locked:
            return Response({'detail': 'This cart line is locked. Edit it in the kitchen designer instead.'}, status=status.HTTP_400_BAD_REQUEST)

        quantity = request.data.get('quantity')
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({'detail': 'Quantity must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        if quantity < 1:
            return Response({'detail': 'Quantity must be at least 1.'}, status=status.HTTP_400_BAD_REQUEST)

        item.quantity = quantity
        item.save(update_fields=['quantity', 'line_total', 'updated_at'])
        serializer = CartItemSerializer(item, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, item_id):
        item = self._get_item(request, item_id)
        if item.is_removal_locked:
            return Response({'detail': 'This cart line is locked. Remove it from the kitchen designer instead.'}, status=status.HTTP_400_BAD_REQUEST)

        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartCheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart = get_or_create_active_cart(request.user)
        items = list(cart.items.select_related('product', 'kitchen_bundle__project').order_by('created_at', 'id'))
        if not items:
            return Response({'detail': 'Your cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        subtotal = round(sum(item.line_total for item in items), 2)
        tax = round(subtotal * 0.1, 2)
        total = round(subtotal + tax, 2)

        order = Order.objects.create(
            user=request.user,
            cart=cart,
            status=Order.Status.PENDING,
            subtotal=subtotal,
            tax=tax,
            total=total,
        )

        kitchen_bundle_ids = []
        for item in items:
            OrderItem.objects.create(
                order=order,
                product=item.product,
                quantity=item.quantity,
                unit_price=item.unit_price,
                source_type=item.source_type,
                kitchen_bundle=item.kitchen_bundle,
                metadata=item.metadata,
            )
            if item.kitchen_bundle_id:
                kitchen_bundle_ids.append(item.kitchen_bundle_id)

        if kitchen_bundle_ids:
            from planner.models import KitchenCartBundle

            bundles = KitchenCartBundle.objects.filter(id__in=kitchen_bundle_ids).select_related('project')
            bundles.update(status=KitchenCartBundle.Status.CHECKED_OUT)
            for bundle in bundles:
                bundle.project.status = bundle.project.Status.ORDERED
                bundle.project.save(update_fields=['status', 'updated_at'])

        cart.items.all().delete()
        cart.status = Cart.Status.ACTIVE
        cart.save(update_fields=['status', 'updated_at'])

        serializer = OrderSerializer(order, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
