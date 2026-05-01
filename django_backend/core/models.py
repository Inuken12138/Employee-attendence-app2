"""
Django Models.py - Purpose and Relationship

Theoretical Understanding
The models.py file defines the database schema and business logic using Django's Object-Relational Mapping (ORM). 
It represents database tables as Python classes and provides an abstraction layer for database operations.

Relationship with Other Components
1. Views (views.py)
- Models provide data that views process and send to clients
- Views query models through the ORM
- Models define the structure of data that views can access

2. Serializers (serializers.py)
- Models define the data structure that serializers convert
- Serializers use model fields to create API representations

3. Database
- Models map directly to database tables
- Django ORM translates model operations to SQL queries

Current Implementation
1. User Model
    class User(AbstractUser):
        ROLE_CHOICES = (
            ('manager', 'Manager'),
            ('employee', 'Employee'),
        )
        role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')

- Extends Django's AbstractUser
- Adds role-based authentication

2. Employee Model
    class Employee(models.Model):
        name = models.CharField(max_length=100)
        base_salary = models.FloatField()

- Basic employee information
- Tracks name and salary

3. InventoryItem Model
    class InventoryItem(models.Model):
        name = models.CharField(max_length=100)
        quantity = models.IntegerField()
        unit = models.CharField(max_length=20)
        last_updated = models.DateTimeField(auto_now=True)

- Inventory tracking system
- Automated timestamp updates

4. Product Model
    class Product(models.Model):
        name = models.CharField(max_length=100)
        price = models.FloatField()
        description = models.TextField(blank=True)
        image_url = models.URLField(blank=True)

- Product catalog information
- Optional description and image

How to extend:
1. Add new fields to existing models:
   class Employee(models.Model):
       department = models.CharField(max_length=100)
       hire_date = models.DateField()

2. Create relationships between models:
   class Order(models.Model):
       product = models.ForeignKey(Product, on_delete=models.CASCADE)
       employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True)

3. Add model methods:
   class Product(models.Model):
       def get_discounted_price(self, discount):
           return self.price * (1 - discount)

4. Add Meta options:
   class Meta:
       ordering = ['name']
       verbose_name_plural = 'Categories'
"""

from django.db import models
from django.db.models import Q
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from django.utils.text import slugify
from PIL import Image, ImageOps
import os
import uuid

# Create your models here.

class User(AbstractUser):
    """Application user with a lightweight role field for coarse access decisions."""

    ROLE_CHOICES = (
        ('manager', 'Manager'),
        ('employee', 'Employee'),
        ('customer', 'Customer'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')


class Department(models.Model):
    """Organizational unit used for employee grouping and paid-rest rules."""

    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=40, null=True, blank=True, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    shop_paid_rest_enabled = models.BooleanField(default=False)
    paid_rest_days_granted_per_month = models.DecimalField(max_digits=8, decimal_places=2, default=2)
    paid_rest_carry_forward_cap_days = models.DecimalField(max_digits=8, decimal_places=2, default=9999)
    minimum_staff_required_per_shift = models.PositiveIntegerField(default=2)
    allow_half_day_paid_rest = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name

class Employee(models.Model):
    """Primary HR record used by attendance, payroll, and construction modules."""

    name = models.CharField(max_length=100)
    #position = models.CharField(max_length=100)
    base_salary = models.FloatField(default=0)
    worker_id = models.CharField(max_length=50, null=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name', 'id']
        constraints = [
            models.UniqueConstraint(fields=['worker_id', 'name'], name='unique_employee_worker_name'),
        ]
    
    def __str__(self):
        return self.name

    def active_compensation_profile(self, target_date):
        """Return the compensation ledger entry active on the given date."""

        return self.compensation_profiles.filter(
            effective_from__lte=target_date,
        ).filter(
            Q(effective_to__isnull=True) | Q(effective_to__gte=target_date)
        ).select_related('payroll_policy').order_by('-effective_from', '-id').first()

    def active_attendance_work_rule_profile(self, target_date):
        """Return the attendance work-rule profile active on the given date."""

        return self.attendance_work_rule_profiles.filter(
            effective_from__lte=target_date,
        ).filter(
            Q(effective_to__isnull=True) | Q(effective_to__gte=target_date)
        ).order_by('-effective_from', '-id').first()

    def active_attendance_work_rule(self, target_date):
        """Return the effective attendance work rule, defaulting to standard."""

        profile = self.active_attendance_work_rule_profile(target_date)
        if profile is None:
            return EmployeeAttendanceWorkRuleProfile.WORK_RULE_STANDARD
        return profile.work_rule


class AttendanceRecord(models.Model):
    """One month of attendance data in either draft or finalized form."""

    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('final', 'Final'),
    )

    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['year', 'month', 'status'], name='unique_attendance_record_status'),
        ]

    def __str__(self):
        return f"AttendanceRecord({self.year}-{self.month:02d}, {self.status})"


