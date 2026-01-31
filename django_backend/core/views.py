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
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
import calendar
import pandas as pd
import re

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
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser]

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


def _extract_month_from_filename(filename):
    match = re.search(r'(\d{1,2})\s*月', filename or '')
    if match:
        return int(match.group(1))
    return None


def _get_working_days_in_month(year, month):
    last_day = calendar.monthrange(year, month)[1]
    working_days = 0
    for day in range(1, last_day + 1):
        weekday = calendar.weekday(year, month, day)
        if weekday != calendar.SUNDAY:
            working_days += 1
    return working_days, last_day


def _parse_attendance_sheet(file_obj, year=None, month=None):
    df = pd.read_excel(file_obj, header=None)

    if month is None:
        month = _extract_month_from_filename(getattr(file_obj, 'name', ''))
    if month is None:
        month = timezone.now().month
    if year is None:
        year = timezone.now().year

    working_days, last_day = _get_working_days_in_month(year, month)

    results = []
    total_rows = df.shape[0]
    header_rows = df[df.apply(lambda r: r.astype(str).str.contains('姓名').any(), axis=1)].index.tolist()

    for idx, header_row in enumerate(header_rows):
        row = df.iloc[header_row]

        employee_id = None
        employee_name = None

        for idx, value in row.items():
            if str(value).strip() == '工号：':
                for j in range(idx + 1, len(row)):
                    if pd.notna(row.iloc[j]):
                        employee_id = str(row.iloc[j]).strip()
                        break
            if str(value).strip() == '姓名：':
                for j in range(idx + 1, len(row)):
                    if pd.notna(row.iloc[j]):
                        employee_name = str(row.iloc[j]).strip()
                        break

        day_row_idx = header_row + 1
        if day_row_idx >= total_rows:
            continue

        next_header = header_rows[idx + 1] if idx + 1 < len(header_rows) else total_rows
        if next_header <= day_row_idx:
            continue

        day_row = df.iloc[day_row_idx]
        time_rows = [df.iloc[r] for r in range(day_row_idx + 1, next_header)]

        day_columns = {}
        for col_idx, day_value in day_row.items():
            if pd.isna(day_value):
                continue
            try:
                day_int = int(float(day_value))
            except (ValueError, TypeError):
                continue
            if 1 <= day_int <= last_day:
                day_columns[col_idx] = day_int

        valid_days = 0
        for col_idx, day_int in day_columns.items():
            times = []
            for time_row in time_rows:
                cell = time_row.iloc[col_idx]
                if pd.isna(cell):
                    continue
                times.extend([t.strip() for t in str(cell).split('\n') if t.strip()])
            if len(times) == 4:
                valid_days += 1

        results.append({
            'employee_id': employee_id,
            'employee_name': employee_name,
            'valid_days': valid_days,
            'working_days': working_days,
            'monthly_salary': round(2000000 * (valid_days / working_days), 2),
        })

    return {
        'year': year,
        'month': month,
        'working_days': working_days,
        'results': results,
    }


class AttendancePayrollUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file uploaded.'}, status=400)

        year = request.data.get('year')
        month = request.data.get('month')

        try:
            year = int(year) if year else None
            month = int(month) if month else None
        except ValueError:
            return Response({'error': 'Invalid month or year.'}, status=400)

        try:
            payload = _parse_attendance_sheet(file_obj, year=year, month=month)
        except Exception as exc:
            return Response({'error': f'Failed to parse attendance sheet: {exc}'}, status=400)

        return Response(payload)