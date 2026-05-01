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

General API views for the ``core`` app.

This module is the main request/response surface for everything in ``core``
that is not handled by the dedicated payroll API module. It includes:

- CRUD endpoints for employees, departments, rosters, inventory, categories,
  products, reviews, workplaces, and users
- authentication helpers for register/login/logout
- face-enrollment and geofenced face-verification endpoints
- attendance sheet parsing, draft/final attendance saving, and history fetches
- leave and overtime resolution workflows that feed payroll
   """

# default imports
from django.shortcuts import render

from rest_framework import viewsets, permissions, generics, filters
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from .models import AttendanceMonthlySummary, AttendanceOvertimeDecision, Department, Employee, EmployeeLeaveRecord, EmployeePaidRestRequest, InventoryItem, Product, User, Workplace, EmployeeFaceProfile, Category, Review, Purchase, AttendanceRecord, AttendanceRecordEmployee, AttendanceShift, EmployeeRosterAssignment, RosterTemplate
from .serializers import AttendanceOvertimeDecisionSerializer, DepartmentSerializer, EmployeeSerializer, EmployeeLeaveRecordSerializer, InventoryItemSerializer, ProductSerializer, UserSerializer, RegisterSerializer, WorkplaceSerializer, EmployeeFaceProfileSerializer, CategorySerializer, ReviewSerializer, RosterTemplateSerializer
from .utils import (
    build_roster_schedule_lookup,
    normalize_clock_time,
    normalize_employee_name,
    normalize_worker_id,
    parse_attendance_date_range,
    parse_sheet_generated_at,
    resolve_roster_day,
)
from .payroll_services import get_active_payroll_policy, resolve_employee_compensation
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import authenticate
from rest_framework.decorators import api_view
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError
from django.db.models import Avg, Count
from django.db import transaction
from django.utils.dateparse import parse_date
from django.utils import timezone
from datetime import date
import calendar
import os
import pandas as pd
import re
import math


class AttendanceSheetFormatError(Exception):
    """Raised when an uploaded attendance sheet does not match the expected format."""

    pass


def _get_employee_overtime_grace_minutes(employee, target_date):
    """Return the overtime grace period that applies to the employee on the date."""

    if employee is None or target_date is None:
        return 0

    try:
        default_policy = get_active_payroll_policy(target_date.year, target_date.month)
    except ValueError:
        return 0

    try:
        compensation = resolve_employee_compensation(employee, target_date, default_policy)
    except ValueError:
        return int(default_policy.overtime_grace_minutes or 0)

    return int(compensation.policy.overtime_grace_minutes or 0)

# Create your views here.
class IsManager(permissions.BasePermission):
    """Simple permission gate for manager-only endpoints."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'manager'

class EmployeeViewSet(viewsets.ModelViewSet):
    """CRUD API for employee directory records plus roster assignment actions."""

    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    #permission_classes = [permissions.IsAuthenticated, IsManager]
    permission_classes = []

    def get_queryset(self):
        return Employee.objects.select_related('department', 'roster_assignment__template').all()

    @action(detail=True, methods=['post', 'delete'], url_path='roster-assignment')
    def roster_assignment(self, request, pk=None):
        employee = self.get_object()

        if request.method.lower() == 'delete':
            EmployeeRosterAssignment.objects.filter(employee=employee).delete()
            refreshed_employee = self.get_queryset().get(pk=employee.pk)
            return Response(self.get_serializer(refreshed_employee).data)

        template_id = request.data.get('template_id')
        if not template_id:
            return Response({'error': 'template_id is required.'}, status=400)

        try:
            template = RosterTemplate.objects.get(pk=template_id)
        except (TypeError, ValueError, RosterTemplate.DoesNotExist):
            return Response({'error': 'Roster template not found.'}, status=404)

        effective_start_date = parse_date(str(request.data.get('effective_start_date') or ''))
        if effective_start_date is None:
            return Response({'error': 'effective_start_date is required in YYYY-MM-DD format.'}, status=400)

        EmployeeRosterAssignment.objects.update_or_create(
            employee=employee,
            defaults={
                'template': template,
                'effective_start_date': effective_start_date,
            },
        )

        refreshed_employee = self.get_queryset().get(pk=employee.pk)
        return Response(self.get_serializer(refreshed_employee).data)


class DepartmentViewSet(viewsets.ModelViewSet):
    """CRUD API for departments with soft-deactivation when records are in use."""

    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = []

    def get_queryset(self):
        queryset = Department.objects.all().order_by('name', 'id')
        active_only = str(self.request.query_params.get('active_only', '')).strip().lower()
        if active_only in ('1', 'true', 'yes', 'y'):
            queryset = queryset.filter(is_active=True)
        return queryset

    def destroy(self, request, *args, **kwargs):
        department = self.get_object()
        has_references = (
            department.employees.exists()
            or department.paid_rest_requests.exists()
            or department.paid_rest_balances.exists()
        )
        if has_references:
            if department.is_active:
                department.is_active = False
                department.save(update_fields=['is_active', 'updated_at'])
            return Response(self.get_serializer(department).data)

        department.delete()
        return Response(status=204)


class RosterTemplateViewSet(viewsets.ModelViewSet):
    """CRUD API for reusable roster templates."""

    queryset = RosterTemplate.objects.all()
    serializer_class = RosterTemplateSerializer
    permission_classes = []

    def get_queryset(self):
        return RosterTemplate.objects.annotate(usage_count=Count('assignments')).all()

class InventoryItemViewSet(viewsets.ModelViewSet):
    """CRUD API for ERP inventory items."""

    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser]

class CategoryViewSet(viewsets.ModelViewSet):
    """CRUD API for storefront category tree management."""

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
    """CRUD and filtered listing API for storefront products."""

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
    """Review API that only allows verified purchasers to create reviews."""

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
    """Read-only API exposing basic user records."""

    queryset = User.objects.all()
    serializer_class = UserSerializer


class WorkplaceViewSet(viewsets.ModelViewSet):
    """CRUD API for workplaces used by face verification."""

    queryset = Workplace.objects.all()
    serializer_class = WorkplaceSerializer
    permission_classes = []

class RegisterView(generics.CreateAPIView):
    """Registration endpoint that creates a new user account."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer

class LogoutView(APIView):
    """Delete the caller's auth token to log out the current session."""

    def post(self, request):
        request.user.auth_token.delete()
        return Response({"message": "Logged out successfully."})

class LoginView(APIView):
    """Authenticate a user and return a DRF token."""

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            return Response({'token': token.key})
        return Response({'error': 'Invalid credentials'}, status=400)