class AttendanceRecordEmployee(models.Model):
    """Employee-specific slice inside a monthly attendance record."""

    record = models.ForeignKey(AttendanceRecord, on_delete=models.CASCADE, related_name='employees')
    employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True)
    employee_name = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    worker_id = models.CharField(max_length=50, blank=True)

    class Meta:
        unique_together = ('record', 'worker_id', 'employee_name')

    def __str__(self):
        return f"AttendanceRecordEmployee({self.worker_id or self.employee_name})"


class AttendanceShift(models.Model):
    """Per-day attendance outcome with separate morning and afternoon states."""

    STATUS_CHOICES = (
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('off', 'Off day'),
        ('missing', 'Missing'),
        ('paid_rest', 'Paid rest'),
        ('approved_leave', 'Approved leave'),
        ('unapproved_leave', 'Unapproved leave'),
    )

    record_employee = models.ForeignKey(AttendanceRecordEmployee, on_delete=models.CASCADE, related_name='shifts')
    day = models.PositiveSmallIntegerField()
    raw_logs = models.JSONField(default=list, blank=True)
    morning_in = models.CharField(max_length=20, blank=True)
    morning_out = models.CharField(max_length=20, blank=True)
    afternoon_in = models.CharField(max_length=20, blank=True)
    afternoon_out = models.CharField(max_length=20, blank=True)
    morning_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='missing')
    afternoon_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='missing')

    class Meta:
        unique_together = ('record_employee', 'day')

    def __str__(self):
        return f"AttendanceShift({self.record_employee_id}, day {self.day})"


