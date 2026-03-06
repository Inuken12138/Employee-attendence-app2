from django.urls import path

from commerce.views import AddProductToCartView, CartCheckoutView, CartDetailView, CartItemDetailView, CartItemListView


urlpatterns = [
    path('', CartDetailView.as_view(), name='cart-detail'),
    path('items/', CartItemListView.as_view(), name='cart-items'),
    path('add-product/', AddProductToCartView.as_view(), name='cart-add-product'),
    path('checkout/', CartCheckoutView.as_view(), name='cart-checkout'),
    path('items/<int:item_id>/', CartItemDetailView.as_view(), name='cart-item-detail'),
]