def _haversine_meters(lat1, lon1, lat2, lon2):
    """Compute straight-line distance between two coordinates in meters."""

    r = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class FaceEnrollView(APIView):
    """Upload or replace an employee's enrolled reference face image."""

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
    """Check whether an employee is inside the workplace geofence and enrolled."""

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
    """Guess the attendance month from filenames that include the Chinese 月 token."""

    match = re.search(r'(\d{1,2})\s*月', filename or '')
    if match:
        return int(match.group(1))
    return None


def _cleanup_uploaded_file(file_obj):
    """Close and remove a temporary uploaded file when parsing finishes."""

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
    """Normalize a spreadsheet cell token for tolerant comparisons."""

    return str(value).strip() if value is not None else ''


def _row_contains_tokens(row, tokens):
    """Return whether a spreadsheet row contains all required tokens somewhere."""

    row_text = row.tolist()
    return all(any(token in str(cell) for cell in row_text) for token in tokens)


def _find_first_sheet_text(df, token):
    """Return the first cell text in a sheet that contains the token."""

    for row in df.itertuples(index=False):
        for value in row:
            if pd.isna(value):
                continue
            text = str(value).strip()
            if token in text:
                return text
    return None


def _build_attendance_period_payload(
    year,
    month,
    last_day,
    source_date_range=None,
    sheet_generated_at=None,
    date_range_start=None,
    date_range_end=None,
):
    """Build the standard period metadata attached to parsed attendance payloads."""

    period_start = date_range_start or date(year, month, 1)
    period_end = date_range_end or date(year, month, last_day)

    return {
        'year': year,
        'month': month,
        'days_in_month': last_day,
        'date_range_start': period_start.isoformat(),
        'date_range_end': period_end.isoformat(),
        'source_date_range': source_date_range,
        'sheet_generated_at': sheet_generated_at,
    }


def _resolve_attendance_period(df, year=None, month=None, filename=''):
    """Infer the target attendance year/month from sheet text or filename hints."""

    source_date_range = _find_first_sheet_text(df, '考勤日期')
    sheet_generated_at_text = _find_first_sheet_text(df, '制表时间')
    parsed_start_date, parsed_end_date = parse_attendance_date_range(source_date_range)

    if month is None:
        month = parsed_start_date.month if parsed_start_date else _extract_month_from_filename(filename)
    if month is None:
        month = timezone.now().month

    if year is None:
        year = parsed_start_date.year if parsed_start_date else timezone.now().year

    last_day = calendar.monthrange(year, month)[1]
    matching_sheet_period = (
        parsed_start_date is not None
        and parsed_end_date is not None
        and parsed_start_date.year == year
        and parsed_start_date.month == month
        and parsed_end_date.year == year
        and parsed_end_date.month == month
    )
    if matching_sheet_period:
        last_day = parsed_end_date.day

    return _build_attendance_period_payload(
        year,
        month,
        last_day,
        source_date_range=source_date_range,
        sheet_generated_at=parse_sheet_generated_at(sheet_generated_at_text),
        date_range_start=parsed_start_date if matching_sheet_period else None,
        date_range_end=parsed_end_date if matching_sheet_period else None,
    )


def _get_active_employee_by_identity(worker_id, employee_name=None):
    """Match an attendance-sheet identity to an active employee record."""

    normalized_worker_id = normalize_worker_id(worker_id)
    normalized_employee_name = normalize_employee_name(employee_name)
    if not normalized_worker_id or not normalized_employee_name:
        return None

    candidates = Employee.objects.filter(worker_id=normalized_worker_id, is_active=True).order_by('id')
    for employee in candidates:
        if normalize_employee_name(employee.name) == normalized_employee_name:
            return employee
    return None


def _get_employee_roster_assignment(employee_obj):
    """Return the employee's active roster assignment when one exists."""

    if employee_obj is None:
        return None

    try:
        assignment = employee_obj.roster_assignment
    except EmployeeRosterAssignment.DoesNotExist:
        return None

    if assignment.template is None:
        return None

    return assignment


def _serialize_payroll_roster_assignment(employee_obj):
    """Return roster metadata needed by the payroll attendance UI."""

    assignment = _get_employee_roster_assignment(employee_obj)
    if assignment is None:
        return None

    template = assignment.template
    return {
        'template_id': template.id,
        'template_name': template.name,
        'cycle_length_weeks': template.cycle_length_weeks,
        'effective_start_date': assignment.effective_start_date.isoformat() if assignment.effective_start_date else None,
        'schedule': template.schedule or [],
    }


def _resolve_assignment_roster_day(assignment, schedule_lookup, target_date):
    """Resolve the roster entry for a specific date from a saved assignment."""

    if assignment is None or assignment.template is None or schedule_lookup is None:
        return None

    return resolve_roster_day(
        schedule_lookup,
        assignment.template.cycle_length_weeks,
        assignment.effective_start_date,
        target_date,
    )


def _record_employee_is_active(record_employee):
    """Return whether an attendance-record row still points to an active employee."""

    if record_employee.employee_id:
        employee_obj = getattr(record_employee, 'employee', None)
        if employee_obj is None:
            employee_obj = Employee.objects.filter(pk=record_employee.employee_id).first()
        return bool(employee_obj and employee_obj.is_active)

    return _get_active_employee_by_identity(record_employee.worker_id, record_employee.employee_name) is not None


def _parse_attendance_sheet_records(file_obj, year=None, month=None):
    """Parse one attendance spreadsheet into the normalized API payload format."""

    df = pd.read_excel(file_obj, header=None)
    period_payload = _resolve_attendance_period(
        df,
        year=year,
        month=month,
        filename=getattr(file_obj, 'name', ''),
    )

    year = period_payload['year']
    month = period_payload['month']
    last_day = period_payload['days_in_month']

    results = []
    unmatched_identities = []
    total_rows = df.shape[0]
    header_rows = df[df.apply(lambda r: _row_contains_tokens(r, ['工号', '姓名']), axis=1)].index.tolist()

    if not header_rows:
        raise AttendanceSheetFormatError(
            'Could not find any employee sections. Expected headers containing 工号 and 姓名.'
        )

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

        matched_employee = _get_active_employee_by_identity(employee_id, employee_name)
        if matched_employee is None:
            unmatched_identities.append({
                'worker_id': employee_id,
                'employee_name': employee_name,
            })
            continue

        results.append({
            'employee_db_id': matched_employee.id,
            'employee_id': employee_id,
            'worker_id': employee_id,
            'employee_name': employee_name,
            'department': department,
            'roster_assignment': _serialize_payroll_roster_assignment(matched_employee),
            'overtime_grace_minutes': _get_employee_overtime_grace_minutes(
                matched_employee,
                date(year, month, 1),
            ),
            'day_logs': day_logs,
        })

    warnings = []
    if unmatched_identities:
        example_labels = []
        for identity in unmatched_identities[:5]:
            worker_id = identity.get('worker_id') or '?'
            employee_name = identity.get('employee_name') or 'Unknown employee'
            example_labels.append(f'{worker_id} / {employee_name}')

        sample_text = ', '.join(example_labels)
        if len(unmatched_identities) > 5:
            sample_text = f'{sample_text}, ...'

        warnings.append(
            'Ignored '
            f'{len(unmatched_identities)} employee section(s) because no active employee matched the '
            f'Worker ID + Employee Name combination from the sheet. Examples: {sample_text}. '
            'Update the employee directory identities or the attendance export so they match exactly.'
        )

    return {
        **period_payload,
        'employees': results,
        'warnings': warnings,
    }


