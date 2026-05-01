"""
Django Serializers.py - Purpose and Relationship

Theoretical Understanding
The serializers.py file serves as a translator between Django models and JSON/XML formats in a REST API. 
It handles data validation, conversion, and formatting for both incoming requests and outgoing responses.

Relationship with Other Components
1. Models (models.py)
- Serializers convert model instances to/from JSON/XML
- Define which model fields should be exposed in the API

class Meta:
    model = Employee
    fields = '__all__'

2. Views (views.py)
- Views use serializers to process incoming data and format responses
- Handles data validation before saving to database

serializer_class = EmployeeSerializer

3. API Response/Request Cycle
- Converts incoming JSON to model instances
- Transforms model instances to JSON for responses
- Handles validation and error reporting

Current Implementation
1. Model Serializers
- EmployeeSerializer: Exposes all Employee model fields
- InventoryItemSerializer: Handles inventory data serialization
- ProductSerializer: Manages product catalog data
- UserSerializer: Limited user field exposure for security
- RegisterSerializer: Special handling for user registration with password protection

Serializer layer for the ``core`` application.

This module turns model objects into API payloads and validates inbound JSON
before views persist anything. It also carries a fair amount of business-rule
validation, especially for rosters, overtime, leave, paid rest, compensation,
and payroll policy management.
"""

from decimal import Decimal
from datetime import date, timedelta

from django.utils import timezone
from rest_framework import serializers
from .models import (
    AttendanceMonthlySummary,
    AttendanceOvertimeDecision,
    AttendanceOvertimeDecisionSegment,
    AttendanceTimeBankEntry,
    Category,
    ConstructionProject,
    ConstructionProjectAssignment,
    ConstructionProjectSettlement,
    ConstructionProjectWorkLog,
    CustomerProfile,
    Department,
    Employee,
    EmployeeAttendanceWorkRuleProfile,
    EmployeeCompensationProfile,
    EmployeeFaceProfile,
    EmployeeLeaveRecord,
    EmployeePayrollAdjustment,
    EmployeePayrollCarryForwardBalance,
    EmployeePaidRestMonthlyBalance,
    EmployeePaidRestRequest,
    InventoryItem,
    PayrollComponent,
    PayrollCorrectionDelta,
    PayrollMonthlySummary,
    PayrollPolicy,
    PayrollReportArtifact,
    PayrollRun,
    PayrollRunEmployee,
    Product,
    Purchase,
    Review,
    RosterTemplate,
    User,
    Workplace,
)
from .utils import normalize_clock_time, normalize_employee_name, normalize_worker_id, summarize_roster_schedule, validate_roster_schedule


def _serialize_roster_assignment(assignment):
    """Return a frontend-friendly snapshot of an employee roster assignment."""

    template = assignment.template
    if template is None:
        return {
            'template_id': None,
            'template_name': None,
            'cycle_length_weeks': None,
            'effective_start_date': assignment.effective_start_date.isoformat() if assignment.effective_start_date else None,
            'summary_lines': [],
        }

    return {
        'template_id': template.id,
        'template_name': template.name,
        'cycle_length_weeks': template.cycle_length_weeks,
        'effective_start_date': assignment.effective_start_date.isoformat() if assignment.effective_start_date else None,
        'summary_lines': summarize_roster_schedule(template.schedule, template.cycle_length_weeks),
    }


def _clock_to_minutes(value):
    """Convert an ``HH:MM`` time string into minutes since midnight."""

    normalized = normalize_clock_time(value)
    if not normalized:
        return None

    hour_text, minute_text = normalized.split(':')
    return int(hour_text) * 60 + int(minute_text)


def _minutes_between(start_time, end_time):
    """Return elapsed minutes between two validated clock times."""

    start_minutes = _clock_to_minutes(start_time)
    end_minutes = _clock_to_minutes(end_time)
    if start_minutes is None or end_minutes is None:
        raise serializers.ValidationError('Start and end times must use HH:MM format.')
    if end_minutes <= start_minutes:
        raise serializers.ValidationError('End time must be later than start time.')
    return end_minutes - start_minutes


class RosterTemplateSerializer(serializers.ModelSerializer):
    """Validate and serialize repeating roster templates."""

    usage_count = serializers.SerializerMethodField()
    summary_lines = serializers.SerializerMethodField()

    class Meta:
        model = RosterTemplate
        fields = [
            'id',
            'name',
            'description',
            'cycle_length_weeks',
            'schedule',
            'is_active',
            'usage_count',
            'summary_lines',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'usage_count', 'summary_lines', 'created_at', 'updated_at']

    def validate_cycle_length_weeks(self, value):
        """Restrict roster templates to the supported 1-4 week cycle length."""

        if value < 1 or value > 4:
            raise serializers.ValidationError('Cycle length must be between 1 and 4 weeks.')
        return value

    def validate(self, attrs):
        """Normalize the schedule into a fully validated week/day matrix."""

        cycle_length_weeks = attrs.get(
            'cycle_length_weeks',
            self.instance.cycle_length_weeks if self.instance else 1,
        )
        raw_schedule = attrs.get('schedule', self.instance.schedule if self.instance else [])

        try:
            attrs['schedule'] = validate_roster_schedule(raw_schedule, cycle_length_weeks)
        except ValueError as exc:
            raise serializers.ValidationError({'schedule': str(exc)})

        return attrs

    def get_usage_count(self, obj):
        """Expose how many employee assignments currently use this template."""

        annotated_usage_count = getattr(obj, 'usage_count', None)
        if annotated_usage_count is not None:
            return annotated_usage_count
        return obj.assignments.count()

    def get_summary_lines(self, obj):
        """Return human-readable weekly summaries for UI display."""

        return summarize_roster_schedule(obj.schedule, obj.cycle_length_weeks)