class RosterTemplate(models.Model):
    """Reusable repeating schedule template assigned to employees."""

    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    cycle_length_weeks = models.PositiveSmallIntegerField(default=1)
    schedule = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class EmployeeRosterAssignment(models.Model):
    """Attach one roster template to one employee from an effective date onward."""

    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='roster_assignment')
    template = models.ForeignKey(RosterTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments')
    effective_start_date = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee_id']

    def __str__(self):
        template_name = self.template.name if self.template else 'No template'
        return f'{self.employee.name} -> {template_name}'


class AttendanceOvertimeDecision(models.Model):
    """Manager decision record for overtime detected from attendance data."""

    SHIFT_CHOICES = (
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    )

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('denied', 'Denied'),
        ('partially_approved', 'Partially approved'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='overtime_decisions')
    attendance_date = models.DateField()
    attendance_shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    roster_start_time = models.CharField(max_length=20, blank=True)
    roster_end_time = models.CharField(max_length=20, blank=True)
    actual_checkout_time = models.CharField(max_length=20, blank=True)
    potential_ot_minutes = models.PositiveIntegerField(default=0)
    approved_ot_minutes = models.PositiveIntegerField(default=0)
    denied_ot_minutes = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    decision_reason = models.TextField(blank=True)
    narrowed_decision_enabled = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_attendance_overtime_decisions',
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['attendance_date', 'employee_id', 'attendance_shift']
        unique_together = ('employee', 'attendance_date', 'attendance_shift')

    def __str__(self):
        return f'AttendanceOvertimeDecision({self.employee_id}, {self.attendance_date}, {self.attendance_shift})'


class AttendanceOvertimeDecisionSegment(models.Model):
    """Fine-grained split of one overtime block into approved and denied pieces."""

    STATUS_CHOICES = (
        ('approved', 'Approved'),
        ('denied', 'Denied'),
    )

    overtime_decision = models.ForeignKey(
        AttendanceOvertimeDecision,
        on_delete=models.CASCADE,
        related_name='segments',
    )
    segment_start_time = models.CharField(max_length=20)
    segment_end_time = models.CharField(max_length=20)
    segment_minutes = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'AttendanceOvertimeDecisionSegment({self.overtime_decision_id}, {self.status})'


class EmployeeLeaveRecord(models.Model):
    """Employee leave request and approval record tied to a specific date."""

    SUBMISSION_STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('recorded_unapproved', 'Recorded unapproved'),
    )

    DURATION_UNIT_CHOICES = (
        ('full_day', 'Full day'),
        ('half_day', 'Half day'),
        ('hour', 'Hour'),
        ('custom_minutes', 'Custom minutes'),
    )

    LINKED_SHIFT_CHOICES = (
        ('', 'Unlinked'),
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leave_records')
    leave_date = models.DateField()
    leave_start_time = models.CharField(max_length=20, blank=True)
    leave_end_time = models.CharField(max_length=20, blank=True)
    submission_status = models.CharField(max_length=20, choices=SUBMISSION_STATUS_CHOICES, default='submitted')
    duration_unit = models.CharField(max_length=20, choices=DURATION_UNIT_CHOICES, default='full_day')
    duration_value = models.FloatField(default=0)
    leave_minutes = models.PositiveIntegerField(default=0)
    employee_reason = models.TextField(blank=True)
    manager_note = models.TextField(blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_employee_leave_records',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    decision_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='decided_employee_leave_records',
    )
    decision_at = models.DateTimeField(null=True, blank=True)
    linked_attendance_shift = models.CharField(max_length=20, choices=LINKED_SHIFT_CHOICES, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['leave_date', 'employee_id', 'id']

    def __str__(self):
        return f'EmployeeLeaveRecord({self.employee_id}, {self.leave_date}, {self.submission_status})'


class EmployeePaidRestRequest(models.Model):
    """Department-governed paid-rest request for shop-floor employees."""

    SUBMISSION_STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    DURATION_UNIT_CHOICES = (
        ('full_day', 'Full day'),
        ('half_day', 'Half day'),
    )

    LINKED_SHIFT_CHOICES = (
        ('', 'Unlinked'),
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='paid_rest_requests')
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='paid_rest_requests',
    )
    rest_date = models.DateField()
    duration_unit = models.CharField(max_length=20, choices=DURATION_UNIT_CHOICES, default='full_day')
    linked_attendance_shift = models.CharField(max_length=20, choices=LINKED_SHIFT_CHOICES, blank=True)
    paid_rest_days = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    submission_status = models.CharField(max_length=20, choices=SUBMISSION_STATUS_CHOICES, default='draft')
    employee_reason = models.TextField(blank=True)
    manager_note = models.TextField(blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_employee_paid_rest_requests',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    decision_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='decided_employee_paid_rest_requests',
    )
    decision_at = models.DateTimeField(null=True, blank=True)
    coverage_snapshot_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['rest_date', 'employee_id', 'id']

    def __str__(self):
        return f'EmployeePaidRestRequest({self.employee_id}, {self.rest_date}, {self.submission_status})'


class EmployeePaidRestMonthlyBalance(models.Model):
    """Monthly paid-rest balance snapshot rebuilt from approvals and department rules."""

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='paid_rest_balances')
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='paid_rest_balances',
    )
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    opening_balance_days = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    granted_days = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    used_days = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    closing_balance_days = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    carry_forward_cap_days = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    calc_snapshot = models.JSONField(default=dict, blank=True)
    generated_at = models.DateTimeField(auto_now=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'employee_id']
        unique_together = ('employee', 'year', 'month')

    def __str__(self):
        return f'EmployeePaidRestMonthlyBalance({self.employee_id}, {self.year}-{self.month:02d})'