def _copy_parsed_employee_payload(employee_payload):
    """Deep-copy one parsed employee attendance payload before merging batches."""

    copied_day_logs = {}
    for day_key, logs in (employee_payload.get('day_logs') or {}).items():
        copied_day_logs[day_key] = list(logs or [])

    return {
        'employee_db_id': employee_payload.get('employee_db_id'),
        'employee_id': employee_payload.get('employee_id'),
        'worker_id': employee_payload.get('worker_id'),
        'employee_name': employee_payload.get('employee_name'),
        'department': employee_payload.get('department'),
        'roster_assignment': employee_payload.get('roster_assignment'),
        'overtime_grace_minutes': employee_payload.get('overtime_grace_minutes', 0),
        'day_logs': copied_day_logs,
    }


def _merge_attendance_log_tokens(existing_logs, incoming_logs):
    """Merge raw clock-log tokens while preserving order and removing duplicates."""

    merged_logs = []
    seen = set()

    for sequence in (existing_logs or [], incoming_logs or []):
        for raw_value in sequence:
            normalized_value = str(raw_value or '').strip()
            if not normalized_value or normalized_value in seen:
                continue
            seen.add(normalized_value)
            merged_logs.append(normalized_value)

    return merged_logs


def _merge_parsed_attendance_payloads(base_payload, incoming_payload):
    """Merge parsed attendance payloads from multiple machine exports."""

    merged_payload = {
        **base_payload,
        'employees': [],
    }
    merged_employee_lookup = {}

    for employee_payload in base_payload.get('employees') or []:
        employee_key = employee_payload.get('employee_db_id')
        if employee_key is None:
            fallback_worker_id = normalize_worker_id(employee_payload.get('worker_id') or employee_payload.get('employee_id'))
            fallback_employee_name = normalize_employee_name(employee_payload.get('employee_name'))
            if not fallback_worker_id or not fallback_employee_name:
                continue
            employee_key = (fallback_worker_id, fallback_employee_name)
        if employee_key is None:
            continue
        copied_employee = _copy_parsed_employee_payload(employee_payload)
        merged_employee_lookup[employee_key] = copied_employee
        merged_payload['employees'].append(copied_employee)

    for employee_payload in incoming_payload.get('employees') or []:
        employee_key = employee_payload.get('employee_db_id')
        if employee_key is None:
            fallback_worker_id = normalize_worker_id(employee_payload.get('worker_id') or employee_payload.get('employee_id'))
            fallback_employee_name = normalize_employee_name(employee_payload.get('employee_name'))
            if not fallback_worker_id or not fallback_employee_name:
                continue
            employee_key = (fallback_worker_id, fallback_employee_name)
        if employee_key is None:
            continue

        existing_employee = merged_employee_lookup.get(employee_key)
        if existing_employee is None:
            copied_employee = _copy_parsed_employee_payload(employee_payload)
            merged_employee_lookup[employee_key] = copied_employee
            merged_payload['employees'].append(copied_employee)
            continue

        existing_employee['department'] = existing_employee.get('department') or employee_payload.get('department')
        existing_employee['roster_assignment'] = existing_employee.get('roster_assignment') or employee_payload.get('roster_assignment')
        existing_employee['overtime_grace_minutes'] = employee_payload.get(
            'overtime_grace_minutes',
            existing_employee.get('overtime_grace_minutes', 0),
        )

        incoming_day_logs = employee_payload.get('day_logs') or {}
        for day_key, logs in incoming_day_logs.items():
            existing_employee['day_logs'][day_key] = _merge_attendance_log_tokens(
                existing_employee['day_logs'].get(day_key),
                logs,
            )

    return merged_payload


def _get_uploaded_attendance_files(request):
    """Collect uploaded attendance files from the supported multipart fields."""

    uploaded_files = request.FILES.getlist('files')
    if uploaded_files:
        return uploaded_files

    uploaded_files = request.FILES.getlist('file')
    if uploaded_files:
        return uploaded_files

    single_file = request.FILES.get('file')
    return [single_file] if single_file else []


def _build_shift_payload(shift):
    """Serialize one persisted attendance shift into the frontend payload shape."""

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
    """Serialize a full attendance record with all employee day payloads."""

    last_day = calendar.monthrange(record.year, record.month)[1]
    employees_payload = []

    for record_employee in record.employees.select_related('employee', 'employee__roster_assignment__template').prefetch_related('shifts'):
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
            'roster_assignment': _serialize_payroll_roster_assignment(getattr(record_employee, 'employee', None)),
            'overtime_grace_minutes': _get_employee_overtime_grace_minutes(
                getattr(record_employee, 'employee', None),
                date(record.year, record.month, 1),
            ),
            'days': day_map,
        })

    return {
        **_build_attendance_period_payload(record.year, record.month, last_day),
        'status': record.status,
        'employees': employees_payload,
    }


def _serialize_attendance_record_summary(record):
    """Serialize a compact attendance-record summary for history screens."""

    return {
        'year': record.year,
        'month': record.month,
        'status': record.status,
        'updated_at': record.updated_at.isoformat() if record.updated_at else None,
        'label': f'{calendar.month_name[record.month]} {record.year}',
    }


def _parse_time_to_minutes(value):
    """Convert an ``HH:MM`` time string into minutes since midnight."""

    normalized_value = normalize_clock_time(value)
    if not normalized_value:
        return None

    hour_text, minute_text = normalized_value.split(':')
    return int(hour_text) * 60 + int(minute_text)