class DepartmentSerializer(serializers.ModelSerializer):
    """Serialize department settings, especially paid-rest configuration."""

    class Meta:
        model = Department
        fields = [
            'id',
            'name',
            'code',
            'description',
            'is_active',
            'shop_paid_rest_enabled',
            'paid_rest_days_granted_per_month',
            'paid_rest_carry_forward_cap_days',
            'minimum_staff_required_per_shift',
            'allow_half_day_paid_rest',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        """Enforce required names and sane paid-rest configuration values."""

        attrs = super().validate(attrs)
        name = str(attrs.get('name', getattr(self.instance, 'name', '')) or '').strip()
        if not name:
            raise serializers.ValidationError({'name': 'Department name is required.'})

        code = str(attrs.get('code', getattr(self.instance, 'code', '')) or '').strip() or None
        description = str(attrs.get('description', getattr(self.instance, 'description', '')) or '').strip()
        granted_days = attrs.get(
            'paid_rest_days_granted_per_month',
            getattr(self.instance, 'paid_rest_days_granted_per_month', Decimal('0')),
        )
        carry_forward_cap_days = attrs.get(
            'paid_rest_carry_forward_cap_days',
            getattr(self.instance, 'paid_rest_carry_forward_cap_days', Decimal('0')),
        )
        minimum_staff = attrs.get(
            'minimum_staff_required_per_shift',
            getattr(self.instance, 'minimum_staff_required_per_shift', 1),
        )

        if granted_days is not None and granted_days < 0:
            raise serializers.ValidationError({'paid_rest_days_granted_per_month': 'Granted paid-rest days cannot be negative.'})
        if carry_forward_cap_days is not None and carry_forward_cap_days < 0:
            raise serializers.ValidationError({'paid_rest_carry_forward_cap_days': 'Carry-forward cap cannot be negative.'})
        if minimum_staff < 1:
            raise serializers.ValidationError({'minimum_staff_required_per_shift': 'Minimum staff per shift must be at least 1.'})

        attrs['name'] = name
        attrs['code'] = code
        attrs['description'] = description
        return attrs

class EmployeeSerializer(serializers.ModelSerializer):
    """Serialize employee directory records plus derived payroll/roster context."""

    base_salary = serializers.SerializerMethodField()
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)
    department_shop_paid_rest_enabled = serializers.BooleanField(source='department.shop_paid_rest_enabled', read_only=True)
    roster_assignment = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            'id',
            'name',
            'base_salary',
            'worker_id',
            'department',
            'department_name',
            'department_code',
            'department_shop_paid_rest_enabled',
            'is_active',
            'roster_assignment',
        ]
        read_only_fields = [
            'id',
            'base_salary',
            'department_name',
            'department_code',
            'department_shop_paid_rest_enabled',
            'roster_assignment',
        ]
        validators = []

    def validate(self, attrs):
        """Enforce required identity fields and composite identity uniqueness."""

        attrs = super().validate(attrs)

        name = str(attrs.get('name', getattr(self.instance, 'name', '')) or '').strip()
        if not name:
            raise serializers.ValidationError({'name': 'Employee name is required.'})
        attrs['name'] = name
        normalized_name = normalize_employee_name(name)

        worker_id = normalize_worker_id(attrs.get('worker_id', getattr(self.instance, 'worker_id', None))) or None
        attrs['worker_id'] = worker_id

        if worker_id is None:
            raise serializers.ValidationError({'worker_id': 'Worker ID is required.'})

        existing = Employee.objects.filter(worker_id=worker_id)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)

        if any(normalize_employee_name(employee.name) == normalized_name for employee in existing.only('name')):
            raise serializers.ValidationError({
                'worker_id': 'Another employee already uses this Worker ID + Employee Name combination.',
            })

        return attrs

    def get_base_salary(self, obj):
        """Expose the currently active monthly salary from the compensation ledger."""

        profile = obj.active_compensation_profile(timezone.localdate())
        if profile is None:
            return None
        return float(profile.monthly_salary)

    def get_roster_assignment(self, obj):
        """Expose the employee's active roster assignment in summarized form."""

        try:
            assignment = obj.roster_assignment
        except obj.__class__.roster_assignment.RelatedObjectDoesNotExist:
            return None

        return _serialize_roster_assignment(assignment)


class AttendanceOvertimeDecisionSegmentSerializer(serializers.ModelSerializer):
    """Serialize a partial approved/denied slice of one overtime decision."""

    class Meta:
        model = AttendanceOvertimeDecisionSegment
        fields = ['id', 'segment_start_time', 'segment_end_time', 'segment_minutes', 'status', 'note']
        read_only_fields = ['id', 'segment_minutes']

    def validate(self, attrs):
        """Normalize segment times and calculate the segment duration in minutes."""

        attrs = super().validate(attrs)

        start_time = normalize_clock_time(attrs.get('segment_start_time', getattr(self.instance, 'segment_start_time', '')))
        end_time = normalize_clock_time(attrs.get('segment_end_time', getattr(self.instance, 'segment_end_time', '')))
        if not start_time or not end_time:
            raise serializers.ValidationError('Each overtime segment needs a valid start and end time.')

        attrs['segment_start_time'] = start_time
        attrs['segment_end_time'] = end_time
        attrs['segment_minutes'] = _minutes_between(start_time, end_time)
        return attrs


