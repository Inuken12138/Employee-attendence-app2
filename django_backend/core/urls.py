"""
Django URLs.py - Purpose and Relationship
Theoretical Understanding
The urls.py file acts as the URL configuration and routing system in Django applications. It maps URLs to 
their corresponding views, effectively creating the API endpoints that clients can interact with.

Relationship with Other Components:

1. Views (views.py)
   - URLs direct incoming requests to appropriate view functions/classes
   - Each URL pattern is linked to a specific view that handles the request
   - Example relationship:

    from .views import EmployeeViewSet
    router.register(r'employees', EmployeeViewSet)

2. Router (DRF)
   - Uses DRF's DefaultRouter to automatically generate URL patterns for ViewSets
   - Creates standard RESTful URLs (GET, POST, PUT, DELETE)
   - Handles both list and detail views

3. Settings (settings.py)
   - Root URL configuration is defined in settings
   - Middleware and authentication settings affect URL processing

Current Implementation
1. Router Registration
   - Registers ViewSets for core models:
        - /employees/ - Employee management
        - /inventory/ - Inventory items
        - /products/ - Product catalog
        - /users/ - User information
        
2. Authentication URLs
   - /register/ - New user registration
   - /logout/ - User logout
   - /api-token-auth/ - Token authentication
   - /login/ - User login
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InventoryItemViewSet, ProductViewSet, UserViewSet, RegisterView, LogoutView, LoginView, employee_list, employee_detail#, EmployeeViewSet
from rest_framework.authtoken.views import obtain_auth_token
from . import views

import logging

logger = logging.getLogger(__name__)

router = DefaultRouter()
logger.debug("Registering EmployeeViewSet at /employees/")
#router.register(r'employees', EmployeeViewSet)
print("Debug: Registering InventoryItemViewSet at /inventory/")  # Debug print
router.register(r'inventory', InventoryItemViewSet)
print("Debug: Registering ProductViewSet at /products/")  # Debug print
router.register(r'products', ProductViewSet)
print("Debug: Registering UserViewSet at /users/")  # Debug print
router.register(r'users', UserViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterView.as_view()),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('api-token-auth/', obtain_auth_token),
    path('login/', LoginView.as_view(), name='login'),
    path('employees/', employee_list, name='employee-list'),
    path('employees/<int:pk>/', employee_detail, name='employee-detail'),
    
]