class PayrollPolicy(models.Model):
    """Versioned payroll policy that defines the calculation rules for a period."""

    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('archived', 'Archived'),
    )

    ROUNDING_RULE_CHOICES = (
        ('nearest_thousand', 'Nearest thousand'),
    )

    policy_code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    version_number = models.PositiveIntegerField(default=1)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    rice_allowance_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    social_security_allowance_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    full_attendance_bonus_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    labor_pool_percent = models.DecimalField(max_digits=5, decimal_places=4, default=0.10)
    normal_work_hours_per_day = models.DecimalField(max_digits=5, decimal_places=2, default=8)
    salary_days_per_month = models.PositiveSmallIntegerField(default=30)
    overtime_multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=2.00)
    overtime_grace_minutes = models.PositiveIntegerField(default=0)
    late_grace_minutes = models.PositiveIntegerField(null=True, blank=True)
    rounding_unit_amount = models.PositiveIntegerField(default=1000)
    rounding_rule = models.CharField(max_length=40, choices=ROUNDING_RULE_CHOICES, default='nearest_thousand')
    unapproved_absence_incident_threshold = models.PositiveIntegerField(default=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    cloned_from_policy = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cloned_versions',
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    currency = models.CharField(max_length=20, default='LAK')
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-effective_from', 'policy_code', '-version_number']
        unique_together = ('policy_code', 'version_number')

    def __str__(self):
        return f'{self.policy_code} v{self.version_number}'


class EmployeeCompensationProfile(models.Model):
    """Versioned salary and allowance ledger for an employee."""

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='compensation_profiles')
    monthly_salary = models.DecimalField(max_digits=14, decimal_places=2)
    rice_allowance_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    social_security_allowance_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    eligible_for_social_security = models.BooleanField(default=True)
    payroll_policy = models.ForeignKey(
        PayrollPolicy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='compensation_profiles',
    )
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee_id', '-effective_from', '-id']

    def __str__(self):
        return f'EmployeeCompensationProfile({self.employee_id}, {self.effective_from})'


class EmployeeAttendanceWorkRuleProfile(models.Model):
    """Versioned attendance-rule ledger for special handling such as driver time bank."""

    WORK_RULE_STANDARD = 'standard'
    WORK_RULE_DRIVER_TIME_BANK = 'driver_time_bank'
    WORK_RULE_CHOICES = (
        (WORK_RULE_STANDARD, 'Standard attendance rule'),
        (WORK_RULE_DRIVER_TIME_BANK, 'Driver attendance rule with time bank'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance_work_rule_profiles')
    work_rule = models.CharField(max_length=40, choices=WORK_RULE_CHOICES, default=WORK_RULE_STANDARD)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee_id', '-effective_from', '-id']

    def __str__(self):
        return f'EmployeeAttendanceWorkRuleProfile({self.employee_id}, {self.work_rule}, {self.effective_from})'


class AttendanceMonthlySummary(models.Model):
    """Derived monthly attendance totals used as payroll input."""

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance_monthly_summaries')
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    scheduled_work_days = models.PositiveIntegerField(default=0)
    actual_present_days = models.PositiveIntegerField(default=0)
    scheduled_minutes_total = models.PositiveIntegerField(default=0)
    worked_minutes_total = models.PositiveIntegerField(default=0)
    late_minutes_total = models.PositiveIntegerField(default=0)
    early_departure_minutes_total = models.PositiveIntegerField(default=0)
    absent_minutes_total = models.PositiveIntegerField(default=0)
    time_bank_minutes_total = models.PositiveIntegerField(default=0)
    paid_rest_minutes_total = models.PositiveIntegerField(default=0)
    approved_leave_minutes_total = models.PositiveIntegerField(default=0)
    unapproved_leave_minutes_total = models.PositiveIntegerField(default=0)
    potential_ot_minutes_total = models.PositiveIntegerField(default=0)
    approved_ot_minutes_total = models.PositiveIntegerField(default=0)
    denied_ot_minutes_total = models.PositiveIntegerField(default=0)
    full_attendance_eligible = models.BooleanField(default=False)
    disciplinary_flags_json = models.JSONField(default=dict, blank=True)
    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'employee_id']
        unique_together = ('employee', 'year', 'month')

    def __str__(self):
        return f'AttendanceMonthlySummary({self.employee_id}, {self.year}-{self.month:02d})'


class EmployeePayrollAdjustment(models.Model):
    """Manual bonus or deduction entry reviewed as part of payroll."""

    ADJUSTMENT_TYPE_CHOICES = (
        ('advance', 'Wage advance'),
        ('tips', 'Tips and extra jobs'),
        ('gardening', 'Gardening'),
        ('dog_feeding', 'Dog feeding'),
        ('manual_bonus', 'Manual bonus'),
        ('manual_deduction', 'Manual deduction'),
        ('other', 'Other'),
    )

    APPROVAL_STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payroll_adjustments')
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    adjustment_type = models.CharField(max_length=40, choices=ADJUSTMENT_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    approval_status = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_payroll_adjustments',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_payroll_adjustments',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'employee_id', '-id']

    def __str__(self):
        return f'EmployeePayrollAdjustment({self.employee_id}, {self.adjustment_type}, {self.amount})'


class ConstructionProject(models.Model):
    """Construction or installation project used for labor-pool bonus settlement."""

    STATUS_CHOICES = (
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('settled', 'Settled'),
    )

    name = models.CharField(max_length=160)
    project_code = models.CharField(max_length=50, unique=True)
    revenue_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    labor_pool_percent = models.DecimalField(max_digits=5, decimal_places=4, default=0.10)
    labor_pool_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')
    start_date = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    management_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date', 'name', 'id']

    def __str__(self):
        return f'{self.project_code} - {self.name}'


class ConstructionProjectAssignment(models.Model):
    """Assign an employee to a construction project and optionally weight the share."""

    project = models.ForeignKey(ConstructionProject, on_delete=models.CASCADE, related_name='assignments')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='project_assignments')
    role = models.CharField(max_length=120, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    share_weight = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['project_id', 'employee_id']
        unique_together = ('project', 'employee')

    def __str__(self):
        return f'ConstructionProjectAssignment({self.project_id}, {self.employee_id})'


class ConstructionProjectWorkLog(models.Model):
    """Recorded labor contribution for one employee on one construction date."""

    QUANTITY_UNIT_CHOICES = (
        ('day', 'Day'),
        ('half_day', 'Half day'),
        ('hour', 'Hour'),
    )

    project = models.ForeignKey(ConstructionProject, on_delete=models.CASCADE, related_name='work_logs')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='project_work_logs')
    work_date = models.DateField()
    quantity_unit = models.CharField(max_length=20, choices=QUANTITY_UNIT_CHOICES)
    quantity_value = models.DecimalField(max_digits=10, decimal_places=2)
    normalized_hours = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    day_equivalent = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    attendance_record_reference = models.ForeignKey(
        AttendanceShift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_work_logs',
    )
    daily_salary_rate_snapshot = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_project_work_logs',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['work_date', 'project_id', 'employee_id', 'id']

    def __str__(self):
        return f'ConstructionProjectWorkLog({self.project_id}, {self.employee_id}, {self.work_date})'