class AttendanceOvertimeDecisionSerializer(serializers.ModelSerializer):
    """Serialize overtime decisions together with optional segmented approvals."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    resolved_by_username = serializers.CharField(source='resolved_by.username', read_only=True)
    segments = AttendanceOvertimeDecisionSegmentSerializer(many=True, required=False)

    class Meta:
        model = AttendanceOvertimeDecision
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'attendance_date',
            'attendance_shift',
            'roster_start_time',
            'roster_end_time',
            'actual_checkout_time',
            'potential_ot_minutes',
            'approved_ot_minutes',
            'denied_ot_minutes',
            'status',
            'decision_reason',
            'narrowed_decision_enabled',
            'resolved_by',
            'resolved_by_username',
            'resolved_at',
            'segments',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'employee_name',
            'worker_id',
            'resolved_by',
            'resolved_by_username',
            'resolved_at',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        """Normalize clock fields and enforce a consistent overtime outcome."""

        attrs = super().validate(attrs)

        roster_start_time = normalize_clock_time(attrs.get('roster_start_time', getattr(self.instance, 'roster_start_time', '')))
        roster_end_time = normalize_clock_time(attrs.get('roster_end_time', getattr(self.instance, 'roster_end_time', '')))
        actual_checkout_time = normalize_clock_time(attrs.get('actual_checkout_time', getattr(self.instance, 'actual_checkout_time', '')))
        attrs['roster_start_time'] = roster_start_time
        attrs['roster_end_time'] = roster_end_time
        attrs['actual_checkout_time'] = actual_checkout_time

        potential_ot_minutes = attrs.get('potential_ot_minutes', getattr(self.instance, 'potential_ot_minutes', 0)) or 0
        if roster_end_time and actual_checkout_time:
            potential_ot_minutes = max(_minutes_between(roster_end_time, actual_checkout_time), 0) if _clock_to_minutes(actual_checkout_time) > _clock_to_minutes(roster_end_time) else 0
        potential_ot_minutes = int(potential_ot_minutes)
        attrs['potential_ot_minutes'] = max(0, potential_ot_minutes)

        segments = attrs.get('segments', None)
        status = attrs.get('status', getattr(self.instance, 'status', 'pending'))
        approved_ot_minutes = int(attrs.get('approved_ot_minutes', getattr(self.instance, 'approved_ot_minutes', 0)) or 0)
        denied_ot_minutes = int(attrs.get('denied_ot_minutes', getattr(self.instance, 'denied_ot_minutes', 0)) or 0)

        if segments is not None:
            approved_ot_minutes = sum(segment['segment_minutes'] for segment in segments if segment['status'] == 'approved')
            denied_ot_minutes = sum(segment['segment_minutes'] for segment in segments if segment['status'] == 'denied')

        if status == 'approved':
            approved_ot_minutes = potential_ot_minutes
            denied_ot_minutes = 0
        elif status == 'denied':
            approved_ot_minutes = 0
            denied_ot_minutes = potential_ot_minutes
        elif status == 'pending':
            approved_ot_minutes = 0
            denied_ot_minutes = 0
        elif status == 'partially_approved' and (approved_ot_minutes <= 0 or denied_ot_minutes <= 0):
            raise serializers.ValidationError('Partially approved overtime needs both approved and denied minutes.')

        if approved_ot_minutes < 0 or denied_ot_minutes < 0:
            raise serializers.ValidationError('Overtime minutes cannot be negative.')

        if status != 'pending' and approved_ot_minutes + denied_ot_minutes != potential_ot_minutes:
            raise serializers.ValidationError('Resolved overtime must cover the full potential overtime block.')

        decision_reason = str(attrs.get('decision_reason', getattr(self.instance, 'decision_reason', '')) or '').strip()
        if status in ('denied', 'partially_approved') and not decision_reason:
            raise serializers.ValidationError({'decision_reason': 'Provide a reason when any overtime is denied.'})

        attrs['approved_ot_minutes'] = approved_ot_minutes
        attrs['denied_ot_minutes'] = denied_ot_minutes
        attrs['decision_reason'] = decision_reason
        attrs['narrowed_decision_enabled'] = bool(attrs.get('narrowed_decision_enabled', getattr(self.instance, 'narrowed_decision_enabled', False)) or segments)
        return attrs

    def create(self, validated_data):
        """Create the overtime decision and its child segment rows."""

        segments = validated_data.pop('segments', [])
        instance = super().create(validated_data)
        self._replace_segments(instance, segments)
        return instance

    def update(self, instance, validated_data):
        """Update the decision and replace child segments when provided."""

        segments = validated_data.pop('segments', None)
        instance = super().update(instance, validated_data)
        if segments is not None:
            self._replace_segments(instance, segments)
        return instance

    def _replace_segments(self, instance, segments):
        """Replace all persisted decision segments with the validated payload."""

        instance.segments.all().delete()
        for segment in segments:
            AttendanceOvertimeDecisionSegment.objects.create(overtime_decision=instance, **segment)


class EmployeeLeaveRecordSerializer(serializers.ModelSerializer):
    """Serialize leave requests and compute their normalized duration fields."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    submitted_by_username = serializers.CharField(source='submitted_by.username', read_only=True)
    decision_by_username = serializers.CharField(source='decision_by.username', read_only=True)

    class Meta:
        model = EmployeeLeaveRecord
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'leave_date',
            'leave_start_time',
            'leave_end_time',
            'submission_status',
            'duration_unit',
            'duration_value',
            'leave_minutes',
            'employee_reason',
            'manager_note',
            'submitted_by',
            'submitted_by_username',
            'submitted_at',
            'decision_by',
            'decision_by_username',
            'decision_at',
            'linked_attendance_shift',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'employee_name',
            'worker_id',
            'leave_minutes',
            'submitted_by',
            'submitted_by_username',
            'submitted_at',
            'decision_by',
            'decision_by_username',
            'decision_at',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        """Normalize leave timing and derive minutes from the chosen duration mode."""

        attrs = super().validate(attrs)

        leave_start_time = normalize_clock_time(attrs.get('leave_start_time', getattr(self.instance, 'leave_start_time', '')))
        leave_end_time = normalize_clock_time(attrs.get('leave_end_time', getattr(self.instance, 'leave_end_time', '')))
        if (leave_start_time and not leave_end_time) or (leave_end_time and not leave_start_time):
            raise serializers.ValidationError('Provide both leave_start_time and leave_end_time together.')

        attrs['leave_start_time'] = leave_start_time
        attrs['leave_end_time'] = leave_end_time

        duration_unit = attrs.get('duration_unit', getattr(self.instance, 'duration_unit', 'full_day'))
        linked_attendance_shift = attrs.get(
            'linked_attendance_shift',
            getattr(self.instance, 'linked_attendance_shift', ''),
        ) or ''
        duration_value = float(attrs.get('duration_value', getattr(self.instance, 'duration_value', 0)) or 0)

        if duration_unit == 'full_day':
            leave_minutes = 8 * 60
            duration_value = 1
            linked_attendance_shift = ''
        elif duration_unit == 'half_day':
            if linked_attendance_shift not in ('morning', 'afternoon'):
                raise serializers.ValidationError({'linked_attendance_shift': 'Half-day leave must target morning or afternoon.'})
            leave_minutes = 4 * 60
            duration_value = 0.5
        elif duration_unit == 'hour':
            if leave_start_time and leave_end_time:
                leave_minutes = _minutes_between(leave_start_time, leave_end_time)
                duration_value = leave_minutes / 60
            else:
                if duration_value <= 0:
                    raise serializers.ValidationError({'duration_value': 'Hour-based leave needs a positive duration.'})
                leave_minutes = int(round(duration_value * 60))
        elif duration_unit == 'custom_minutes':
            if leave_start_time and leave_end_time:
                leave_minutes = _minutes_between(leave_start_time, leave_end_time)
                duration_value = leave_minutes
            else:
                leave_minutes = int(round(duration_value))
                if leave_minutes <= 0:
                    raise serializers.ValidationError({'duration_value': 'Custom-minute leave needs a positive duration.'})
                duration_value = leave_minutes
        else:
            raise serializers.ValidationError({'duration_unit': 'Unsupported leave duration.'})

        attrs['linked_attendance_shift'] = linked_attendance_shift
        attrs['duration_value'] = duration_value
        attrs['leave_minutes'] = leave_minutes
        attrs['employee_reason'] = str(attrs.get('employee_reason', getattr(self.instance, 'employee_reason', '')) or '').strip()
        attrs['manager_note'] = str(attrs.get('manager_note', getattr(self.instance, 'manager_note', '')) or '').strip()
        return attrs


