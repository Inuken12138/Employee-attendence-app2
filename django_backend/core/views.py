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

from rest_framework import viewsets, permissions, generics, filters
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from .models import Employee, InventoryItem, Product, User, Workplace, EmployeeFaceProfile, Category, Review, Purchase, AttendanceRecord, AttendanceRecordEmployee, AttendanceShift
from .serializers import EmployeeSerializer, InventoryItemSerializer, ProductSerializer, UserSerializer, RegisterSerializer, WorkplaceSerializer, EmployeeFaceProfileSerializer, CategorySerializer, ReviewSerializer
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import authenticate
from rest_framework.decorators import api_view
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError
from django.db.models import Avg, Count
from django.db import transaction
from django.utils import timezone
import calendar
import os
import pandas as pd
import re
import math

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

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = Category.objects.all()
        slug = self.request.query_params.get('slug', None)
        parent = self.request.query_params.get('parent', None)
        
        if slug:
            queryset = queryset.filter(slug=slug)
        
        if parent == 'null' or parent == '':
            queryset = queryset.filter(parent__isnull=True)
        elif parent:
            try:
                parent_id = int(parent)
                queryset = queryset.filter(parent_id=parent_id)
            except ValueError:
                pass
        return queryset.order_by('display_order', 'name')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'colour', 'material', 'is_best_seller', 'is_new', 'product_id', 'slug']
    search_fields = ['name', 'description', 'product_id']
    ordering_fields = ['name', 'price']
    ordering = ['name']

    def get_queryset(self):
        queryset = Product.objects.all().annotate(
            rating=Avg('reviews__rating'),
            rating_count=Count('reviews', distinct=True),
        )
        category_slug = self.request.query_params.get('category_slug', None)
        include_descendants = self.request.query_params.get('include_descendants', 'false').lower() == 'true'
        slug = self.request.query_params.get('slug', None)

        if category_slug:
            try:
                category = Category.objects.get(slug=category_slug)
                if include_descendants:
                    # Get category and all its descendants
                    category_ids = [category.id] + [c.id for c in category.get_all_descendants()]
                    queryset = queryset.filter(category_id__in=category_ids)
                else:
                    queryset = queryset.filter(category=category)
            except Category.DoesNotExist:
                queryset = queryset.none()

        if slug:
            queryset = queryset.filter(slug=slug)

        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        # Validate product_id uniqueness
        product_id = serializer.validated_data.get('product_id')
        if Product.objects.filter(product_id=product_id).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'product_id': 'A product with this product_id already exists.'})
        serializer.save()


class ReviewViewSet(viewsets.ModelViewSet):
    queryset = Review.objects.select_related('user', 'product')
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Review.objects.select_related('user', 'product')
        product_id = self.request.query_params.get('product', None)
        product_slug = self.request.query_params.get('product_slug', None)

        if product_id:
            queryset = queryset.filter(product_id=product_id)
        elif product_slug:
            try:
                product = Product.objects.get(slug=product_slug)
                queryset = queryset.filter(product=product)
            except Product.DoesNotExist:
                queryset = queryset.none()

        return queryset

    def perform_create(self, serializer):
        product = serializer.validated_data.get('product')
        user = self.request.user

        has_verified_purchase = Purchase.objects.filter(
            user=user,
            product=product,
            status='completed',
        ).exists()

        if not has_verified_purchase:
            raise ValidationError({'detail': 'Verified purchase required to submit a review.'})

        serializer.save(user=user, verified_purchase=True)

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer


class WorkplaceViewSet(viewsets.ModelViewSet):
    queryset = Workplace.objects.all()
    serializer_class = WorkplaceSerializer
    permission_classes = []

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