class PayrollRun(models.Model):
    """Payroll execution snapshot for a specific month and run type."""

    RUN_TYPE_CHOICES = (
        ('normal', 'Normal'),
        ('correction', 'Correction'),
    )

    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('review', 'Review'),
        ('approved', 'Approved'),
        ('locked', 'Locked'),
        ('paid', 'Paid'),
    )

    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    run_type = models.CharField(max_length=20, choices=RUN_TYPE_CHOICES, default='normal')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    parent_run = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_runs',
    )
    supersedes_run = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='superseded_by_runs',
    )
    policy_used = models.ForeignKey(PayrollPolicy, on_delete=models.PROTECT, related_name='payroll_runs')
    generated_at = models.DateTimeField(auto_now_add=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_payroll_runs',
    )
    approved_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_payroll_runs',
    )
    authorized_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='authorized_payroll_runs',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', '-created_at']

    def __str__(self):
        return f'PayrollRun({self.year}-{self.month:02d}, {self.run_type}, {self.status})'


class PayrollRunEmployee(models.Model):
    """Employee-level calculation output inside a payroll run."""

    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='employees')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payroll_run_entries')
    monthly_base_wage_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    attendance_bonus_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    late_minutes_total = models.PositiveIntegerField(default=0)
    early_departure_minutes_total = models.PositiveIntegerField(default=0)
    absent_minutes_total = models.PositiveIntegerField(default=0)
    time_bank_minutes_total = models.PositiveIntegerField(default=0)
    opening_time_bank_minutes_total = models.PositiveIntegerField(default=0)
    settled_time_bank_minutes_total = models.PositiveIntegerField(default=0)
    closing_time_bank_minutes_total = models.PositiveIntegerField(default=0)
    paid_rest_minutes_total = models.PositiveIntegerField(default=0)
    approved_leave_minutes_total = models.PositiveIntegerField(default=0)
    unapproved_leave_minutes_total = models.PositiveIntegerField(default=0)
    approved_ot_minutes_total = models.PositiveIntegerField(default=0)
    approved_ot_offset_minutes_total = models.PositiveIntegerField(default=0)
    payable_ot_minutes_total = models.PositiveIntegerField(default=0)
    denied_ot_minutes_total = models.PositiveIntegerField(default=0)
    deductible_minutes_total = models.PositiveIntegerField(default=0)
    deduction_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    overtime_pay_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    project_bonus_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    manual_adjustments_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    carry_forward_recovery_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    gross_before_rounding_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    rounding_adjustment_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    gross_payable_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    previous_run_delta_amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    calc_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee__name', 'employee_id']
        unique_together = ('payroll_run', 'employee')

    def __str__(self):
        return f'PayrollRunEmployee({self.payroll_run_id}, {self.employee_id})'