class EmployeePaidRestRequestSerializer(serializers.ModelSerializer):
    """Serialize department-governed paid-rest requests."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    submitted_by_username = serializers.CharField(source='submitted_by.username', read_only=True)
    decision_by_username = serializers.CharField(source='decision_by.username', read_only=True)

    class Meta:
        model = EmployeePaidRestRequest
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'department',
            'department_name',
            'rest_date',
            'duration_unit',
            'linked_attendance_shift',
            'paid_rest_days',
            'submission_status',
            'employee_reason',
            'manager_note',
            'submitted_by',
            'submitted_by_username',
            'submitted_at',
            'decision_by',
            'decision_by_username',
            'decision_at',
            'coverage_snapshot_json',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'employee_name',
            'worker_id',
            'department',
            'department_name',
            'paid_rest_days',
            'submitted_by',
            'submitted_by_username',
            'submitted_at',
            'decision_by',
            'decision_by_username',
            'decision_at',
            'coverage_snapshot_json',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        """Attach department context and derive paid-rest day quantities."""

        attrs = super().validate(attrs)

        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        if employee is None:
            raise serializers.ValidationError({'employee': 'Employee is required.'})
        if not employee.is_active:
            raise serializers.ValidationError({'employee': 'Paid rest can only be requested for active employees.'})

        duration_unit = attrs.get('duration_unit', getattr(self.instance, 'duration_unit', 'full_day'))
        linked_attendance_shift = attrs.get(
            'linked_attendance_shift',
            getattr(self.instance, 'linked_attendance_shift', ''),
        ) or ''
        department = employee.department

        if duration_unit == 'full_day':
            linked_attendance_shift = ''
            paid_rest_days = Decimal('1.00')
        elif duration_unit == 'half_day':
            if linked_attendance_shift not in ('morning', 'afternoon'):
                raise serializers.ValidationError({'linked_attendance_shift': 'Half-day paid rest must target morning or afternoon.'})
            if department is not None and not department.allow_half_day_paid_rest:
                raise serializers.ValidationError({'duration_unit': 'This department does not allow half-day paid rest.'})
            paid_rest_days = Decimal('0.50')
        else:
            raise serializers.ValidationError({'duration_unit': 'Unsupported paid-rest duration.'})

        attrs['department'] = department
        attrs['linked_attendance_shift'] = linked_attendance_shift
        attrs['paid_rest_days'] = paid_rest_days
        attrs['employee_reason'] = str(attrs.get('employee_reason', getattr(self.instance, 'employee_reason', '')) or '').strip()
        attrs['manager_note'] = str(attrs.get('manager_note', getattr(self.instance, 'manager_note', '')) or '').strip()
        return attrs


class EmployeePaidRestMonthlyBalanceSerializer(serializers.ModelSerializer):
    """Read-only serializer for monthly paid-rest balance snapshots."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = EmployeePaidRestMonthlyBalance
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'department',
            'department_name',
            'year',
            'month',
            'opening_balance_days',
            'granted_days',
            'used_days',
            'closing_balance_days',
            'carry_forward_cap_days',
            'calc_snapshot',
            'generated_at',
            'updated_at',
        ]
        read_only_fields = fields