def _haversine_meters(lat1, lon1, lat2, lon2):
    r = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class FaceEnrollView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        employee_id = request.data.get('employee_id')
        face_image = request.FILES.get('face_image')
        if not employee_id or not face_image:
            return Response({'error': 'employee_id and face_image are required.'}, status=400)

        try:
            employee = Employee.objects.get(pk=employee_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found.'}, status=404)

        profile, _ = EmployeeFaceProfile.objects.update_or_create(
            employee=employee,
            defaults={'face_image': face_image},
        )
        return Response(EmployeeFaceProfileSerializer(profile).data)


class FaceVerifyView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        employee_id = request.data.get('employee_id')
        lat = request.data.get('latitude')
        lng = request.data.get('longitude')

        if not employee_id or lat is None or lng is None:
            return Response({'error': 'employee_id, latitude, and longitude are required.'}, status=400)

        try:
            employee = Employee.objects.get(pk=employee_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found.'}, status=404)

        try:
            lat = float(lat)
            lng = float(lng)
        except ValueError:
            return Response({'error': 'Invalid latitude/longitude.'}, status=400)

        workplace = Workplace.objects.first()
        if not workplace:
            return Response({'error': 'No workplace configured.'}, status=400)

        distance = _haversine_meters(lat, lng, workplace.latitude, workplace.longitude)
        within_geofence = distance <= workplace.radius_meters

        has_profile = EmployeeFaceProfile.objects.filter(employee=employee).exists()

        return Response({
            'employee_id': employee.id,
            'within_geofence': within_geofence,
            'distance_meters': round(distance, 2),
            'face_profile_enrolled': has_profile,
            'verified': within_geofence and has_profile,
        })


def _extract_month_from_filename(filename):
    match = re.search(r'(\d{1,2})\s*月', filename or '')
    if match:
        return int(match.group(1))
    return None


def _cleanup_uploaded_file(file_obj):
    if not file_obj:
        return
    try:
        temp_path = getattr(file_obj, 'temporary_file_path', None)
        if callable(temp_path):
            temp_path = temp_path()
        if temp_path and os.path.isfile(temp_path):
            os.remove(temp_path)
    finally:
        try:
            file_obj.close()
        except Exception:
            pass


def _normalize_token(value):
    return str(value).strip() if value is not None else ''


def _row_contains_tokens(row, tokens):
    row_text = row.tolist()
    return all(any(token in str(cell) for cell in row_text) for token in tokens)


def _get_active_employee_by_worker_id(worker_id):
    normalized_worker_id = str(worker_id or '').strip()
    if not normalized_worker_id:
        return None

    return Employee.objects.filter(worker_id=normalized_worker_id, is_active=True).first()


def _record_employee_is_active(record_employee):
    if record_employee.employee_id:
        employee_obj = getattr(record_employee, 'employee', None)
        if employee_obj is None:
            employee_obj = Employee.objects.filter(pk=record_employee.employee_id).first()
        return bool(employee_obj and employee_obj.is_active)

    return _get_active_employee_by_worker_id(record_employee.worker_id) is not None


def _parse_attendance_sheet_records(file_obj, year=None, month=None):
    df = pd.read_excel(file_obj, header=None)

    if month is None:
        month = _extract_month_from_filename(getattr(file_obj, 'name', ''))
    if month is None:
        month = timezone.now().month
    if year is None:
        year = timezone.now().year

    last_day = calendar.monthrange(year, month)[1]

    results = []
    total_rows = df.shape[0]
    header_rows = df[df.apply(lambda r: _row_contains_tokens(r, ['工号', '姓名']), axis=1)].index.tolist()

    for idx, header_row in enumerate(header_rows):
        row = df.iloc[header_row]
        employee_id = None
        employee_name = None
        department = None

        for col_idx, value in row.items():
            token = _normalize_token(value)
            if token in ('工号：', '工号'):
                for j in range(col_idx + 1, len(row)):
                    if pd.notna(row.iloc[j]):
                        employee_id = _normalize_token(row.iloc[j])
                        break
            if token in ('姓名：', '姓名'):
                for j in range(col_idx + 1, len(row)):
                    if pd.notna(row.iloc[j]):
                        employee_name = _normalize_token(row.iloc[j])
                        break
            if token in ('部门：', '部门'):
                for j in range(col_idx + 1, len(row)):
                    if pd.notna(row.iloc[j]):
                        department = _normalize_token(row.iloc[j])
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

        day_logs = {str(day): [] for day in range(1, last_day + 1)}
        for col_idx, day_int in day_columns.items():
            times = []
            for time_row in time_rows:
                cell = time_row.iloc[col_idx]
                if pd.isna(cell):
                    continue
                cell_tokens = [t.strip() for t in re.split(r'\r?\n', str(cell)) if t.strip()]
                times.extend(cell_tokens)
            day_logs[str(day_int)] = times

        matched_employee = _get_active_employee_by_worker_id(employee_id)
        if matched_employee is None:
            continue

        results.append({
            'employee_id': employee_id,
            'worker_id': employee_id,
            'employee_name': employee_name,
            'department': department,
            'day_logs': day_logs,
        })

    return {
        'year': year,
        'month': month,
        'days_in_month': last_day,
        'employees': results,
    }


def _build_shift_payload(shift):
    return {
        'raw_logs': shift.raw_logs or [],
        'morning': {
            'in': shift.morning_in,
            'out': shift.morning_out,
            'status': shift.morning_status,
        },
        'afternoon': {
            'in': shift.afternoon_in,
            'out': shift.afternoon_out,
            'status': shift.afternoon_status,
        },
    }


def _serialize_attendance_record(record):
    last_day = calendar.monthrange(record.year, record.month)[1]
    employees_payload = []

    for record_employee in record.employees.select_related('employee').prefetch_related('shifts'):
        if not _record_employee_is_active(record_employee):
            continue

        day_map = {}
        for day in range(1, last_day + 1):
            day_map[str(day)] = {
                'raw_logs': [],
                'morning': {'in': '', 'out': '', 'status': 'missing'},
                'afternoon': {'in': '', 'out': '', 'status': 'missing'},
            }

        for shift in record_employee.shifts.all():
            day_map[str(shift.day)] = _build_shift_payload(shift)

        employees_payload.append({
            'employee_db_id': record_employee.employee_id,
            'worker_id': record_employee.worker_id,
            'employee_name': record_employee.employee_name,
            'department': record_employee.department,
            'days': day_map,
        })

    return {
        'year': record.year,
        'month': record.month,
        'status': record.status,
        'days_in_month': last_day,
        'employees': employees_payload,
    }


def _coerce_status(value):
    if value in ('present', 'absent', 'missing'):
        return value
    return 'missing'


def _extract_day_payload(day_payload):
    raw_logs = day_payload.get('raw_logs') or day_payload.get('day_logs') or []
    morning = day_payload.get('morning') or {}
    afternoon = day_payload.get('afternoon') or {}

    return {
        'raw_logs': raw_logs,
        'morning_in': str(morning.get('in', '')).strip(),
        'morning_out': str(morning.get('out', '')).strip(),
        'morning_status': _coerce_status(morning.get('status')),
        'afternoon_in': str(afternoon.get('in', '')).strip(),
        'afternoon_out': str(afternoon.get('out', '')).strip(),
        'afternoon_status': _coerce_status(afternoon.get('status')),
    }


def _validate_shift_for_final(day_payload, day_index, employee_label):
    if day_payload['morning_status'] == 'missing' or day_payload['afternoon_status'] == 'missing':
        raise ValidationError(
            f"Missing shifts remain for {employee_label} on day {day_index}."
        )
    if day_payload['morning_status'] == 'present':
        if not day_payload['morning_in'] or not day_payload['morning_out']:
            raise ValidationError(
                f"Morning shift missing times for {employee_label} on day {day_index}."
            )
    if day_payload['afternoon_status'] == 'present':
        if not day_payload['afternoon_in'] or not day_payload['afternoon_out']:
            raise ValidationError(
                f"Afternoon shift missing times for {employee_label} on day {day_index}."
            )


def _save_attendance_payload(payload, status):
    year = payload.get('year')
    month = payload.get('month')
    employees = payload.get('employees') or []

    if not year or not month:
        raise ValidationError('Year and month are required.')

    try:
        year = int(year)
        month = int(month)
    except ValueError:
        raise ValidationError('Invalid year or month.')

    with transaction.atomic():
        record, _ = AttendanceRecord.objects.update_or_create(
            year=year,
            month=month,
            status=status,
            defaults={},
        )

        record.employees.all().delete()

        for employee_payload in employees:
            worker_id = (
                str(employee_payload.get('worker_id') or employee_payload.get('employee_id') or '').strip()
            )
            employee_name = str(employee_payload.get('employee_name') or '').strip()
            department = str(employee_payload.get('department') or '').strip()

            employee_obj = _get_active_employee_by_worker_id(worker_id)
            if employee_obj is None:
                continue

            record_employee = AttendanceRecordEmployee.objects.create(
                record=record,
                employee=employee_obj,
                employee_name=employee_name,
                department=department,
                worker_id=worker_id,
            )

            days = employee_payload.get('days') or {}
            for day_str, day_payload in days.items():
                try:
                    day_index = int(day_str)
                except ValueError:
                    continue

                normalized = _extract_day_payload(day_payload or {})
                employee_label = worker_id or employee_name or 'Employee'
                if status == 'final':
                    _validate_shift_for_final(normalized, day_index, employee_label)

                AttendanceShift.objects.create(
                    record_employee=record_employee,
                    day=day_index,
                    raw_logs=normalized['raw_logs'],
                    morning_in=normalized['morning_in'],
                    morning_out=normalized['morning_out'],
                    afternoon_in=normalized['afternoon_in'],
                    afternoon_out=normalized['afternoon_out'],
                    morning_status=normalized['morning_status'],
                    afternoon_status=normalized['afternoon_status'],
                )

    return record


class AttendanceRecordsParseView(APIView):
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
            payload = _parse_attendance_sheet_records(file_obj, year=year, month=month)
        except Exception as exc:
            return Response({'error': f'Failed to parse attendance sheet: {exc}'}, status=400)
        finally:
            _cleanup_uploaded_file(file_obj)

        return Response(payload)


class AttendanceRecordsSaveView(APIView):
    def post(self, request):
        try:
            record = _save_attendance_payload(request.data, status='final')
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)
        except Exception as exc:
            return Response({'error': f'Failed to save attendance record: {exc}'}, status=400)

        return Response(_serialize_attendance_record(record))


class AttendanceRecordsSaveDraftView(APIView):
    def post(self, request):
        try:
            record = _save_attendance_payload(request.data, status='draft')
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)
        except Exception as exc:
            return Response({'error': f'Failed to save draft attendance record: {exc}'}, status=400)

        return Response(_serialize_attendance_record(record))


class AttendanceRecordsFetchView(APIView):
    def get(self, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if not year or not month:
            return Response({'error': 'year and month are required.'}, status=400)

        try:
            year = int(year)
            month = int(month)
        except ValueError:
            return Response({'error': 'Invalid year or month.'}, status=400)

        record = AttendanceRecord.objects.filter(year=year, month=month, status='final').first()
        if not record:
            return Response({'error': 'No attendance record found.'}, status=404)

        return Response(_serialize_attendance_record(record))


class AttendanceRecordsDraftFetchView(APIView):
    def get(self, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if not year or not month:
            return Response({'error': 'year and month are required.'}, status=400)

        try:
            year = int(year)
            month = int(month)
        except ValueError:
            return Response({'error': 'Invalid year or month.'}, status=400)

        record = AttendanceRecord.objects.filter(year=year, month=month, status='draft').first()
        if not record:
            return Response({'error': 'No attendance draft found.'}, status=404)

        return Response(_serialize_attendance_record(record))