class PayrollComponent(models.Model):
    """One named component line contributing to an employee payroll result."""

    payroll_run_employee = models.ForeignKey(PayrollRunEmployee, on_delete=models.CASCADE, related_name='components')
    component_type = models.CharField(max_length=50)
    code = models.CharField(max_length=60)
    label = models.CharField(max_length=160)
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    quantity = models.DecimalField(max_digits=16, decimal_places=4, null=True, blank=True)
    rate = models.DecimalField(max_digits=16, decimal_places=4, null=True, blank=True)
    source_reference_type = models.CharField(max_length=80, blank=True)
    source_reference_id = models.PositiveIntegerField(null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['display_order', 'id']

    def __str__(self):
        return f'PayrollComponent({self.payroll_run_employee_id}, {self.code}, {self.amount})'


class ConstructionProjectSettlement(models.Model):
    """Stored result of distributing one construction project's labor pool."""

    project = models.ForeignKey(ConstructionProject, on_delete=models.CASCADE, related_name='settlements')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='project_settlements')
    employee_project_reserved_hours = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employee_project_day_equivalent = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    employee_project_labor_cost_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    total_actual_labor_cost_spend_snapshot = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    weight_ratio = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    bonus_share_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    settled_to_year = models.PositiveIntegerField()
    settled_to_month = models.PositiveSmallIntegerField()
    snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['project_id', 'employee_id']
        unique_together = ('project', 'employee')

    def __str__(self):
        return f'ConstructionProjectSettlement({self.project_id}, {self.employee_id})'


class PayrollMonthlySummary(models.Model):
    """Company-level totals aggregated from a payroll run."""

    payroll_run = models.OneToOneField(PayrollRun, on_delete=models.CASCADE, related_name='monthly_summary')
    headcount_paid = models.PositiveIntegerField(default=0)
    total_monthly_base_wages = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_attendance_bonus_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_deduction_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_approved_overtime_pay_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_project_bonus_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_manual_adjustments_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_carry_forward_recovery_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_gross_before_rounding_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_rounding_adjustment_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_gross_payable_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_late_minutes = models.PositiveIntegerField(default=0)
    total_early_departure_minutes = models.PositiveIntegerField(default=0)
    total_absent_minutes = models.PositiveIntegerField(default=0)
    total_time_bank_minutes = models.PositiveIntegerField(default=0)
    total_leave_minutes = models.PositiveIntegerField(default=0)
    total_paid_rest_minutes = models.PositiveIntegerField(default=0)
    total_approved_ot_minutes = models.PositiveIntegerField(default=0)
    total_approved_ot_offset_minutes = models.PositiveIntegerField(default=0)
    total_payable_ot_minutes = models.PositiveIntegerField(default=0)
    trend_snapshot_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-payroll_run__year', '-payroll_run__month']

    def __str__(self):
        return f'PayrollMonthlySummary({self.payroll_run_id})'


class PayrollReportArtifact(models.Model):
    """Generated report file belonging to a payroll run."""

    REPORT_TYPE_CHOICES = (
        ('employee', 'Employee'),
        ('workforce_management', 'Workforce management'),
    )

    FORMAT_CHOICES = (
        ('pdf', 'PDF'),
        ('jpg', 'JPG'),
    )

    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='report_artifacts')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, null=True, blank=True, related_name='payroll_report_artifacts')
    report_type = models.CharField(max_length=40, choices=REPORT_TYPE_CHOICES)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES)
    file_path = models.CharField(max_length=255)
    snapshot_hash = models.CharField(max_length=64)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-generated_at', 'report_type', 'format']

    def __str__(self):
        return f'PayrollReportArtifact({self.payroll_run_id}, {self.report_type}, {self.format})'