class PayrollPolicySerializer(serializers.ModelSerializer):
    """Serialize versioned payroll policy definitions."""

    cloned_from_policy_code = serializers.CharField(source='cloned_from_policy.policy_code', read_only=True)

    class Meta:
        model = PayrollPolicy
        fields = [
            'id',
            'policy_code',
            'name',
            'version_number',
            'effective_from',
            'effective_to',
            'rice_allowance_amount',
            'social_security_allowance_amount',
            'full_attendance_bonus_amount',
            'labor_pool_percent',
            'normal_work_hours_per_day',
            'salary_days_per_month',
            'overtime_multiplier',
            'overtime_grace_minutes',
            'late_grace_minutes',
            'rounding_unit_amount',
            'rounding_rule',
            'unapproved_absence_incident_threshold',
            'status',
            'currency',
            'is_active',
            'cloned_from_policy',
            'cloned_from_policy_code',
            'archived_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'archived_at', 'created_at', 'updated_at', 'cloned_from_policy_code']

    def validate(self, attrs):
        """Enforce valid date windows and policy percentage/range values."""

        attrs = super().validate(attrs)
        effective_from = attrs.get('effective_from', getattr(self.instance, 'effective_from', None))
        effective_to = attrs.get('effective_to', getattr(self.instance, 'effective_to', None))
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({'effective_to': 'Effective to date must be on or after effective from date.'})

        labor_pool_percent = attrs.get('labor_pool_percent', getattr(self.instance, 'labor_pool_percent', 0))
        if labor_pool_percent is not None and (labor_pool_percent < 0 or labor_pool_percent > 1):
            raise serializers.ValidationError({'labor_pool_percent': 'Labor pool percent must be between 0 and 1.'})

        overtime_grace_minutes = attrs.get(
            'overtime_grace_minutes',
            getattr(self.instance, 'overtime_grace_minutes', 0),
        )
        if overtime_grace_minutes is not None and overtime_grace_minutes < 0:
            raise serializers.ValidationError({'overtime_grace_minutes': 'OT grace minutes cannot be negative.'})
        return attrs


class EmployeeCompensationProfileSerializer(serializers.ModelSerializer):
    """Serialize one effective-dated compensation ledger entry."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    payroll_policy_name = serializers.CharField(source='payroll_policy.name', read_only=True)

    class Meta:
        model = EmployeeCompensationProfile
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'monthly_salary',
            'rice_allowance_amount',
            'social_security_allowance_amount',
            'eligible_for_social_security',
            'payroll_policy',
            'payroll_policy_name',
            'effective_from',
            'effective_to',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'employee_name', 'worker_id', 'payroll_policy_name', 'created_at', 'updated_at']

    def validate(self, attrs):
        """Prevent salary history overlaps and enforce gap-free replacement rules."""

        attrs = super().validate(attrs)
        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        monthly_salary = attrs.get('monthly_salary', getattr(self.instance, 'monthly_salary', None))
        effective_from = attrs.get('effective_from', getattr(self.instance, 'effective_from', None))
        effective_to = attrs.get('effective_to', getattr(self.instance, 'effective_to', None))

        if employee is None:
            raise serializers.ValidationError({'employee': 'Employee is required.'})
        if monthly_salary is None or monthly_salary <= 0:
            raise serializers.ValidationError({'monthly_salary': 'Monthly salary must be greater than 0.'})
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({'effective_to': 'Effective to date must be on or after effective from date.'})

        sibling_profiles = EmployeeCompensationProfile.objects.filter(employee=employee)
        if self.instance is not None:
            sibling_profiles = sibling_profiles.exclude(pk=self.instance.pk)

        candidate_end = effective_to or date.max
        for sibling in sibling_profiles:
            sibling_end = sibling.effective_to or date.max
            if sibling.effective_from <= candidate_end and effective_from <= sibling_end:
                raise serializers.ValidationError({
                    'effective_from': 'Compensation profiles for the same employee cannot overlap. End the current profile before starting another one.',
                })

        previous_profile = sibling_profiles.filter(effective_from__lt=effective_from).order_by('-effective_from', '-id').first()
        next_profile = sibling_profiles.filter(effective_from__gt=effective_from).order_by('effective_from', 'id').first()

        if previous_profile is not None:
            if previous_profile.effective_to is None:
                raise serializers.ValidationError({
                    'effective_from': 'End the earlier compensation profile before creating a replacement.',
                })

            expected_start = previous_profile.effective_to + timedelta(days=1)
            if effective_from != expected_start:
                raise serializers.ValidationError({
                    'effective_from': f'Compensation history must continue on {expected_start.isoformat()} without a gap.',
                })

        if next_profile is not None:
            expected_end = next_profile.effective_from - timedelta(days=1)
            if effective_to is None:
                raise serializers.ValidationError({
                    'effective_to': f'Set an end date of {expected_end.isoformat()} before the next compensation profile begins.',
                })
            if effective_to != expected_end:
                raise serializers.ValidationError({
                    'effective_to': f'Compensation history must end on {expected_end.isoformat()} so the next profile starts without a gap.',
                })

        return attrs


class EmployeeAttendanceWorkRuleProfileSerializer(serializers.ModelSerializer):
    """Serialize effective-dated attendance rule assignments."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = EmployeeAttendanceWorkRuleProfile
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'work_rule',
            'effective_from',
            'effective_to',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'employee_name', 'worker_id', 'created_at', 'updated_at']

    def validate(self, attrs):
        """Prevent overlapping attendance work-rule profiles for one employee."""

        attrs = super().validate(attrs)
        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        effective_from = attrs.get('effective_from', getattr(self.instance, 'effective_from', None))
        effective_to = attrs.get('effective_to', getattr(self.instance, 'effective_to', None))

        if employee is None:
            raise serializers.ValidationError({'employee': 'Employee is required.'})
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({'effective_to': 'Effective to date must be on or after effective from date.'})

        sibling_profiles = EmployeeAttendanceWorkRuleProfile.objects.filter(employee=employee)
        if self.instance is not None:
            sibling_profiles = sibling_profiles.exclude(pk=self.instance.pk)

        candidate_end = effective_to or date.max
        for sibling in sibling_profiles:
            sibling_end = sibling.effective_to or date.max
            if sibling.effective_from <= candidate_end and effective_from <= sibling_end:
                raise serializers.ValidationError({
                    'effective_from': 'Attendance work-rule profiles for the same employee cannot overlap.',
                })

        return attrs