def _determine_leave_shift_targets(leave_record):
    """Infer which shift blocks should receive a leave overlay."""

    linked_shift = str(leave_record.linked_attendance_shift or '').strip()
    if linked_shift in ('morning', 'afternoon'):
        return [linked_shift]

    if leave_record.duration_unit == 'full_day':
        return ['morning', 'afternoon']

    start_minutes = _parse_time_to_minutes(leave_record.leave_start_time)
    end_minutes = _parse_time_to_minutes(leave_record.leave_end_time)
    if start_minutes is None or end_minutes is None:
        return ['morning'] if leave_record.duration_unit == 'half_day' else ['morning', 'afternoon']

    targets = []
    if start_minutes < 12 * 60:
        targets.append('morning')
    if end_minutes > 13 * 60 or start_minutes >= 12 * 60:
        targets.append('afternoon')

    return targets or ['morning']


def _determine_paid_rest_shift_targets(paid_rest_request):
    """Infer which shift blocks should receive a paid-rest overlay."""

    linked_shift = str(paid_rest_request.linked_attendance_shift or '').strip()
    if linked_shift in ('morning', 'afternoon'):
        return [linked_shift]
    return ['morning', 'afternoon']


def _get_leave_overlay_status(leave_record):
    """Map leave workflow state to the attendance status overlay value."""

    if leave_record.submission_status == 'approved':
        return 'approved_leave'
    if leave_record.submission_status == 'recorded_unapproved':
        return 'unapproved_leave'
    return None


def _build_leave_record_lookup(year, month, employee_ids):
    """Index leave records by employee/date for attendance overlaying."""

    lookup = {}
    if not employee_ids:
        return lookup

    leave_records = EmployeeLeaveRecord.objects.filter(
        employee_id__in=employee_ids,
        leave_date__year=year,
        leave_date__month=month,
        submission_status__in=('approved', 'recorded_unapproved'),
    ).select_related('employee')

    for leave_record in leave_records:
        lookup.setdefault((leave_record.employee_id, leave_record.leave_date.isoformat()), []).append(leave_record)

    return lookup


def _build_paid_rest_lookup(year, month, employee_ids):
    """Index approved paid-rest requests by employee/date for attendance overlaying."""

    lookup = {}
    if not employee_ids:
        return lookup

    paid_rest_requests = EmployeePaidRestRequest.objects.filter(
        employee_id__in=employee_ids,
        rest_date__year=year,
        rest_date__month=month,
        submission_status='approved',
    ).select_related('employee')

    for paid_rest_request in paid_rest_requests:
        lookup.setdefault((paid_rest_request.employee_id, paid_rest_request.rest_date.isoformat()), []).append(paid_rest_request)

    return lookup


def _has_pending_leave_records(year, month, employee_ids):
    """Return whether unresolved leave requests still exist for the month."""

    if not employee_ids:
        return False

    return EmployeeLeaveRecord.objects.filter(
        employee_id__in=employee_ids,
        leave_date__year=year,
        leave_date__month=month,
        submission_status__in=('draft', 'submitted'),
    ).exists()


def _has_pending_paid_rest_records(year, month, employee_ids):
    """Return whether unresolved paid-rest requests still exist for the month."""

    if not employee_ids:
        return False

    return EmployeePaidRestRequest.objects.filter(
        employee_id__in=employee_ids,
        rest_date__year=year,
        rest_date__month=month,
        submission_status__in=('draft', 'submitted'),
    ).exists()


def _overlay_leave_records_on_day_payload(day_payload, leave_records):
    """Overlay approved or recorded-unapproved leave onto one day payload."""

    if not leave_records:
        return day_payload

    normalized_payload = dict(day_payload)
    for leave_record in leave_records:
        leave_status = _get_leave_overlay_status(leave_record)
        if leave_status is None:
            continue

        for shift_key in _determine_leave_shift_targets(leave_record):
            status_key = f'{shift_key}_status'
            in_key = f'{shift_key}_in'
            out_key = f'{shift_key}_out'

            if (
                normalized_payload[status_key] == 'present'
                and normalized_payload[in_key]
                and normalized_payload[out_key]
            ):
                continue

            normalized_payload[status_key] = leave_status
            normalized_payload[in_key] = ''
            normalized_payload[out_key] = ''

    return normalized_payload


def _overlay_paid_rest_records_on_day_payload(day_payload, paid_rest_requests):
    """Overlay approved paid rest onto one day payload."""

    if not paid_rest_requests:
        return day_payload

    normalized_payload = dict(day_payload)
    for paid_rest_request in paid_rest_requests:
        for shift_key in _determine_paid_rest_shift_targets(paid_rest_request):
            status_key = f'{shift_key}_status'
            in_key = f'{shift_key}_in'
            out_key = f'{shift_key}_out'

            normalized_payload[status_key] = 'paid_rest'
            normalized_payload[in_key] = ''
            normalized_payload[out_key] = ''

    return normalized_payload


def _build_overtime_decision_lookup(year, month, employee_ids):
    """Index overtime decisions by employee/date/shift for final-save checks."""

    lookup = {}
    if not employee_ids:
        return lookup

    decisions = AttendanceOvertimeDecision.objects.filter(
        employee_id__in=employee_ids,
        attendance_date__year=year,
        attendance_date__month=month,
    )

    for decision in decisions:
        lookup[(decision.employee_id, decision.attendance_date.isoformat(), decision.attendance_shift)] = decision

    return lookup


