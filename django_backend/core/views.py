"""
Django Views Configuration
-------------------------
This script defines the API views and endpoints for the application using Django REST Framework.

Django Views.py - Purpose and Relationship
The views.py file serves as a central component in the Django REST Framework application, acting as 
the controller layer that connects the data models with the API endpoints. Here's how it relates to 
other key components:

Relationship with Other Files
1. Models (models.py)
 - Views consume the data models defined in models.py
 - Example relationship:

    from .models import Employee, InventoryItem, Product, User

    class EmployeeViewSet(viewsets.ModelViewSet):
        queryset = Employee.objects.all()  # Uses Employee model
        serializer_class = EmployeeSerializer

2. Serializers (serializers.py)
 - Views use serializers to convert model instances to JSON and vice versa
 - Example usage:

    from .serializers import EmployeeSerializer, UserSerializer

    class UserViewSet(viewsets.ReadOnlyModelViewSet):
        serializer_class = UserSerializer  # Specifies how to format User data

3. URLs (urls.py)
 - Views are mapped to URL endpoints in urls.py
 - Each ViewSet or APIView becomes accessible through specific URLs

Key Responsibilities
1. Authentication & Authorization
 - Handles user login/logout
 - Manages permissions (e.g., IsManager custom permission)
 
2. Data Operations
 - Processes CRUD operations through ViewSets
 - Manages business logic between requests and database

3. Response Handling
 - Formats and returns API responses
 - Handles error cases and status codes

Flow of Data
1. URL request comes in
2. View receives the request
3. View authenticates/authorizes user if needed
4. View processes data using models
5. Serializer formats the response
6. View returns formatted response to client

This architecture follows the Django REST Framework's pattern for building scalable and maintainable APIs.



Current Views:
1. Permission Classes
   - IsManager: Custom permission for manager-only access

2. ModelViewSets
   - EmployeeViewSet: CRUD operations for employee records
   - InventoryItemViewSet: Inventory management endpoints
   - ProductViewSet: Product catalog endpoints
   - UserViewSet: Read-only user information

3. Authentication Views
   - RegisterView: User registration
   - LoginView: User authentication with token generation
   - LogoutView: Token deletion on logout

How to extend:
1. Add Custom Permissions:
   class IsAdminUser(permissions.BasePermission):
       def has_permission(self, request, view):
           return request.user.is_staff

2. Create New ViewSet:
   class OrderViewSet(viewsets.ModelViewSet):
       queryset = Order.objects.all()
       serializer_class = OrderSerializer
       permission_classes = [IsAuthenticated]
       
       def perform_create(self, serializer):
           serializer.save(user=self.request.user)

3. Add Custom Actions:
   @action(detail=True, methods=['post'])
   def process_order(self, request, pk=None):
       order = self.get_object()
       order.process()
       return Response({'status': 'order processed'})

4. Add Filtering and Search:
   filter_backends = [filters.SearchFilter]
   search_fields = ['name', 'description']
"""

# default imports
from django.shortcuts import render

from rest_framework import viewsets, permissions, generics
from .models import Employee, InventoryItem, Product, User
from .serializers import EmployeeSerializer, InventoryItemSerializer, ProductSerializer, UserSerializer, RegisterSerializer
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import authenticate
from rest_framework.decorators import api_view

# Create your views here.
class IsManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'manager'

class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    #permission_classes = [permissions.IsAuthenticated, IsManager]
    permission_classes = []

class InventoryItemViewSet(viewsets.ModelViewSet):
    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer
    permission_classes = [permissions.IsAuthenticated]

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer

class LogoutView(APIView):
    def post(self, request):
        request.user.auth_token.delete()
        return Response({"message": "Logged out successfully."})

class LoginView(APIView):
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            return Response({'token': token.key})
        return Response({'error': 'Invalid credentials'}, status=400)