class AttendanceTimeBankEntrySerializer(serializers.ModelSerializer):
    """Read-only serializer for attendance time-bank ledger entries."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = AttendanceTimeBankEntry
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'entry_type',
            'entry_date',
            'attendance_shift',
            'minutes_delta',
            'payroll_run',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class AttendanceMonthlySummarySerializer(serializers.ModelSerializer):
    """Read-only serializer for monthly attendance summary totals."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = AttendanceMonthlySummary
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'year',
            'month',
            'scheduled_work_days',
            'actual_present_days',
            'scheduled_minutes_total',
            'worked_minutes_total',
            'late_minutes_total',
            'early_departure_minutes_total',
            'absent_minutes_total',
            'time_bank_minutes_total',
            'paid_rest_minutes_total',
            'approved_leave_minutes_total',
            'unapproved_leave_minutes_total',
            'potential_ot_minutes_total',
            'approved_ot_minutes_total',
            'denied_ot_minutes_total',
            'full_attendance_eligible',
            'disciplinary_flags_json',
            'generated_at',
        ]
        read_only_fields = fields


class EmployeePayrollAdjustmentSerializer(serializers.ModelSerializer):
    """Serialize manual payroll adjustments such as tips, advances, and deductions."""

    POSITIVE_AMOUNT_TYPES = {'tips', 'gardening', 'dog_feeding', 'manual_bonus'}
    NEGATIVE_AMOUNT_TYPES = {'advance', 'manual_deduction'}

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True)

    class Meta:
        model = EmployeePayrollAdjustment
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'year',
            'month',
            'adjustment_type',
            'amount',
            'approval_status',
            'notes',
            'created_by',
            'created_by_username',
            'approved_by',
            'approved_by_username',
            'approved_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'employee_name',
            'worker_id',
            'created_by',
            'created_by_username',
            'approved_by',
            'approved_by_username',
            'approved_at',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        """Normalize signed amounts so advances and deductions always reduce payroll."""

        attrs = super().validate(attrs)
        adjustment_type = attrs.get('adjustment_type', getattr(self.instance, 'adjustment_type', None))
        amount = attrs.get('amount', getattr(self.instance, 'amount', None))

        if amount is None:
            return attrs

        normalized_amount = Decimal(amount)
        if normalized_amount == 0:
            raise serializers.ValidationError({'amount': 'Amount cannot be zero.'})

        if adjustment_type in self.POSITIVE_AMOUNT_TYPES:
            attrs['amount'] = abs(normalized_amount)
        elif adjustment_type in self.NEGATIVE_AMOUNT_TYPES:
            attrs['amount'] = -abs(normalized_amount)
        else:
            attrs['amount'] = normalized_amount

        return attrs


class ConstructionProjectAssignmentSerializer(serializers.ModelSerializer):
    """Serialize which employees are attached to a construction project."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = ConstructionProjectAssignment
        fields = [
            'id',
            'project',
            'employee',
            'employee_name',
            'worker_id',
            'role',
            'start_date',
            'end_date',
            'share_weight',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'employee_name', 'worker_id', 'created_at', 'updated_at']

    def validate(self, attrs):
        """Ensure the optional assignment end date does not precede the start date."""

        attrs = super().validate(attrs)
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({'end_date': 'End date must be on or after start date.'})
        return attrs


class ConstructionProjectWorkLogSerializer(serializers.ModelSerializer):
    """Serialize construction labor entries used for project bonus settlement."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ConstructionProjectWorkLog
        fields = [
            'id',
            'project',
            'employee',
            'employee_name',
            'worker_id',
            'work_date',
            'quantity_unit',
            'quantity_value',
            'normalized_hours',
            'day_equivalent',
            'attendance_record_reference',
            'daily_salary_rate_snapshot',
            'created_by',
            'created_by_username',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'employee_name',
            'worker_id',
            'normalized_hours',
            'day_equivalent',
            'daily_salary_rate_snapshot',
            'created_by',
            'created_by_username',
            'created_at',
            'updated_at',
        ]

    def validate_quantity_value(self, value):
        """Require a positive logged quantity for every work log."""

        if value <= 0:
            raise serializers.ValidationError('Quantity value must be greater than zero.')
        return value