def _normalize_overtime_decision_payload(decision_payload, year, month, allowed_employee_ids):
    """Normalize and validate raw overtime-decision payload data."""

    employee_id = decision_payload.get('employee')
    attendance_date = decision_payload.get('attendance_date')
    attendance_shift = str(decision_payload.get('attendance_shift') or '').strip()

    try:
        employee_id = int(employee_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError('Overtime decision employee is invalid.') from exc

    if employee_id not in allowed_employee_ids:
        raise ValidationError('Overtime decision employee is not part of this attendance payload.')

    if attendance_shift not in ('morning', 'afternoon'):
        raise ValidationError('Overtime decision shift must be morning or afternoon.')

    try:
        attendance_date_obj = date.fromisoformat(str(attendance_date))
    except (TypeError, ValueError) as exc:
        raise ValidationError('Overtime decision date must use YYYY-MM-DD format.') from exc

    if attendance_date_obj.year != year or attendance_date_obj.month != month:
        raise ValidationError('Overtime decision date must stay inside the saved attendance month.')

    normalized = {
        'employee': employee_id,
        'attendance_date': attendance_date_obj.isoformat(),
        'attendance_shift': attendance_shift,
        'roster_start_time': decision_payload.get('roster_start_time') or '',
        'roster_end_time': decision_payload.get('roster_end_time') or '',
        'actual_checkout_time': decision_payload.get('actual_checkout_time') or '',
        'status': decision_payload.get('status') or 'pending',
        'decision_reason': decision_payload.get('decision_reason') or '',
        'narrowed_decision_enabled': bool(decision_payload.get('narrowed_decision_enabled')),
    }

    decision_id = decision_payload.get('id')
    if decision_id not in (None, ''):
        try:
            normalized['id'] = int(decision_id)
        except (TypeError, ValueError) as exc:
            raise ValidationError('Overtime decision id is invalid.') from exc

    if 'segments' in decision_payload:
        normalized['segments'] = decision_payload.get('segments') or []

    return normalized


def _sync_overtime_decisions(year, month, employee_ids, overtime_decisions_payload):
    """Upsert overtime decisions sent alongside an attendance save request."""

    if overtime_decisions_payload is None:
        return

    queryset = AttendanceOvertimeDecision.objects.filter(
        employee_id__in=employee_ids,
        attendance_date__year=year,
        attendance_date__month=month,
    )

    if not overtime_decisions_payload:
        queryset.delete()
        return

    existing_by_id = {decision.id: decision for decision in queryset}
    existing_by_key = {
        (decision.employee_id, decision.attendance_date.isoformat(), decision.attendance_shift): decision
        for decision in queryset
    }
    kept_ids = []

    for raw_decision in overtime_decisions_payload:
        normalized = _normalize_overtime_decision_payload(raw_decision, year, month, set(employee_ids))
        instance = None

        decision_id = normalized.pop('id', None)
        if decision_id is not None:
            instance = existing_by_id.get(decision_id)
            if instance is None:
                raise ValidationError('Overtime decision no longer exists. Refresh the page and review overtime again.')

        if instance is None:
            decision_key = (
                normalized['employee'],
                normalized['attendance_date'],
                normalized['attendance_shift'],
            )
            instance = existing_by_key.get(decision_key)

        serializer = AttendanceOvertimeDecisionSerializer(instance, data=normalized, partial=bool(instance))
        serializer.is_valid(raise_exception=True)
        decision = serializer.save()
        kept_ids.append(decision.id)

    queryset.exclude(id__in=kept_ids).delete()


def _compute_potential_overtime_minutes(day_payload, roster_day, shift_key, overtime_grace_minutes=0):
    """Calculate potential overtime minutes for one shift block."""

    if roster_day is None or roster_day.get('is_working') is not True:
        return 0, '', '', ''

    if day_payload[f'{shift_key}_status'] != 'present':
        return 0, '', '', ''

    roster_start_time = normalize_clock_time(roster_day.get(f'{shift_key}_in'))
    roster_end_time = normalize_clock_time(roster_day.get(f'{shift_key}_out'))
    actual_checkout_time = normalize_clock_time(day_payload[f'{shift_key}_out'])

    roster_end_minutes = _parse_time_to_minutes(roster_end_time)
    actual_checkout_minutes = _parse_time_to_minutes(actual_checkout_time)
    if roster_end_minutes is None or actual_checkout_minutes is None or actual_checkout_minutes <= roster_end_minutes:
        return 0, roster_start_time, roster_end_time, actual_checkout_time

    potential_minutes = actual_checkout_minutes - roster_end_minutes
    if potential_minutes <= int(overtime_grace_minutes or 0):
        return 0, roster_start_time, roster_end_time, actual_checkout_time

    return potential_minutes, roster_start_time, roster_end_time, actual_checkout_time


def _validate_overtime_decision_for_final(day_payload, employee_obj, target_date, roster_day, overtime_lookup):
    """Ensure final attendance saves are backed by up-to-date overtime decisions."""

    employee_label = employee_obj.worker_id or employee_obj.name or 'Employee'
    overtime_grace_minutes = _get_employee_overtime_grace_minutes(employee_obj, target_date)

    for shift_key in ('morning', 'afternoon'):
        potential_minutes, roster_start_time, roster_end_time, actual_checkout_time = _compute_potential_overtime_minutes(
            day_payload,
            roster_day,
            shift_key,
            overtime_grace_minutes,
        )
        if potential_minutes <= 0:
            continue

        decision = overtime_lookup.get((employee_obj.id, target_date.isoformat(), shift_key))
        if decision is None or decision.status == 'pending':
            raise ValidationError(
                f'Overtime decision still pending for {employee_label} on {target_date.isoformat()} ({shift_key}).'
            )

        if (
            decision.potential_ot_minutes != potential_minutes
            or normalize_clock_time(decision.roster_start_time) != roster_start_time
            or normalize_clock_time(decision.roster_end_time) != roster_end_time
            or normalize_clock_time(decision.actual_checkout_time) != actual_checkout_time
        ):
            raise ValidationError(
                f'Overtime decision is stale for {employee_label} on {target_date.isoformat()} ({shift_key}). Re-review overtime before final save.'
            )

        if decision.approved_ot_minutes + decision.denied_ot_minutes != potential_minutes:
            raise ValidationError(
                f'Overtime decision does not fully cover the potential overtime block for {employee_label} on {target_date.isoformat()} ({shift_key}).'
            )


def _coerce_status(value):
    """Restrict arbitrary status values to the supported attendance status set."""

    if value in ('present', 'absent', 'missing', 'off', 'paid_rest', 'approved_leave', 'unapproved_leave'):
        return value
    return 'missing'


def _extract_day_payload(day_payload):
    """Normalize one frontend day payload into the flattened storage shape."""

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


def _normalize_roster_off_day_payload(day_payload, roster_day):
    """Auto-mark a blank rostered off-day as ``off`` when no logs are present."""

    if roster_day is None or roster_day.get('is_working') is not False:
        return day_payload
    if day_payload['raw_logs']:
        return day_payload
    if day_payload['morning_status'] != 'missing' or day_payload['afternoon_status'] != 'missing':
        return day_payload

    normalized_payload = dict(day_payload)
    normalized_payload.update(
        {
            'morning_in': '',
            'morning_out': '',
            'afternoon_in': '',
            'afternoon_out': '',
            'morning_status': 'off',
            'afternoon_status': 'off',
        }
    )
    return normalized_payload


def _validate_shift_for_final(day_payload, day_index, employee_label):
    """Ensure a finalized attendance day has no unresolved missing data."""

    if day_payload['morning_status'] == 'off' and day_payload['afternoon_status'] == 'off':
        return

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


def _validate_active_employee_coverage_for_final(year, month, matched_employees):
    """Require every active employee to appear in a finalized attendance month."""

    matched_employee_ids = {row['employee_obj'].id for row in matched_employees}
    missing_employees = list(
        Employee.objects.filter(is_active=True)
        .exclude(id__in=matched_employee_ids)
        .order_by('name', 'id')
    )
    if not missing_employees:
        return

    missing_labels = ', '.join((employee.worker_id or employee.name) for employee in missing_employees[:10])
    remainder_count = len(missing_employees) - 10
    remainder_label = '' if remainder_count <= 0 else f' and {remainder_count} more'
    raise ValidationError(
        'Final attendance must include every active employee for the month. '
        f'Missing attendance rows for: {missing_labels}{remainder_label}.'
    )


def _save_attendance_payload(payload, status):
    """Persist a draft or final attendance month from the normalized API payload."""

    year = payload.get('year')
    month = payload.get('month')
    employees = payload.get('employees') or []
    overtime_decisions_payload = payload.get('overtime_decisions', None)

    if not year or not month:
        raise ValidationError('Year and month are required.')

    try:
        year = int(year)
        month = int(month)
    except ValueError:
        raise ValidationError('Invalid year or month.')

    matched_employees = []
    for employee_payload in employees:
        worker_id = str(employee_payload.get('worker_id') or employee_payload.get('employee_id') or '').strip()
        employee_name = str(employee_payload.get('employee_name') or '').strip()
        department = str(employee_payload.get('department') or '').strip()

        employee_obj = _get_active_employee_by_identity(worker_id, employee_name)
        if employee_obj is None:
            continue

        matched_employees.append(
            {
                'employee_obj': employee_obj,
                'worker_id': worker_id,
                'employee_name': employee_name,
                'department': department,
                'days': employee_payload.get('days') or {},
            }
        )

    employee_ids = [row['employee_obj'].id for row in matched_employees]
    leave_lookup = _build_leave_record_lookup(year, month, employee_ids)
    paid_rest_lookup = _build_paid_rest_lookup(year, month, employee_ids)
    overtime_lookup = _build_overtime_decision_lookup(year, month, employee_ids) if status == 'final' else {}

    if status == 'final' and _has_pending_leave_records(year, month, employee_ids):
        raise ValidationError('Leave decisions are still pending for this month.')
    if status == 'final' and _has_pending_paid_rest_records(year, month, employee_ids):
        raise ValidationError('Paid-rest decisions are still pending for this month.')
    if status == 'final':
        _validate_active_employee_coverage_for_final(year, month, matched_employees)

    with transaction.atomic():
        _sync_overtime_decisions(year, month, employee_ids, overtime_decisions_payload)

        record, _ = AttendanceRecord.objects.update_or_create(
            year=year,
            month=month,
            status=status,
            defaults={},
        )

        record.employees.all().delete()

        for employee_row in matched_employees:
            employee_obj = employee_row['employee_obj']
            worker_id = employee_row['worker_id']
            employee_name = employee_row['employee_name']
            department = employee_row['department']

            assignment = _get_employee_roster_assignment(employee_obj)
            schedule_lookup = None
            if assignment is not None:
                try:
                    schedule_lookup = build_roster_schedule_lookup(
                        assignment.template.schedule,
                        assignment.template.cycle_length_weeks,
                    )
                except ValueError:
                    schedule_lookup = None

            record_employee = AttendanceRecordEmployee.objects.create(
                record=record,
                employee=employee_obj,
                employee_name=employee_name,
                department=department,
                worker_id=worker_id,
            )

            days = employee_row['days']
            for day_str, day_payload in days.items():
                try:
                    day_index = int(day_str)
                except ValueError:
                    continue

                try:
                    target_date = date(year, month, day_index)
                except ValueError:
                    continue

                roster_day = _resolve_assignment_roster_day(assignment, schedule_lookup, target_date)
                normalized = _extract_day_payload(day_payload or {})
                normalized = _overlay_leave_records_on_day_payload(
                    normalized,
                    leave_lookup.get((employee_obj.id, target_date.isoformat()), []),
                )
                normalized = _overlay_paid_rest_records_on_day_payload(
                    normalized,
                    paid_rest_lookup.get((employee_obj.id, target_date.isoformat()), []),
                )
                normalized = _normalize_roster_off_day_payload(normalized, roster_day)
                employee_label = worker_id or employee_name or 'Employee'
                if status == 'final':
                    _validate_shift_for_final(normalized, day_index, employee_label)
                    _validate_overtime_decision_for_final(normalized, employee_obj, target_date, roster_day, overtime_lookup)

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
    """Parse one or more uploaded attendance spreadsheets into reviewable JSON."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_files = _get_uploaded_attendance_files(request)
        if not uploaded_files:
            return Response({'error': 'No files uploaded.'}, status=400)

        year = request.data.get('year')
        month = request.data.get('month')

        try:
            year = int(year) if year else None
            month = int(month) if month else None
        except ValueError:
            return Response({'error': 'Invalid month or year.'}, status=400)

        merged_payload = None
        warnings = []
        source_files = []

        for file_obj in uploaded_files:
            file_name = getattr(file_obj, 'name', 'attendance-sheet')
            try:
                parsed_payload = _parse_attendance_sheet_records(file_obj, year=year, month=month)
            except AttendanceSheetFormatError as exc:
                warning_message = f'{file_name}: {exc}'
                warnings.append(warning_message)
                source_files.append({
                    'name': file_name,
                    'status': 'skipped',
                    'employees_count': 0,
                    'warning': warning_message,
                })
                continue
            except Exception as exc:
                warning_message = f'{file_name}: Failed to parse attendance sheet ({exc}).'
                warnings.append(warning_message)
                source_files.append({
                    'name': file_name,
                    'status': 'skipped',
                    'employees_count': 0,
                    'warning': warning_message,
                })
                continue
            finally:
                _cleanup_uploaded_file(file_obj)

            if merged_payload is None:
                merged_payload = parsed_payload
            elif (
                parsed_payload['year'] != merged_payload['year']
                or parsed_payload['month'] != merged_payload['month']
            ):
                warning_message = (
                    f"{file_name}: Skipped because it resolved to {parsed_payload['year']}-{parsed_payload['month']:02d}, "
                    f"but the batch is already using {merged_payload['year']}-{merged_payload['month']:02d}."
                )
                warnings.append(warning_message)
                source_files.append({
                    'name': file_name,
                    'status': 'skipped',
                    'employees_count': 0,
                    'warning': warning_message,
                })
                continue
            else:
                merged_payload = _merge_parsed_attendance_payloads(merged_payload, parsed_payload)

            file_warnings = [f'{file_name}: {warning}' for warning in (parsed_payload.get('warnings') or [])]
            warnings.extend(file_warnings)

            source_files.append({
                'name': file_name,
                'status': 'parsed',
                'employees_count': len(parsed_payload.get('employees') or []),
                'warning': '; '.join(file_warnings) if file_warnings else None,
            })

        if merged_payload is None:
            return Response(
                {
                    'error': 'No valid attendance files were parsed.',
                    'warnings': warnings,
                    'source_files': source_files,
                },
                status=400,
            )

        merged_payload['warnings'] = warnings
        merged_payload['source_files'] = source_files

        return Response(merged_payload)


class AttendanceRecordsSaveView(APIView):
    """Persist a finalized attendance month after all validations pass."""

    def post(self, request):
        try:
            record = _save_attendance_payload(request.data, status='final')
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)
        except Exception as exc:
            return Response({'error': f'Failed to save attendance record: {exc}'}, status=400)

        return Response(_serialize_attendance_record(record))


class AttendanceRecordsSaveDraftView(APIView):
    """Persist a draft attendance month without final-resolution requirements."""

    def post(self, request):
        try:
            record = _save_attendance_payload(request.data, status='draft')
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)
        except Exception as exc:
            return Response({'error': f'Failed to save draft attendance record: {exc}'}, status=400)

        return Response(_serialize_attendance_record(record))


class AttendanceRecordsReopenView(APIView):
    """Convert a finalized attendance month back into a draft for editing."""

    def post(self, request):
        year = request.data.get('year')
        month = request.data.get('month')
        if not year or not month:
            return Response({'error': 'year and month are required.'}, status=400)

        try:
            year = int(year)
            month = int(month)
        except ValueError:
            return Response({'error': 'Invalid year or month.'}, status=400)

        final_record = AttendanceRecord.objects.filter(year=year, month=month, status='final').first()
        if final_record is None:
            return Response({'error': 'No finalized attendance record found.'}, status=404)

        draft_payload = _serialize_attendance_record(final_record)
        try:
            with transaction.atomic():
                AttendanceRecord.objects.filter(year=year, month=month, status='draft').delete()
                draft_record = _save_attendance_payload(draft_payload, status='draft')
                final_record.delete()
                AttendanceMonthlySummary.objects.filter(year=year, month=month).delete()
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)
        except Exception as exc:
            return Response({'error': f'Failed to reopen finalized attendance: {exc}'}, status=400)

        return Response(_serialize_attendance_record(draft_record))


class AttendanceRecordsFetchView(APIView):
    """Fetch a finalized attendance month."""

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
    """Fetch a saved attendance draft month."""

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


class AttendanceRecordsHistoryView(APIView):
    """List saved attendance months for history and reload flows."""

    def get(self, request):
        records = sorted(
            AttendanceRecord.objects.all(),
            key=lambda record: (record.year, record.month, record.status == 'final', record.updated_at),
            reverse=True,
        )

        return Response({
            'records': [_serialize_attendance_record_summary(record) for record in records],
        })


def _parse_optional_year_month(query_params):
    """Parse optional year/month filters for leave and overtime endpoints."""

    year = query_params.get('year')
    month = query_params.get('month')
    if year is None and month is None:
        return None, None
    if not year or not month:
        raise ValidationError('year and month are required together.')

    try:
        return int(year), int(month)
    except ValueError:
        raise ValidationError('Invalid year or month.')


def _get_request_user(request):
    """Return the authenticated request user or ``None``."""

    if getattr(request, 'user', None) and request.user.is_authenticated:
        return request.user
    return None


def _stamp_leave_record_status(leave_record, request, status_value):
    """Apply workflow timestamps and overlap checks to a leave record."""

    user = _get_request_user(request)
    now = timezone.now()

    if status_value == 'approved':
        leave_targets = set(_determine_leave_shift_targets(leave_record))
        overlapping_paid_rest = EmployeePaidRestRequest.objects.filter(
            employee=leave_record.employee,
            rest_date=leave_record.leave_date,
            submission_status='approved',
        )
        for paid_rest_request in overlapping_paid_rest:
            if leave_targets.intersection(_determine_paid_rest_shift_targets(paid_rest_request)):
                raise ValidationError('Approved leave overlaps an approved paid-rest request for the same shift.')

    leave_record.submission_status = status_value
    if status_value != 'draft':
        if leave_record.submitted_at is None:
            leave_record.submitted_at = now
        if leave_record.submitted_by is None and user is not None:
            leave_record.submitted_by = user

    if status_value in ('approved', 'rejected', 'recorded_unapproved'):
        leave_record.decision_at = now
        if user is not None:
            leave_record.decision_by = user
    elif status_value in ('draft', 'submitted'):
        leave_record.decision_at = None
        leave_record.decision_by = None


def _stamp_overtime_decision_status(decision, request):
    """Set or clear overtime decision resolution metadata based on status."""

    user = _get_request_user(request)
    if decision.status == 'pending':
        decision.resolved_at = None
        decision.resolved_by = None
        return

    decision.resolved_at = timezone.now()
    if user is not None:
        decision.resolved_by = user


class PayrollLeaveRecordsView(APIView):
    """List or create leave records that feed attendance and payroll."""

    def get(self, request):
        try:
            year, month = _parse_optional_year_month(request.query_params)
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)

        queryset = EmployeeLeaveRecord.objects.select_related('employee', 'submitted_by', 'decision_by')
        if year is not None and month is not None:
            queryset = queryset.filter(leave_date__year=year, leave_date__month=month)

        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        serializer = EmployeeLeaveRecordSerializer(queryset.order_by('leave_date', 'employee_id', 'id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        serializer = EmployeeLeaveRecordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        leave_record = serializer.save()
        _stamp_leave_record_status(
            leave_record,
            request,
            serializer.validated_data.get('submission_status', leave_record.submission_status),
        )
        leave_record.save()

        return Response(EmployeeLeaveRecordSerializer(leave_record).data, status=201)


class PayrollLeaveRecordDetailView(APIView):
    """Update one leave record."""

    def patch(self, request, pk):
        leave_record = EmployeeLeaveRecord.objects.filter(pk=pk).first()
        if leave_record is None:
            return Response({'error': 'Leave record not found.'}, status=404)

        serializer = EmployeeLeaveRecordSerializer(leave_record, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        leave_record = serializer.save()
        if 'submission_status' in serializer.validated_data:
            _stamp_leave_record_status(leave_record, request, serializer.validated_data['submission_status'])
            leave_record.save()

        return Response(EmployeeLeaveRecordSerializer(leave_record).data)


class PayrollLeaveRecordSubmitView(APIView):
    """Move a leave record into the submitted state."""

    def post(self, request, pk):
        leave_record = EmployeeLeaveRecord.objects.filter(pk=pk).first()
        if leave_record is None:
            return Response({'error': 'Leave record not found.'}, status=404)

        _stamp_leave_record_status(leave_record, request, 'submitted')
        leave_record.save()
        return Response(EmployeeLeaveRecordSerializer(leave_record).data)


class PayrollLeaveRecordApproveView(APIView):
    """Approve a leave record after overlap checks."""

    def post(self, request, pk):
        leave_record = EmployeeLeaveRecord.objects.filter(pk=pk).first()
        if leave_record is None:
            return Response({'error': 'Leave record not found.'}, status=404)

        manager_note = request.data.get('manager_note')
        if manager_note is not None:
            leave_record.manager_note = str(manager_note).strip()

        _stamp_leave_record_status(leave_record, request, 'approved')
        leave_record.save()
        return Response(EmployeeLeaveRecordSerializer(leave_record).data)


class PayrollLeaveRecordRejectView(APIView):
    """Reject a leave record."""

    def post(self, request, pk):
        leave_record = EmployeeLeaveRecord.objects.filter(pk=pk).first()
        if leave_record is None:
            return Response({'error': 'Leave record not found.'}, status=404)

        manager_note = request.data.get('manager_note')
        if manager_note is not None:
            leave_record.manager_note = str(manager_note).strip()

        _stamp_leave_record_status(leave_record, request, 'rejected')
        leave_record.save()
        return Response(EmployeeLeaveRecordSerializer(leave_record).data)


class PayrollLeaveRecordRecordUnapprovedView(APIView):
    """Record that leave occurred without approval."""

    def post(self, request, pk):
        leave_record = EmployeeLeaveRecord.objects.filter(pk=pk).first()
        if leave_record is None:
            return Response({'error': 'Leave record not found.'}, status=404)

        manager_note = request.data.get('manager_note')
        if manager_note is not None:
            leave_record.manager_note = str(manager_note).strip()

        _stamp_leave_record_status(leave_record, request, 'recorded_unapproved')
        leave_record.save()
        return Response(EmployeeLeaveRecordSerializer(leave_record).data)


class PayrollOvertimeDecisionsView(APIView):
    """List or upsert overtime decisions tied to attendance shifts."""

    def get(self, request):
        try:
            year, month = _parse_optional_year_month(request.query_params)
        except ValidationError as exc:
            return Response({'error': exc.detail}, status=400)

        queryset = AttendanceOvertimeDecision.objects.select_related('employee', 'resolved_by').prefetch_related('segments')
        if year is not None and month is not None:
            queryset = queryset.filter(attendance_date__year=year, attendance_date__month=month)

        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        serializer = AttendanceOvertimeDecisionSerializer(queryset.order_by('attendance_date', 'employee_id', 'attendance_shift'), many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        instance = None
        decision_id = request.data.get('id')
        if decision_id:
            instance = AttendanceOvertimeDecision.objects.filter(pk=decision_id).first()

        if instance is None:
            employee_id = request.data.get('employee')
            attendance_date = request.data.get('attendance_date')
            attendance_shift = request.data.get('attendance_shift')
            if employee_id and attendance_date and attendance_shift:
                instance = AttendanceOvertimeDecision.objects.filter(
                    employee_id=employee_id,
                    attendance_date=attendance_date,
                    attendance_shift=attendance_shift,
                ).first()

        serializer = AttendanceOvertimeDecisionSerializer(instance, data=request.data, partial=bool(instance))
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        decision = serializer.save()
        _stamp_overtime_decision_status(decision, request)
        decision.save()

        return Response(
            AttendanceOvertimeDecisionSerializer(decision).data,
            status=200 if instance is not None else 201,
        )


class PayrollOvertimeDecisionDetailView(APIView):
    """Update one overtime decision."""

    def patch(self, request, pk):
        decision = AttendanceOvertimeDecision.objects.filter(pk=pk).first()
        if decision is None:
            return Response({'error': 'Overtime decision not found.'}, status=404)

        serializer = AttendanceOvertimeDecisionSerializer(decision, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        decision = serializer.save()
        _stamp_overtime_decision_status(decision, request)
        decision.save()
        return Response(AttendanceOvertimeDecisionSerializer(decision).data)


class PayrollAttendanceResolutionsView(PayrollOvertimeDecisionsView):
    """Alias view exposing the same data as overtime decisions for payroll UI wording."""

    pass


class PayrollAttendanceResolutionDetailView(PayrollOvertimeDecisionDetailView):
    """Alias detail view for attendance-resolution wording in the frontend."""

    pass


class PayrollAttendanceResolutionApproveView(APIView):
    """Approve an attendance overtime resolution in full."""

    def post(self, request, pk):
        decision = AttendanceOvertimeDecision.objects.filter(pk=pk).first()
        if decision is None:
            return Response({'error': 'Attendance resolution not found.'}, status=404)

        serializer = AttendanceOvertimeDecisionSerializer(
            decision,
            data={
                'status': 'approved',
                'decision_reason': str(request.data.get('decision_reason', '') or '').strip(),
                'narrowed_decision_enabled': False,
            },
            partial=True,
        )
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        decision = serializer.save()
        _stamp_overtime_decision_status(decision, request)
        decision.save()
        return Response(AttendanceOvertimeDecisionSerializer(decision).data)


class PayrollAttendanceResolutionDenyView(APIView):
    """Deny an attendance overtime resolution in full."""

    def post(self, request, pk):
        decision = AttendanceOvertimeDecision.objects.filter(pk=pk).first()
        if decision is None:
            return Response({'error': 'Attendance resolution not found.'}, status=404)

        serializer = AttendanceOvertimeDecisionSerializer(
            decision,
            data={
                'status': 'denied',
                'decision_reason': str(request.data.get('decision_reason', '') or '').strip(),
                'narrowed_decision_enabled': False,
            },
            partial=True,
        )
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        decision = serializer.save()
        _stamp_overtime_decision_status(decision, request)
        decision.save()
        return Response(AttendanceOvertimeDecisionSerializer(decision).data)


class PayrollAttendanceResolutionPartialApproveView(APIView):
    """Partially approve an overtime resolution using approved/denied segments."""

    def post(self, request, pk):
        decision = AttendanceOvertimeDecision.objects.filter(pk=pk).first()
        if decision is None:
            return Response({'error': 'Attendance resolution not found.'}, status=404)

        segments = request.data.get('segments') or []
        if not segments:
            return Response({'error': {'segments': 'Partially approved overtime requires approved and denied segments.'}}, status=400)

        serializer = AttendanceOvertimeDecisionSerializer(
            decision,
            data={
                'status': 'partially_approved',
                'decision_reason': str(request.data.get('decision_reason', '') or '').strip(),
                'narrowed_decision_enabled': True,
                'segments': segments,
            },
            partial=True,
        )
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        decision = serializer.save()
        _stamp_overtime_decision_status(decision, request)
        decision.save()
        return Response(AttendanceOvertimeDecisionSerializer(decision).data)