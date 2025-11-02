from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmployeeViewSet, InventoryItemViewSet, ProductViewSet, UserViewSet, RegisterView, LogoutView, LoginView
from rest_framework.authtoken.views import obtain_auth_token

router = DefaultRouter()
router.register(r'employees', EmployeeViewSet)
router.register(r'inventory', InventoryItemViewSet)
router.register(r'products', ProductViewSet)
router.register(r'users', UserViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterView.as_view()),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('api-token-auth/', obtain_auth_token),
    path('login/', LoginView.as_view(), name='login'),
    
]