class ConstructionProjectSettlementSerializer(serializers.ModelSerializer):
    """Read-only serializer for construction bonus settlement results."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = ConstructionProjectSettlement
        fields = [
            'id',
            'project',
            'employee',
            'employee_name',
            'worker_id',
            'employee_project_reserved_hours',
            'employee_project_day_equivalent',
            'employee_project_labor_cost_amount',
            'total_actual_labor_cost_spend_snapshot',
            'weight_ratio',
            'bonus_share_amount',
            'settled_to_year',
            'settled_to_month',
            'snapshot',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class ConstructionProjectSerializer(serializers.ModelSerializer):
    """Serialize construction projects together with assignments and settlements."""

    assignments = ConstructionProjectAssignmentSerializer(many=True, read_only=True)
    settlements = ConstructionProjectSettlementSerializer(many=True, read_only=True)
    total_bonus_distributed = serializers.SerializerMethodField()

    class Meta:
        model = ConstructionProject
        fields = [
            'id',
            'name',
            'project_code',
            'revenue_amount',
            'labor_pool_percent',
            'labor_pool_amount',
            'status',
            'start_date',
            'completed_date',
            'management_note',
            'assignments',
            'settlements',
            'total_bonus_distributed',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'labor_pool_amount', 'assignments', 'settlements', 'total_bonus_distributed', 'created_at', 'updated_at']

    def validate(self, attrs):
        """Require completed dates to fall on or after project start dates."""

        attrs = super().validate(attrs)
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        completed_date = attrs.get('completed_date', getattr(self.instance, 'completed_date', None))
        if start_date and completed_date and completed_date < start_date:
            raise serializers.ValidationError({'completed_date': 'Completed date must be on or after start date.'})
        return attrs

    def get_total_bonus_distributed(self, obj):
        """Sum the already-generated settlement rows for quick project totals."""

        return sum(settlement.bonus_share_amount for settlement in obj.settlements.all())


class PayrollComponentSerializer(serializers.ModelSerializer):
    """Read-only serializer for the line items inside a payroll calculation."""

    class Meta:
        model = PayrollComponent
        fields = [
            'id',
            'component_type',
            'code',
            'label',
            'amount',
            'quantity',
            'rate',
            'source_reference_type',
            'source_reference_id',
            'display_order',
            'notes',
        ]
        read_only_fields = fields


class PayrollRunEmployeeSerializer(serializers.ModelSerializer):
    """Serialize one employee's result within a payroll run."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    components = PayrollComponentSerializer(many=True, read_only=True)

    class Meta:
        model = PayrollRunEmployee
        fields = [
            'id',
            'payroll_run',
            'employee',
            'employee_name',
            'worker_id',
            'monthly_base_wage_amount',
            'attendance_bonus_amount',
            'late_minutes_total',
            'early_departure_minutes_total',
            'absent_minutes_total',
            'time_bank_minutes_total',
            'opening_time_bank_minutes_total',
            'settled_time_bank_minutes_total',
            'closing_time_bank_minutes_total',
            'paid_rest_minutes_total',
            'approved_leave_minutes_total',
            'unapproved_leave_minutes_total',
            'approved_ot_minutes_total',
            'approved_ot_offset_minutes_total',
            'payable_ot_minutes_total',
            'denied_ot_minutes_total',
            'deductible_minutes_total',
            'deduction_amount',
            'overtime_pay_amount',
            'project_bonus_amount',
            'manual_adjustments_amount',
            'carry_forward_recovery_amount',
            'gross_before_rounding_amount',
            'rounding_adjustment_amount',
            'gross_payable_amount',
            'previous_run_delta_amount',
            'calc_snapshot',
            'components',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PayrollMonthlySummarySerializer(serializers.ModelSerializer):
    """Read-only serializer for run-level payroll totals."""

    class Meta:
        model = PayrollMonthlySummary
        fields = [
            'id',
            'payroll_run',
            'headcount_paid',
            'total_monthly_base_wages',
            'total_attendance_bonus_amount',
            'total_deduction_amount',
            'total_approved_overtime_pay_amount',
            'total_project_bonus_amount',
            'total_manual_adjustments_amount',
            'total_carry_forward_recovery_amount',
            'total_gross_before_rounding_amount',
            'total_rounding_adjustment_amount',
            'total_gross_payable_amount',
            'total_late_minutes',
            'total_early_departure_minutes',
            'total_absent_minutes',
            'total_time_bank_minutes',
            'total_leave_minutes',
            'total_paid_rest_minutes',
            'total_approved_ot_minutes',
            'total_approved_ot_offset_minutes',
            'total_payable_ot_minutes',
            'trend_snapshot_json',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PayrollCorrectionDeltaSerializer(serializers.ModelSerializer):
    """Read-only serializer for correction-run deltas versus a previous run."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = PayrollCorrectionDelta
        fields = [
            'id',
            'current_run',
            'previous_run',
            'employee',
            'employee_name',
            'worker_id',
            'previous_gross_payable_amount',
            'corrected_gross_payable_amount',
            'delta_amount',
            'delta_direction',
            'settlement_strategy',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class EmployeePayrollCarryForwardBalanceSerializer(serializers.ModelSerializer):
    """Read-only serializer for outstanding carry-forward recovery balances."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)

    class Meta:
        model = EmployeePayrollCarryForwardBalance
        fields = [
            'id',
            'employee',
            'employee_name',
            'worker_id',
            'origin_correction_delta',
            'amount',
            'direction',
            'apply_from_year',
            'apply_from_month',
            'remaining_amount',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PayrollReportArtifactSerializer(serializers.ModelSerializer):
    """Serialize generated payroll report files together with a media URL."""

    employee_name = serializers.CharField(source='employee.name', read_only=True)
    worker_id = serializers.CharField(source='employee.worker_id', read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = PayrollReportArtifact
        fields = [
            'id',
            'payroll_run',
            'employee',
            'employee_name',
            'worker_id',
            'report_type',
            'format',
            'file_path',
            'url',
            'snapshot_hash',
            'generated_at',
        ]
        read_only_fields = fields

    def get_url(self, obj):
        """Return a browser-usable media URL for the stored artifact path."""

        request = self.context.get('request')
        media_path = f'/media/{obj.file_path}'.replace('//', '/')
        if request:
            return request.build_absolute_uri(media_path)
        return media_path


class PayrollRunSerializer(serializers.ModelSerializer):
    """Read-only serializer for complete payroll run detail responses."""

    policy_name = serializers.CharField(source='policy_used.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by_user.username', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by_user.username', read_only=True)
    authorized_by_username = serializers.CharField(source='authorized_by_user.username', read_only=True)
    employees = PayrollRunEmployeeSerializer(many=True, read_only=True)
    monthly_summary = PayrollMonthlySummarySerializer(read_only=True)
    correction_deltas = PayrollCorrectionDeltaSerializer(many=True, read_only=True)
    report_artifacts = PayrollReportArtifactSerializer(many=True, read_only=True)

    class Meta:
        model = PayrollRun
        fields = [
            'id',
            'year',
            'month',
            'run_type',
            'status',
            'parent_run',
            'supersedes_run',
            'policy_used',
            'policy_name',
            'generated_at',
            'locked_at',
            'created_by_user',
            'created_by_username',
            'approved_by_user',
            'approved_by_username',
            'authorized_by_user',
            'authorized_by_username',
            'notes',
            'employees',
            'monthly_summary',
            'correction_deltas',
            'report_artifacts',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PayrollRunGenerateSerializer(serializers.Serializer):
    """Validate the minimal payload required to generate a payroll run."""

    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    run_type = serializers.ChoiceField(choices=PayrollRun.RUN_TYPE_CHOICES, default='normal')
    policy_id = serializers.IntegerField(required=False, allow_null=True)
    source_run_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class PayrollReportRequestSerializer(serializers.Serializer):
    """Validate which payroll report artifact should be generated."""

    report_type = serializers.ChoiceField(choices=PayrollReportArtifact.REPORT_TYPE_CHOICES)
    employee_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        """Require ``employee_id`` when generating a per-employee report."""

        attrs = super().validate(attrs)
        if attrs.get('report_type') == 'employee' and not attrs.get('employee_id'):
            raise serializers.ValidationError({'employee_id': 'Employee report generation requires employee_id.'})
        return attrs


class ProjectSettlementRequestSerializer(serializers.Serializer):
    """Validate the target accounting period for a project settlement run."""

    settled_to_year = serializers.IntegerField(min_value=2000, max_value=2100)
    settled_to_month = serializers.IntegerField(min_value=1, max_value=12)

class InventoryItemSerializer(serializers.ModelSerializer):
    """Serialize inventory items and expose a simple restock condition flag."""

    inventory_condition = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            'id',
            'item_code',
            'name',
            'image_url',
            'image',
            'quantity',
            'least_inventory_amount',
            'unit',
            'last_updated',
            'inventory_condition',
        ]

    def get_inventory_condition(self, obj):
        """Return whether stock is below the configured minimum threshold."""

        return 'requiring restock' if obj.quantity < obj.least_inventory_amount else 'normal'

class CategorySerializer(serializers.ModelSerializer):
    """Serialize category tree nodes with image and hierarchy helpers."""

    image_url = serializers.SerializerMethodField()
    breadcrumb = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image', 'image_url', 'parent', 'display_order', 'breadcrumb', 'children_count', 'level']

    def get_image_url(self, obj):
        """Return an absolute category image URL when possible."""

        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_breadcrumb(self, obj):
        """Expose the ancestor path used by category navigation UIs."""

        return obj.get_breadcrumb()

    def get_children_count(self, obj):
        """Expose how many direct child categories sit under this category."""

        return obj.children.count()

    def get_level(self, obj):
        """Expose the category depth for nested UI rendering."""

        return obj.get_level()


class ProductSerializer(serializers.ModelSerializer):
    """Serialize storefront products together with category and rating metadata."""

    image_url = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    rating = serializers.FloatField(read_only=True)
    ratingCount = serializers.IntegerField(source='rating_count', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'product_id', 'name', 'price', 'description', 'category', 'category_name', 'category_slug',
            'slug', 'image', 'image_url', 'colour', 'material', 'is_best_seller', 'is_new',
            'rating', 'ratingCount'
        ]

    def get_image_url(self, obj):
        """Return an absolute product image URL when request context is present."""

        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def validate_product_id(self, value):
        """Ensure product codes remain unique across the catalog."""
        if self.instance and self.instance.product_id == value:
            return value
        if Product.objects.filter(product_id=value).exists():
            raise serializers.ValidationError("A product with this product_id already exists.")
        return value

class UserSerializer(serializers.ModelSerializer):
    """Serialize a limited public subset of user fields."""

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role']


class CustomerProfileSerializer(serializers.ModelSerializer):
    """Serialize customer-specific profile details nested under a user."""

    user = UserSerializer(read_only=True)

    class Meta:
        model = CustomerProfile
        fields = ['id', 'user', 'phone', 'loyalty_id', 'default_shipping_address']

class RegisterSerializer(serializers.ModelSerializer):
    """Validate registration data and create a new user account."""

    class Meta:
        model = User
        fields = ['username', 'password', 'email', 'role']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        """Create the user and lazily create a customer profile when appropriate."""

        if not validated_data.get('role'):
            validated_data['role'] = 'customer'
        user = User.objects.create_user(**validated_data)
        if user.role == 'customer':
            CustomerProfile.objects.get_or_create(user=user)
        return user


class WorkplaceSerializer(serializers.ModelSerializer):
    """Serialize workplace coordinates used during face verification."""

    class Meta:
        model = Workplace
        fields = '__all__'


class EmployeeFaceProfileSerializer(serializers.ModelSerializer):
    """Serialize the employee face profile record."""

    class Meta:
        model = EmployeeFaceProfile
        fields = '__all__'


class ReviewSerializer(serializers.ModelSerializer):
    """Serialize product reviews and validate the star rating range."""

    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'product', 'user', 'user_username', 'rating', 'title', 'body', 'created_at', 'verified_purchase']
        read_only_fields = ['user', 'verified_purchase', 'created_at']

    def validate_rating(self, value):
        """Require ratings to stay within the supported 1-5 range."""

        if value < 1 or value > 5:
            raise serializers.ValidationError('Rating must be between 1 and 5.')
        return value