class AttendanceTimeBankEntry(models.Model):
    """Ledger entry that tracks attendance minutes carried as time-bank debt or settlement."""

    ENTRY_TYPE_EARLY_DEPARTURE_DEBT = 'early_departure_debt'
    ENTRY_TYPE_OT_SETTLEMENT = 'ot_settlement'
    ENTRY_TYPE_CHOICES = (
        (ENTRY_TYPE_EARLY_DEPARTURE_DEBT, 'Early departure debt'),
        (ENTRY_TYPE_OT_SETTLEMENT, 'Approved OT settlement'),
    )
    SHIFT_CHOICES = (
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance_time_bank_entries')
    entry_type = models.CharField(max_length=40, choices=ENTRY_TYPE_CHOICES)
    entry_date = models.DateField()
    attendance_shift = models.CharField(max_length=20, choices=SHIFT_CHOICES, blank=True)
    minutes_delta = models.IntegerField(default=0)
    payroll_run = models.ForeignKey(
        'PayrollRun',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='time_bank_entries',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['entry_date', 'employee_id', 'id']

    def __str__(self):
        return f'AttendanceTimeBankEntry({self.employee_id}, {self.entry_type}, {self.entry_date}, {self.minutes_delta})'


class PayrollCorrectionDelta(models.Model):
    """Difference record between a correction payroll run and the run it fixes."""

    DELTA_DIRECTION_CHOICES = (
        ('employer_owes_employee', 'Employer owes employee'),
        ('employee_owes_employer', 'Employee owes employer'),
        ('no_change', 'No change'),
    )

    SETTLEMENT_STRATEGY_CHOICES = (
        ('pay_now', 'Pay now'),
        ('carry_forward_recovery', 'Carry-forward recovery'),
        ('none', 'None'),
    )

    current_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='correction_deltas')
    previous_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='previous_correction_deltas')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payroll_correction_deltas')
    previous_gross_payable_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    corrected_gross_payable_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    delta_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    delta_direction = models.CharField(max_length=40, choices=DELTA_DIRECTION_CHOICES, default='no_change')
    settlement_strategy = models.CharField(max_length=40, choices=SETTLEMENT_STRATEGY_CHOICES, default='none')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee__name', 'employee_id']
        unique_together = ('current_run', 'employee')

    def __str__(self):
        return f'PayrollCorrectionDelta({self.current_run_id}, {self.employee_id}, {self.delta_amount})'


