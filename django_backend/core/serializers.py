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
"""

from decimal import Decimal

from rest_framework import serializers
from .models import (
    AttendanceMonthlySummary,
    AttendanceOvertimeDecision,
    AttendanceOvertimeDecisionSegment,
    Category,
    ConstructionProject,
    ConstructionProjectAssignment,
    ConstructionProjectSettlement,
    ConstructionProjectWorkLog,
    CustomerProfile,
    Department,
    Employee,
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
    normalized = normalize_clock_time(value)
    if not normalized:
        return None

    hour_text, minute_text = normalized.split(':')
    return int(hour_text) * 60 + int(minute_text)


def _minutes_between(start_time, end_time):
    start_minutes = _clock_to_minutes(start_time)
    end_minutes = _clock_to_minutes(end_time)
    if start_minutes is None or end_minutes is None:
        raise serializers.ValidationError('Start and end times must use HH:MM format.')
    if end_minutes <= start_minutes:
        raise serializers.ValidationError('End time must be later than start time.')
    return end_minutes - start_minutes


class RosterTemplateSerializer(serializers.ModelSerializer):
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
        if value < 1 or value > 4:
            raise serializers.ValidationError('Cycle length must be between 1 and 4 weeks.')
        return value

    def validate(self, attrs):
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
        annotated_usage_count = getattr(obj, 'usage_count', None)
        if annotated_usage_count is not None:
            return annotated_usage_count
        return obj.assignments.count()

    def get_summary_lines(self, obj):
        return summarize_roster_schedule(obj.schedule, obj.cycle_length_weeks)


class DepartmentSerializer(serializers.ModelSerializer):
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
            'department_name',
            'department_code',
            'department_shop_paid_rest_enabled',
            'roster_assignment',
        ]
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)

        name = str(attrs.get('name', getattr(self.instance, 'name', '')) or '').strip()
        if not name:
            raise serializers.ValidationError({'name': 'Employee name is required.'})
        attrs['name'] = name
        normalized_name = normalize_employee_name(name)

        base_salary = attrs.get('base_salary', getattr(self.instance, 'base_salary', None))
        if base_salary is None:
            raise serializers.ValidationError({'base_salary': 'Base salary is required.'})
        if base_salary <= 0:
            raise serializers.ValidationError({'base_salary': 'Base salary must be greater than 0.'})

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

    def get_roster_assignment(self, obj):
        try:
            assignment = obj.roster_assignment
        except obj.__class__.roster_assignment.RelatedObjectDoesNotExist:
            return None

        return _serialize_roster_assignment(assignment)


class AttendanceOvertimeDecisionSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceOvertimeDecisionSegment
        fields = ['id', 'segment_start_time', 'segment_end_time', 'segment_minutes', 'status', 'note']
        read_only_fields = ['id', 'segment_minutes']

    def validate(self, attrs):
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
        segments = validated_data.pop('segments', [])
        instance = super().create(validated_data)
        self._replace_segments(instance, segments)
        return instance

    def update(self, instance, validated_data):
        segments = validated_data.pop('segments', None)
        instance = super().update(instance, validated_data)
        if segments is not None:
            self._replace_segments(instance, segments)
        return instance

    def _replace_segments(self, instance, segments):
        instance.segments.all().delete()
        for segment in segments:
            AttendanceOvertimeDecisionSegment.objects.create(overtime_decision=instance, **segment)


class EmployeeLeaveRecordSerializer(serializers.ModelSerializer):
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
        attrs = super().validate(attrs)
        effective_from = attrs.get('effective_from', getattr(self.instance, 'effective_from', None))
        effective_to = attrs.get('effective_to', getattr(self.instance, 'effective_to', None))
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({'effective_to': 'Effective to date must be on or after effective from date.'})

        labor_pool_percent = attrs.get('labor_pool_percent', getattr(self.instance, 'labor_pool_percent', 0))
        if labor_pool_percent is not None and (labor_pool_percent < 0 or labor_pool_percent > 1):
            raise serializers.ValidationError({'labor_pool_percent': 'Labor pool percent must be between 0 and 1.'})
        return attrs


class EmployeeCompensationProfileSerializer(serializers.ModelSerializer):
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
            'trial_period_end_date',
            'payroll_policy',
            'payroll_policy_name',
            'effective_from',
            'effective_to',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'employee_name', 'worker_id', 'payroll_policy_name', 'created_at', 'updated_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        effective_from = attrs.get('effective_from', getattr(self.instance, 'effective_from', None))
        effective_to = attrs.get('effective_to', getattr(self.instance, 'effective_to', None))
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({'effective_to': 'Effective to date must be on or after effective from date.'})
        return attrs


class AttendanceMonthlySummarySerializer(serializers.ModelSerializer):
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
            'absent_minutes_total',
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


class ConstructionProjectAssignmentSerializer(serializers.ModelSerializer):
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
        attrs = super().validate(attrs)
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({'end_date': 'End date must be on or after start date.'})
        return attrs


class ConstructionProjectWorkLogSerializer(serializers.ModelSerializer):
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
        if value <= 0:
            raise serializers.ValidationError('Quantity value must be greater than zero.')
        return value


class ConstructionProjectSettlementSerializer(serializers.ModelSerializer):
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
        attrs = super().validate(attrs)
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        completed_date = attrs.get('completed_date', getattr(self.instance, 'completed_date', None))
        if start_date and completed_date and completed_date < start_date:
            raise serializers.ValidationError({'completed_date': 'Completed date must be on or after start date.'})
        return attrs

    def get_total_bonus_distributed(self, obj):
        return sum(settlement.bonus_share_amount for settlement in obj.settlements.all())


class PayrollComponentSerializer(serializers.ModelSerializer):
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
            'absent_minutes_total',
            'paid_rest_minutes_total',
            'approved_leave_minutes_total',
            'unapproved_leave_minutes_total',
            'approved_ot_minutes_total',
            'denied_ot_minutes_total',
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
            'total_absent_minutes',
            'total_leave_minutes',
            'total_paid_rest_minutes',
            'total_approved_ot_minutes',
            'trend_snapshot_json',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PayrollCorrectionDeltaSerializer(serializers.ModelSerializer):
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
        request = self.context.get('request')
        media_path = f'/media/{obj.file_path}'.replace('//', '/')
        if request:
            return request.build_absolute_uri(media_path)
        return media_path


class PayrollRunSerializer(serializers.ModelSerializer):
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
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    run_type = serializers.ChoiceField(choices=PayrollRun.RUN_TYPE_CHOICES, default='normal')
    policy_id = serializers.IntegerField(required=False, allow_null=True)
    source_run_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class PayrollReportRequestSerializer(serializers.Serializer):
    report_type = serializers.ChoiceField(choices=PayrollReportArtifact.REPORT_TYPE_CHOICES)
    employee_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get('report_type') == 'employee' and not attrs.get('employee_id'):
            raise serializers.ValidationError({'employee_id': 'Employee report generation requires employee_id.'})
        return attrs


class ProjectSettlementRequestSerializer(serializers.Serializer):
    settled_to_year = serializers.IntegerField(min_value=2000, max_value=2100)
    settled_to_month = serializers.IntegerField(min_value=1, max_value=12)

class InventoryItemSerializer(serializers.ModelSerializer):
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
        return 'requiring restock' if obj.quantity < obj.least_inventory_amount else 'normal'

class CategorySerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    breadcrumb = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image', 'image_url', 'parent', 'display_order', 'breadcrumb', 'children_count', 'level']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_breadcrumb(self, obj):
        return obj.get_breadcrumb()

    def get_children_count(self, obj):
        return obj.children.count()

    def get_level(self, obj):
        return obj.get_level()


class ProductSerializer(serializers.ModelSerializer):
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
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def validate_product_id(self, value):
        """Validate that product_id is unique"""
        if self.instance and self.instance.product_id == value:
            return value
        if Product.objects.filter(product_id=value).exists():
            raise serializers.ValidationError("A product with this product_id already exists.")
        return value

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role']


class CustomerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = CustomerProfile
        fields = ['id', 'user', 'phone', 'loyalty_id', 'default_shipping_address']

class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'password', 'email', 'role']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        if not validated_data.get('role'):
            validated_data['role'] = 'customer'
        user = User.objects.create_user(**validated_data)
        if user.role == 'customer':
            CustomerProfile.objects.get_or_create(user=user)
        return user


class WorkplaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workplace
        fields = '__all__'


class EmployeeFaceProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeFaceProfile
        fields = '__all__'


class ReviewSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'product', 'user', 'user_username', 'rating', 'title', 'body', 'created_at', 'verified_purchase']
        read_only_fields = ['user', 'verified_purchase', 'created_at']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Rating must be between 1 and 5.')
        return value