class EmployeePayrollCarryForwardBalance(models.Model):
    """Outstanding recovery amount carried into later payroll runs."""

    DIRECTION_CHOICES = (
        ('recovery_from_employee', 'Recovery from employee'),
    )

    STATUS_CHOICES = (
        ('open', 'Open'),
        ('partially_applied', 'Partially applied'),
        ('closed', 'Closed'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='carry_forward_balances')
    origin_correction_delta = models.ForeignKey(
        PayrollCorrectionDelta,
        on_delete=models.CASCADE,
        related_name='carry_forward_balances',
    )
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    direction = models.CharField(max_length=40, choices=DIRECTION_CHOICES, default='recovery_from_employee')
    apply_from_year = models.PositiveIntegerField()
    apply_from_month = models.PositiveSmallIntegerField()
    remaining_amount = models.DecimalField(max_digits=16, decimal_places=2)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['apply_from_year', 'apply_from_month', 'employee_id']

    def __str__(self):
        return f'EmployeePayrollCarryForwardBalance({self.employee_id}, {self.remaining_amount})'

class InventoryItem(models.Model):
    """Stock record for non-planner inventory tracked in the ERP."""

    item_code = models.CharField(max_length=50, blank=True)
    name = models.CharField(max_length=100)
    image_url = models.URLField(blank=True)
    image = models.ImageField(upload_to='inventory/', blank=True, null=True)
    quantity = models.IntegerField()
    least_inventory_amount = models.IntegerField(default=0)
    unit = models.CharField(max_length=20, blank=True)
    last_updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        """Delete replaced images and optimize the uploaded image after saving."""

        if self.pk:
            try:
                old = InventoryItem.objects.get(pk=self.pk)
                if old.image and old.image != self.image:
                    if os.path.isfile(old.image.path):
                        os.remove(old.image.path)
            except InventoryItem.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        if self.image and self.image.path:
            try:
                img = Image.open(self.image.path)
                img = ImageOps.exif_transpose(img)
                img.thumbnail((300, 300), Image.LANCZOS)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.save(self.image.path, optimize=True, quality=85)
            except Exception:
                pass

    def delete(self, *args, **kwargs):
        """Remove the stored image file when the inventory item is deleted."""

        if self.image and self.image.path and os.path.isfile(self.image.path):
            os.remove(self.image.path)
        super().delete(*args, **kwargs)

class Category(models.Model):
    """Hierarchical storefront category used for product browsing."""

    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=250, unique=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    display_order = models.IntegerField(default=0)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """Ensure a unique slug and optimize uploaded category images."""

        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Category.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{str(uuid.uuid4())[:6]}"
                counter += 1
            self.slug = slug

        # If replacing an existing image, remove the old file
        if self.pk:
            try:
                old = Category.objects.get(pk=self.pk)
                if old.image and old.image != self.image:
                    if os.path.isfile(old.image.path):
                        os.remove(old.image.path)
            except Category.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        # Resize and optimize uploaded image to 300x300 to match inventory behavior
        if self.image and getattr(self.image, 'path', None):
            try:
                img = Image.open(self.image.path)
                img = ImageOps.exif_transpose(img)
                img.thumbnail((300, 300), Image.LANCZOS)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.save(self.image.path, optimize=True, quality=85)
            except Exception:
                pass

    def get_breadcrumb(self):
        """Return the category path from the tree root down to this node."""
        breadcrumb = []
        current = self
        while current:
            breadcrumb.insert(0, {'id': current.id, 'name': current.name, 'slug': current.slug})
            current = current.parent
        return breadcrumb

    def get_all_descendants(self):
        """Return all nested child categories below this category."""
        descendants = []
        for child in self.children.all():
            descendants.append(child)
            descendants.extend(child.get_all_descendants())
        return descendants

    def get_level(self):
        """Return this category's depth within the category tree."""
        level = 1
        current = self.parent
        while current:
            level += 1
            current = current.parent
        return level

    def delete(self, *args, **kwargs):
        """Delete the stored image file when the category is removed."""

        if self.image and getattr(self.image, 'path', None) and os.path.isfile(self.image.path):
            os.remove(self.image.path)
        super().delete(*args, **kwargs)


class Product(models.Model):
    """Sellable catalog product used by the storefront and planner integrations."""

    product_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    price = models.FloatField()
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    slug = models.SlugField(max_length=250, unique=True, blank=True)
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    colour = models.CharField(max_length=50, blank=True)
    material = models.CharField(max_length=100, blank=True)
    is_best_seller = models.BooleanField(default=False)
    is_new = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.product_id})"

    def save(self, *args, **kwargs):
        """Generate a default slug from name and product code before saving."""

        if not self.slug:
            self.slug = f"{slugify(self.name)}-{self.product_id}"
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Remove the stored product image file when the product is deleted."""

        if self.image and self.image.path and os.path.isfile(self.image.path):
            os.remove(self.image.path)
        super().delete(*args, **kwargs)


class CustomerProfile(models.Model):
    """Optional customer-specific details linked to an authenticated user."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='customer_profile')
    phone = models.CharField(max_length=40, blank=True)
    loyalty_id = models.CharField(max_length=80, blank=True)
    default_shipping_address = models.TextField(blank=True)

    def __str__(self):
        return f"CustomerProfile({self.user.username})"


class Purchase(models.Model):
    """Simple purchase history record used for review verification and order history."""

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('refunded', 'Refunded'),
        ('cancelled', 'Cancelled'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='purchases')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='purchases')
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    purchased_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} -> {self.product.name} ({self.status})"


class Review(models.Model):
    """Customer product review with optional verified-purchase flag."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews')
    rating = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_purchase = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Review({self.product.name}, {self.user.username}, {self.rating})"


class Workplace(models.Model):
    """Allowed physical work location used by face verification distance checks."""

    name = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    radius_meters = models.FloatField(default=150)

    def __str__(self):
        return self.name


class EmployeeFaceProfile(models.Model):
    """Stored reference face image used for employee face verification."""

    employee = models.OneToOneField(Employee, on_delete=models.CASCADE)
    face_image = models.ImageField(upload_to='face_profiles/')
    enrolled_at = models.DateTimeField(auto_now_add=True)
