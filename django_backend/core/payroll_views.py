from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AttendanceMonthlySummary,
    ConstructionProject,
    ConstructionProjectAssignment,
    ConstructionProjectWorkLog,
    Employee,
    EmployeeCompensationProfile,
    EmployeeLeaveRecord,
    EmployeePayrollAdjustment,
    EmployeePayrollCarryForwardBalance,
    EmployeePaidRestMonthlyBalance,
    EmployeePaidRestRequest,
    PayrollCorrectionDelta,
    PayrollMonthlySummary,
    PayrollPolicy,
    PayrollReportArtifact,
    PayrollRun,
)
from .payroll_services import (
    _resolve_employee_roster_day,
    approve_payroll_run,
    build_employee_report_payload,
    build_workforce_report_payload,
    generate_payroll_run,
    generate_report_artifacts,
    get_active_payroll_policy,
    lock_payroll_run,
    rebuild_paid_rest_balances,
    rebuild_attendance_summaries,
    settle_project_bonus,
)
from .serializers import (
    AttendanceMonthlySummarySerializer,
    ConstructionProjectAssignmentSerializer,
    ConstructionProjectSerializer,
    ConstructionProjectSettlementSerializer,
    ConstructionProjectWorkLogSerializer,
    EmployeeCompensationProfileSerializer,
    EmployeePayrollAdjustmentSerializer,
    EmployeePayrollCarryForwardBalanceSerializer,
    EmployeePaidRestMonthlyBalanceSerializer,
    EmployeePaidRestRequestSerializer,
    PayrollCorrectionDeltaSerializer,
    PayrollMonthlySummarySerializer,
    PayrollPolicySerializer,
    PayrollReportArtifactSerializer,
    PayrollReportRequestSerializer,
    PayrollRunGenerateSerializer,
    PayrollRunSerializer,
    ProjectSettlementRequestSerializer,
)


DAYS_QUANTUM = Decimal('0.01')


def _bool_query_param(query_params, key):
    value = str(query_params.get(key, '')).strip().lower()
    return value in ('1', 'true', 'yes', 'y')


def _request_user(request):
    if getattr(request, 'user', None) and request.user.is_authenticated:
        return request.user
    return None


def _parse_year_month(year_value, month_value):
    if year_value is None or month_value is None:
        raise ValueError('year and month are required.')

    try:
        return int(year_value), int(month_value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Invalid year or month.') from exc


def _parse_optional_year_month(query_params):
    year = query_params.get('year')
    month = query_params.get('month')
    if year is None and month is None:
        return None, None
    return _parse_year_month(year, month)


def _day_quantity(value):
    return Decimal(str(value or '0')).quantize(DAYS_QUANTUM)


def _resolve_payroll_run_for_preview(request, explicit_run_id=None):
    run_id = explicit_run_id or request.query_params.get('run_id') or request.data.get('run_id')
    if run_id is not None:
        payroll_run = PayrollRun.objects.select_related('policy_used').filter(pk=run_id).first()
        if payroll_run is None:
            raise LookupError('Payroll run not found.')
        return payroll_run

    year, month = _parse_year_month(request.query_params.get('year'), request.query_params.get('month'))
    queryset = PayrollRun.objects.select_related('policy_used').filter(year=year, month=month).order_by('-generated_at')
    payroll_run = queryset.filter(status__in=('locked', 'paid', 'approved')).first() or queryset.first()
    if payroll_run is None:
        raise LookupError('Payroll run not found for the requested month.')
    return payroll_run


def _serialize_run_brief(payroll_run):
    monthly_summary = getattr(payroll_run, 'monthly_summary', None)
    return {
        'id': payroll_run.id,
        'year': payroll_run.year,
        'month': payroll_run.month,
        'run_type': payroll_run.run_type,
        'status': payroll_run.status,
        'policy_name': payroll_run.policy_used.name,
        'headcount_paid': monthly_summary.headcount_paid if monthly_summary else 0,
        'total_gross_payable_amount': str(monthly_summary.total_gross_payable_amount) if monthly_summary else '0.00',
        'generated_at': payroll_run.generated_at.isoformat() if payroll_run.generated_at else None,
        'locked_at': payroll_run.locked_at.isoformat() if payroll_run.locked_at else None,
        'notes': payroll_run.notes,
    }


def _paid_rest_shift_targets(paid_rest_request):
    linked_shift = str(paid_rest_request.linked_attendance_shift or '').strip()
    if linked_shift in ('morning', 'afternoon'):
        return [linked_shift]
    return ['morning', 'afternoon']


def _leave_shift_targets(leave_record):
    linked_shift = str(leave_record.linked_attendance_shift or '').strip()
    if linked_shift in ('morning', 'afternoon'):
        return [linked_shift]
    return ['morning', 'afternoon']


def _stamp_paid_rest_request_status(paid_rest_request, request, status_value, coverage_snapshot=None):
    user = _request_user(request)
    now = timezone.now()

    paid_rest_request.submission_status = status_value
    if status_value != 'draft':
        if paid_rest_request.submitted_at is None:
            paid_rest_request.submitted_at = now
        if paid_rest_request.submitted_by is None and user is not None:
            paid_rest_request.submitted_by = user

    if status_value in ('approved', 'rejected'):
        paid_rest_request.decision_at = now
        if user is not None:
            paid_rest_request.decision_by = user
    else:
        paid_rest_request.decision_at = None
        paid_rest_request.decision_by = None

    if status_value == 'approved':
        paid_rest_request.coverage_snapshot_json = coverage_snapshot or {}
    elif coverage_snapshot is not None:
        paid_rest_request.coverage_snapshot_json = coverage_snapshot
    else:
        paid_rest_request.coverage_snapshot_json = {}


def _refresh_paid_rest_balances_for_request(paid_rest_request):
    rebuild_paid_rest_balances(
        paid_rest_request.rest_date.year,
        paid_rest_request.rest_date.month,
        employee_ids=[paid_rest_request.employee_id],
    )


def _has_approved_leave_overlap(employee, target_date, shift_targets):
    approved_leave_records = EmployeeLeaveRecord.objects.filter(
        employee=employee,
        leave_date=target_date,
        submission_status='approved',
    )
    shift_targets = set(shift_targets)
    for leave_record in approved_leave_records:
        if shift_targets.intersection(_leave_shift_targets(leave_record)):
            return True
    return False


def _has_approved_paid_rest_overlap(employee, target_date, shift_targets, exclude_request_id=None):
    approved_requests = EmployeePaidRestRequest.objects.filter(
        employee=employee,
        rest_date=target_date,
        submission_status='approved',
    )
    if exclude_request_id is not None:
        approved_requests = approved_requests.exclude(pk=exclude_request_id)

    shift_targets = set(shift_targets)
    for paid_rest_request in approved_requests:
        if shift_targets.intersection(_paid_rest_shift_targets(paid_rest_request)):
            return True
    return False


def _employee_scheduled_for_shift(employee, target_date, shift_key, policy):
    roster_day = _resolve_employee_roster_day(employee, target_date, policy)
    if roster_day.get('is_working') is not True:
        return False
    return bool(roster_day.get(f'{shift_key}_in') and roster_day.get(f'{shift_key}_out'))


def _validate_paid_rest_request_for_approval(paid_rest_request):
    employee = paid_rest_request.employee
    if employee is None or not employee.is_active:
        raise ValidationError('Paid rest can only be approved for an active employee.')

    department = employee.department
    if department is None:
        raise ValidationError('Employee must be assigned to a department before paid rest can be approved.')
    if not department.is_active or not department.shop_paid_rest_enabled:
        raise ValidationError('Paid rest is not enabled for this employee department.')
    if paid_rest_request.duration_unit == 'half_day' and not department.allow_half_day_paid_rest:
        raise ValidationError('This department does not allow half-day paid rest.')

    target_date = paid_rest_request.rest_date
    shift_targets = _paid_rest_shift_targets(paid_rest_request)
    policy = get_active_payroll_policy(target_date.year, target_date.month)
    for shift_key in shift_targets:
        if not _employee_scheduled_for_shift(employee, target_date, shift_key, policy):
            raise ValidationError(f'Employee is not rostered to work the {shift_key} shift on {target_date.isoformat()}.')

    if _has_approved_leave_overlap(employee, target_date, shift_targets):
        raise ValidationError('Approved paid rest cannot overlap an approved leave record on the same shift.')
    if _has_approved_paid_rest_overlap(employee, target_date, shift_targets, exclude_request_id=paid_rest_request.pk):
        raise ValidationError('Approved paid rest cannot overlap another approved paid-rest request on the same shift.')

    balances = rebuild_paid_rest_balances(target_date.year, target_date.month, employee_ids=[employee.id])
    balance = next((item for item in balances if item.employee_id == employee.id), None)
    opening_balance_days = _day_quantity(balance.opening_balance_days if balance is not None else 0)
    granted_days = _day_quantity(
        balance.granted_days
        if balance is not None
        else department.paid_rest_days_granted_per_month if department.shop_paid_rest_enabled else 0
    )
    approved_days_excluding_current = _day_quantity(
        sum(
            _day_quantity(existing_request.paid_rest_days)
            for existing_request in EmployeePaidRestRequest.objects.filter(
                employee=employee,
                rest_date__year=target_date.year,
                rest_date__month=target_date.month,
                submission_status='approved',
            ).exclude(pk=paid_rest_request.pk)
        )
    )
    available_days = opening_balance_days + granted_days - approved_days_excluding_current
    if available_days < _day_quantity(paid_rest_request.paid_rest_days):
        raise ValidationError('Insufficient paid-rest balance for this month.')

    coverage_checks = []
    department_employees = Employee.objects.filter(
        is_active=True,
        department=department,
    ).order_by('name', 'id')
    for shift_key in shift_targets:
        scheduled_count = 0
        unavailable_employee_ids = set()
        for department_employee in department_employees:
            if not _employee_scheduled_for_shift(department_employee, target_date, shift_key, policy):
                continue

            scheduled_count += 1
            if department_employee.id == employee.id:
                continue

            if _has_approved_leave_overlap(department_employee, target_date, [shift_key]) or _has_approved_paid_rest_overlap(
                department_employee,
                target_date,
                [shift_key],
            ):
                unavailable_employee_ids.add(department_employee.id)

        projected_on_duty_count = scheduled_count - len(unavailable_employee_ids) - 1
        coverage_check = {
            'target_date': target_date.isoformat(),
            'shift': shift_key,
            'scheduled_count': scheduled_count,
            'already_unavailable_count': len(unavailable_employee_ids),
            'projected_on_duty_count': projected_on_duty_count,
            'minimum_staff_required_per_shift': department.minimum_staff_required_per_shift,
        }
        coverage_checks.append(coverage_check)
        if projected_on_duty_count < department.minimum_staff_required_per_shift:
            raise ValidationError(
                f'Approving this paid-rest request would drop {department.name} below minimum coverage for the {shift_key} shift on {target_date.isoformat()}.'
            )

    return {
        'department_id': department.id,
        'department_name': department.name,
        'minimum_staff_required_per_shift': department.minimum_staff_required_per_shift,
        'checks': coverage_checks,
    }


@transaction.atomic
def _activate_policy(policy):
    PayrollPolicy.objects.exclude(pk=policy.pk).update(is_active=False)
    policy.is_active = True
    policy.status = 'active'
    policy.archived_at = None
    policy.save(update_fields=['is_active', 'status', 'archived_at', 'updated_at'])
    return policy


@transaction.atomic
def _archive_policy(policy):
    policy.is_active = False
    policy.status = 'archived'
    policy.archived_at = timezone.now()
    policy.save(update_fields=['is_active', 'status', 'archived_at', 'updated_at'])
    return policy


class PayrollPoliciesView(APIView):
    def get(self, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if year and month:
            try:
                policy = get_active_payroll_policy(int(year), int(month))
            except (ValueError, TypeError) as exc:
                return Response({'error': str(exc)}, status=400)
            return Response(PayrollPolicySerializer(policy).data)

        queryset = PayrollPolicy.objects.select_related('cloned_from_policy').all().order_by('-effective_from', 'policy_code', '-version_number')
        status_value = request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value)
        if _bool_query_param(request.query_params, 'active_only'):
            queryset = queryset.filter(is_active=True)
        serializer = PayrollPolicySerializer(queryset, many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        serializer = PayrollPolicySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        policy = serializer.save()
        if policy.status == 'active' or policy.is_active:
            _activate_policy(policy)
        return Response(PayrollPolicySerializer(policy).data, status=201)


class PayrollPolicyActiveView(APIView):
    def get(self, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        try:
            if year is None or month is None:
                today = timezone.localdate()
                policy = get_active_payroll_policy(today.year, today.month)
            else:
                policy = get_active_payroll_policy(int(year), int(month))
        except (ValueError, TypeError) as exc:
            return Response({'error': str(exc)}, status=400)

        return Response(PayrollPolicySerializer(policy).data)


class PayrollPolicyDetailView(APIView):
    def get(self, request, pk):
        policy = PayrollPolicy.objects.select_related('cloned_from_policy').filter(pk=pk).first()
        if policy is None:
            return Response({'error': 'Payroll policy not found.'}, status=404)
        return Response(PayrollPolicySerializer(policy).data)

    def patch(self, request, pk):
        policy = PayrollPolicy.objects.filter(pk=pk).first()
        if policy is None:
            return Response({'error': 'Payroll policy not found.'}, status=404)

        serializer = PayrollPolicySerializer(policy, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        policy = serializer.save()
        if policy.status == 'archived':
            policy.is_active = False
            policy.archived_at = timezone.now()
            policy.save(update_fields=['is_active', 'archived_at', 'updated_at'])
        elif policy.status == 'active' or policy.is_active:
            _activate_policy(policy)

        return Response(PayrollPolicySerializer(policy).data)

    def delete(self, request, pk):
        policy = PayrollPolicy.objects.filter(pk=pk).first()
        if policy is None:
            return Response({'error': 'Payroll policy not found.'}, status=404)
        if policy.status != 'draft':
            return Response({'error': 'Only unused draft policies can be deleted.'}, status=400)
        if policy.payroll_runs.exists():
            return Response({'error': 'Policies already used by a payroll run must be archived, not deleted.'}, status=400)
        policy.delete()
        return Response(status=204)


class PayrollPolicyActivateView(APIView):
    def post(self, request, pk):
        policy = PayrollPolicy.objects.filter(pk=pk).first()
        if policy is None:
            return Response({'error': 'Payroll policy not found.'}, status=404)
        _activate_policy(policy)
        return Response(PayrollPolicySerializer(policy).data)


class PayrollPolicyArchiveView(APIView):
    def post(self, request, pk):
        policy = PayrollPolicy.objects.filter(pk=pk).first()
        if policy is None:
            return Response({'error': 'Payroll policy not found.'}, status=404)
        _archive_policy(policy)
        return Response(PayrollPolicySerializer(policy).data)


class PayrollPolicyCloneView(APIView):
    def post(self, request, pk):
        source_policy = PayrollPolicy.objects.filter(pk=pk).first()
        if source_policy is None:
            return Response({'error': 'Payroll policy not found.'}, status=404)

        next_version = (
            PayrollPolicy.objects.filter(policy_code=source_policy.policy_code).order_by('-version_number').values_list('version_number', flat=True).first() or 0
        ) + 1
        payload = {
            'policy_code': source_policy.policy_code,
            'name': request.data.get('name') or source_policy.name,
            'version_number': next_version,
            'effective_from': request.data.get('effective_from') or source_policy.effective_from,
            'effective_to': request.data.get('effective_to', source_policy.effective_to),
            'rice_allowance_amount': request.data.get('rice_allowance_amount', source_policy.rice_allowance_amount),
            'social_security_allowance_amount': request.data.get('social_security_allowance_amount', source_policy.social_security_allowance_amount),
            'full_attendance_bonus_amount': request.data.get('full_attendance_bonus_amount', source_policy.full_attendance_bonus_amount),
            'labor_pool_percent': request.data.get('labor_pool_percent', source_policy.labor_pool_percent),
            'normal_work_hours_per_day': request.data.get('normal_work_hours_per_day', source_policy.normal_work_hours_per_day),
            'salary_days_per_month': request.data.get('salary_days_per_month', source_policy.salary_days_per_month),
            'overtime_multiplier': request.data.get('overtime_multiplier', source_policy.overtime_multiplier),
            'late_grace_minutes': request.data.get('late_grace_minutes', source_policy.late_grace_minutes),
            'rounding_unit_amount': request.data.get('rounding_unit_amount', source_policy.rounding_unit_amount),
            'rounding_rule': request.data.get('rounding_rule', source_policy.rounding_rule),
            'unapproved_absence_incident_threshold': request.data.get('unapproved_absence_incident_threshold', source_policy.unapproved_absence_incident_threshold),
            'status': request.data.get('status', 'draft'),
            'currency': request.data.get('currency', source_policy.currency),
            'is_active': False,
            'cloned_from_policy': source_policy.id,
        }
        serializer = PayrollPolicySerializer(data=payload)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        policy = serializer.save()
        return Response(PayrollPolicySerializer(policy).data, status=201)


class PayrollCompensationProfilesView(APIView):
    def get(self, request):
        queryset = EmployeeCompensationProfile.objects.select_related('employee', 'payroll_policy').all()
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        if _bool_query_param(request.query_params, 'current_only'):
            year = request.query_params.get('year')
            month = request.query_params.get('month')
            target_date = date(int(year), int(month), 1) if year and month else timezone.localdate()
            queryset = queryset.filter(effective_from__lte=target_date).filter(
                Q(effective_to__isnull=True) | Q(effective_to__gte=target_date)
            )

        serializer = EmployeeCompensationProfileSerializer(queryset.order_by('employee_id', '-effective_from', '-id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        serializer = EmployeeCompensationProfileSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        profile = serializer.save()
        return Response(EmployeeCompensationProfileSerializer(profile).data, status=201)


class PayrollCompensationProfileDetailView(APIView):
    def patch(self, request, pk):
        profile = EmployeeCompensationProfile.objects.filter(pk=pk).first()
        if profile is None:
            return Response({'error': 'Compensation profile not found.'}, status=404)
        serializer = EmployeeCompensationProfileSerializer(profile, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        profile = serializer.save()
        return Response(EmployeeCompensationProfileSerializer(profile).data)


class PayrollPaidRestRequestsView(APIView):
    def get(self, request):
        try:
            year, month = _parse_optional_year_month(request.query_params)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        queryset = EmployeePaidRestRequest.objects.select_related('employee', 'department', 'submitted_by', 'decision_by')
        if year is not None and month is not None:
            queryset = queryset.filter(rest_date__year=year, rest_date__month=month)

        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        department_id = request.query_params.get('department_id')
        if department_id:
            queryset = queryset.filter(department_id=department_id)

        submission_status = request.query_params.get('submission_status')
        if submission_status:
            queryset = queryset.filter(submission_status=submission_status)

        serializer = EmployeePaidRestRequestSerializer(queryset.order_by('rest_date', 'employee_id', 'id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        serializer = EmployeePaidRestRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        with transaction.atomic():
            paid_rest_request = serializer.save()
            target_status = serializer.validated_data.get('submission_status', paid_rest_request.submission_status)
            coverage_snapshot = None
            if target_status == 'approved':
                coverage_snapshot = _validate_paid_rest_request_for_approval(paid_rest_request)

            _stamp_paid_rest_request_status(paid_rest_request, request, target_status, coverage_snapshot)
            paid_rest_request.save()
            _refresh_paid_rest_balances_for_request(paid_rest_request)

        return Response(EmployeePaidRestRequestSerializer(paid_rest_request).data, status=201)


class PayrollPaidRestRequestDetailView(APIView):
    def get(self, request, pk):
        paid_rest_request = EmployeePaidRestRequest.objects.select_related('employee', 'department', 'submitted_by', 'decision_by').filter(pk=pk).first()
        if paid_rest_request is None:
            return Response({'error': 'Paid-rest request not found.'}, status=404)
        return Response(EmployeePaidRestRequestSerializer(paid_rest_request).data)

    def patch(self, request, pk):
        paid_rest_request = EmployeePaidRestRequest.objects.filter(pk=pk).first()
        if paid_rest_request is None:
            return Response({'error': 'Paid-rest request not found.'}, status=404)

        serializer = EmployeePaidRestRequestSerializer(paid_rest_request, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        with transaction.atomic():
            paid_rest_request = serializer.save()
            target_status = serializer.validated_data.get('submission_status', paid_rest_request.submission_status)
            coverage_snapshot = None
            if target_status == 'approved':
                coverage_snapshot = _validate_paid_rest_request_for_approval(paid_rest_request)

            _stamp_paid_rest_request_status(paid_rest_request, request, target_status, coverage_snapshot)
            paid_rest_request.save()
            _refresh_paid_rest_balances_for_request(paid_rest_request)

        return Response(EmployeePaidRestRequestSerializer(paid_rest_request).data)

    def delete(self, request, pk):
        paid_rest_request = EmployeePaidRestRequest.objects.filter(pk=pk).first()
        if paid_rest_request is None:
            return Response({'error': 'Paid-rest request not found.'}, status=404)

        employee_id = paid_rest_request.employee_id
        rest_year = paid_rest_request.rest_date.year
        rest_month = paid_rest_request.rest_date.month
        paid_rest_request.delete()
        rebuild_paid_rest_balances(rest_year, rest_month, employee_ids=[employee_id])
        return Response(status=204)


class PayrollPaidRestRequestSubmitView(APIView):
    def post(self, request, pk):
        paid_rest_request = EmployeePaidRestRequest.objects.filter(pk=pk).first()
        if paid_rest_request is None:
            return Response({'error': 'Paid-rest request not found.'}, status=404)

        _stamp_paid_rest_request_status(paid_rest_request, request, 'submitted')
        paid_rest_request.save()
        return Response(EmployeePaidRestRequestSerializer(paid_rest_request).data)


class PayrollPaidRestRequestApproveView(APIView):
    def post(self, request, pk):
        paid_rest_request = EmployeePaidRestRequest.objects.filter(pk=pk).first()
        if paid_rest_request is None:
            return Response({'error': 'Paid-rest request not found.'}, status=404)

        manager_note = request.data.get('manager_note')
        if manager_note is not None:
            paid_rest_request.manager_note = str(manager_note).strip()

        with transaction.atomic():
            coverage_snapshot = _validate_paid_rest_request_for_approval(paid_rest_request)
            _stamp_paid_rest_request_status(paid_rest_request, request, 'approved', coverage_snapshot)
            paid_rest_request.save()
            _refresh_paid_rest_balances_for_request(paid_rest_request)

        return Response(EmployeePaidRestRequestSerializer(paid_rest_request).data)


class PayrollPaidRestRequestRejectView(APIView):
    def post(self, request, pk):
        paid_rest_request = EmployeePaidRestRequest.objects.filter(pk=pk).first()
        if paid_rest_request is None:
            return Response({'error': 'Paid-rest request not found.'}, status=404)

        manager_note = request.data.get('manager_note')
        if manager_note is not None:
            paid_rest_request.manager_note = str(manager_note).strip()

        _stamp_paid_rest_request_status(paid_rest_request, request, 'rejected')
        paid_rest_request.save()
        _refresh_paid_rest_balances_for_request(paid_rest_request)
        return Response(EmployeePaidRestRequestSerializer(paid_rest_request).data)


class PayrollPaidRestBalancesView(APIView):
    def get(self, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if not year or not month:
            return Response({'error': 'year and month are required.'}, status=400)

        try:
            year, month = _parse_year_month(year, month)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        employee_id = request.query_params.get('employee_id')
        employee_ids = None
        if employee_id:
            try:
                employee_ids = [int(employee_id)]
            except ValueError:
                return Response({'error': 'employee_id must be an integer.'}, status=400)

        rebuild_paid_rest_balances(year, month, employee_ids=employee_ids)

        queryset = EmployeePaidRestMonthlyBalance.objects.select_related('employee', 'department').filter(year=year, month=month)
        if employee_ids is not None:
            queryset = queryset.filter(employee_id__in=employee_ids)

        department_id = request.query_params.get('department_id')
        if department_id:
            queryset = queryset.filter(department_id=department_id)

        serializer = EmployeePaidRestMonthlyBalanceSerializer(queryset.order_by('employee__name', 'employee_id'), many=True)
        return Response({'records': serializer.data})


class PayrollAttendanceSummariesView(APIView):
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

        if _bool_query_param(request.query_params, 'rebuild'):
            try:
                rebuild_attendance_summaries(year, month)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=400)

        queryset = AttendanceMonthlySummary.objects.select_related('employee').filter(year=year, month=month)
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        serializer = AttendanceMonthlySummarySerializer(queryset.order_by('employee__name', 'employee_id'), many=True)
        return Response({'records': serializer.data})


class PayrollMonthlySummariesView(APIView):
    def get(self, request):
        try:
            months = int(request.query_params.get('months', 12))
        except ValueError:
            return Response({'error': 'months must be an integer.'}, status=400)

        months = max(1, min(months, 24))
        queryset = PayrollMonthlySummary.objects.select_related('payroll_run__policy_used').filter(
            payroll_run__run_type='normal'
        ).order_by('-payroll_run__year', '-payroll_run__month', '-payroll_run__generated_at')[:months]
        serializer = PayrollMonthlySummarySerializer(queryset, many=True)
        records = []
        for summary, payload in zip(queryset, serializer.data):
            payload['year'] = summary.payroll_run.year
            payload['month'] = summary.payroll_run.month
            payload['run_status'] = summary.payroll_run.status
            payload['run_type'] = summary.payroll_run.run_type
            payload['policy_name'] = summary.payroll_run.policy_used.name
            records.append(payload)
        return Response({'records': records})


class PayrollAdjustmentsView(APIView):
    def get(self, request):
        queryset = EmployeePayrollAdjustment.objects.select_related('employee', 'created_by', 'approved_by').all()
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if year:
            queryset = queryset.filter(year=year)
        if month:
            queryset = queryset.filter(month=month)
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        approval_status = request.query_params.get('approval_status')
        if approval_status:
            queryset = queryset.filter(approval_status=approval_status)

        serializer = EmployeePayrollAdjustmentSerializer(queryset.order_by('-year', '-month', 'employee__name', '-id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        serializer = EmployeePayrollAdjustmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        user = _request_user(request)
        adjustment = serializer.save(created_by=user)
        if adjustment.approval_status == 'approved':
            adjustment.approved_by = user
            adjustment.approved_at = timezone.now()
            adjustment.save(update_fields=['approved_by', 'approved_at', 'updated_at'])

        return Response(EmployeePayrollAdjustmentSerializer(adjustment).data, status=201)


class PayrollAdjustmentDetailView(APIView):
    def patch(self, request, pk):
        adjustment = EmployeePayrollAdjustment.objects.filter(pk=pk).first()
        if adjustment is None:
            return Response({'error': 'Payroll adjustment not found.'}, status=404)

        serializer = EmployeePayrollAdjustmentSerializer(adjustment, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        adjustment = serializer.save()
        if adjustment.approval_status == 'approved' and adjustment.approved_at is None:
            adjustment.approved_at = timezone.now()
            adjustment.approved_by = _request_user(request)
            adjustment.save(update_fields=['approved_at', 'approved_by', 'updated_at'])
        return Response(EmployeePayrollAdjustmentSerializer(adjustment).data)


class PayrollAdjustmentApproveView(APIView):
    def post(self, request, pk):
        adjustment = EmployeePayrollAdjustment.objects.filter(pk=pk).first()
        if adjustment is None:
            return Response({'error': 'Payroll adjustment not found.'}, status=404)
        adjustment.approval_status = 'approved'
        adjustment.approved_by = _request_user(request)
        adjustment.approved_at = timezone.now()
        adjustment.save(update_fields=['approval_status', 'approved_by', 'approved_at', 'updated_at'])
        return Response(EmployeePayrollAdjustmentSerializer(adjustment).data)


class ConstructionProjectsView(APIView):
    def get(self, request):
        queryset = ConstructionProject.objects.prefetch_related('assignments__employee', 'settlements__employee').all()
        status_value = request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value)
        serializer = ConstructionProjectSerializer(queryset.order_by('-start_date', 'name', 'id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request):
        serializer = ConstructionProjectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        project = serializer.save()
        return Response(ConstructionProjectSerializer(project).data, status=201)


class ConstructionProjectDetailView(APIView):
    def get(self, request, pk):
        project = ConstructionProject.objects.prefetch_related('assignments__employee', 'settlements__employee').filter(pk=pk).first()
        if project is None:
            return Response({'error': 'Project not found.'}, status=404)
        return Response(ConstructionProjectSerializer(project).data)

    def patch(self, request, pk):
        project = ConstructionProject.objects.filter(pk=pk).first()
        if project is None:
            return Response({'error': 'Project not found.'}, status=404)
        serializer = ConstructionProjectSerializer(project, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        project = serializer.save()
        return Response(ConstructionProjectSerializer(project).data)


class ConstructionProjectAssignmentsView(APIView):
    def get(self, request, project_id):
        queryset = ConstructionProjectAssignment.objects.select_related('employee', 'project').filter(project_id=project_id)
        serializer = ConstructionProjectAssignmentSerializer(queryset.order_by('employee__name', 'employee_id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request, project_id):
        if not ConstructionProject.objects.filter(pk=project_id).exists():
            return Response({'error': 'Project not found.'}, status=404)
        payload = dict(request.data)
        payload['project'] = project_id
        serializer = ConstructionProjectAssignmentSerializer(data=payload)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        assignment = serializer.save()
        return Response(ConstructionProjectAssignmentSerializer(assignment).data, status=201)


class ConstructionProjectAssignmentDetailView(APIView):
    def patch(self, request, pk):
        assignment = ConstructionProjectAssignment.objects.filter(pk=pk).first()
        if assignment is None:
            return Response({'error': 'Project assignment not found.'}, status=404)
        serializer = ConstructionProjectAssignmentSerializer(assignment, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        assignment = serializer.save()
        return Response(ConstructionProjectAssignmentSerializer(assignment).data)

    def delete(self, request, pk):
        assignment = ConstructionProjectAssignment.objects.filter(pk=pk).first()
        if assignment is None:
            return Response({'error': 'Project assignment not found.'}, status=404)
        assignment.delete()
        return Response(status=204)


class ConstructionProjectWorkLogsView(APIView):
    def get(self, request, project_id):
        queryset = ConstructionProjectWorkLog.objects.select_related('employee', 'project', 'created_by').filter(project_id=project_id)
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        serializer = ConstructionProjectWorkLogSerializer(queryset.order_by('work_date', 'employee__name', 'id'), many=True)
        return Response({'records': serializer.data})

    def post(self, request, project_id):
        if not ConstructionProject.objects.filter(pk=project_id).exists():
            return Response({'error': 'Project not found.'}, status=404)
        payload = dict(request.data)
        payload['project'] = project_id
        serializer = ConstructionProjectWorkLogSerializer(data=payload)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        work_log = serializer.save(created_by=_request_user(request))
        return Response(ConstructionProjectWorkLogSerializer(work_log).data, status=201)


class ConstructionProjectWorkLogDetailView(APIView):
    def patch(self, request, pk):
        work_log = ConstructionProjectWorkLog.objects.filter(pk=pk).first()
        if work_log is None:
            return Response({'error': 'Project work log not found.'}, status=404)
        serializer = ConstructionProjectWorkLogSerializer(work_log, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        work_log = serializer.save()
        return Response(ConstructionProjectWorkLogSerializer(work_log).data)

    def delete(self, request, pk):
        work_log = ConstructionProjectWorkLog.objects.filter(pk=pk).first()
        if work_log is None:
            return Response({'error': 'Project work log not found.'}, status=404)
        work_log.delete()
        return Response(status=204)


class ConstructionProjectSettleView(APIView):
    def post(self, request, pk):
        project = ConstructionProject.objects.prefetch_related('assignments__employee', 'work_logs__employee').filter(pk=pk).first()
        if project is None:
            return Response({'error': 'Project not found.'}, status=404)
        serializer = ProjectSettlementRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        try:
            settlement_payload = settle_project_bonus(
                project,
                serializer.validated_data['settled_to_year'],
                serializer.validated_data['settled_to_month'],
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        refreshed_project = ConstructionProject.objects.prefetch_related('assignments__employee', 'settlements__employee').get(pk=project.pk)
        return Response(
            {
                'project': ConstructionProjectSerializer(refreshed_project).data,
                'settlements': ConstructionProjectSettlementSerializer(settlement_payload['settlements'], many=True).data,
                'labor_pool_amount': str(settlement_payload['labor_pool_amount']),
                'total_actual_labor_cost_spend': str(settlement_payload['total_actual_labor_cost_spend']),
                'remaining_bonus_pool': str(settlement_payload['remaining_bonus_pool']),
            }
        )


class PayrollRunsView(APIView):
    def get(self, request):
        queryset = PayrollRun.objects.select_related('policy_used').prefetch_related('monthly_summary').all()
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        run_type = request.query_params.get('run_type')
        status_value = request.query_params.get('status')
        if year:
            queryset = queryset.filter(year=year)
        if month:
            queryset = queryset.filter(month=month)
        if run_type:
            queryset = queryset.filter(run_type=run_type)
        if status_value:
            queryset = queryset.filter(status=status_value)
        records = [_serialize_run_brief(payroll_run) for payroll_run in queryset.order_by('-year', '-month', '-generated_at')]
        return Response({'records': records})

    def post(self, request):
        serializer = PayrollRunGenerateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        source_run = None
        if serializer.validated_data['run_type'] == 'correction':
            source_run_id = serializer.validated_data.get('source_run_id')
            if not source_run_id:
                return Response({'error': {'source_run_id': 'Correction runs require source_run_id.'}}, status=400)
            source_run = PayrollRun.objects.select_related('policy_used').filter(pk=source_run_id).first()
            if source_run is None:
                return Response({'error': 'Source payroll run not found.'}, status=404)

        try:
            payroll_run = generate_payroll_run(
                year=serializer.validated_data['year'],
                month=serializer.validated_data['month'],
                run_type=serializer.validated_data['run_type'],
                policy_id=serializer.validated_data.get('policy_id'),
                notes=serializer.validated_data.get('notes', ''),
                acting_user=_request_user(request),
                source_run=source_run,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        response_serializer = PayrollRunSerializer(payroll_run, context={'request': request})
        return Response(response_serializer.data, status=201)


class PayrollRunGenerateView(PayrollRunsView):
    pass


class PayrollRunDetailView(APIView):
    def get(self, request, pk):
        payroll_run = PayrollRun.objects.select_related(
            'policy_used',
            'created_by_user',
            'approved_by_user',
            'authorized_by_user',
        ).prefetch_related(
            'employees__employee',
            'employees__components',
            'correction_deltas__employee',
            'report_artifacts__employee',
        ).filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        serializer = PayrollRunSerializer(payroll_run, context={'request': request})
        return Response(serializer.data)

    def patch(self, request, pk):
        payroll_run = PayrollRun.objects.filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        notes = request.data.get('notes')
        if notes is not None:
            payroll_run.notes = str(notes).strip()
            payroll_run.save(update_fields=['notes', 'updated_at'])
        serializer = PayrollRunSerializer(payroll_run, context={'request': request})
        return Response(serializer.data)


class PayrollRunApproveView(APIView):
    def post(self, request, pk):
        payroll_run = PayrollRun.objects.filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        payroll_run = approve_payroll_run(payroll_run, _request_user(request))
        serializer = PayrollRunSerializer(payroll_run, context={'request': request})
        return Response(serializer.data)


class PayrollRunLockView(APIView):
    def post(self, request, pk):
        payroll_run = PayrollRun.objects.filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        payroll_run = lock_payroll_run(payroll_run, _request_user(request))
        serializer = PayrollRunSerializer(payroll_run, context={'request': request})
        return Response(serializer.data)


class PayrollRunCreateCorrectionView(APIView):
    def post(self, request, pk):
        source_run = PayrollRun.objects.select_related('policy_used').filter(pk=pk).first()
        if source_run is None:
            return Response({'error': 'Source payroll run not found.'}, status=404)

        payload = {
            'year': source_run.year,
            'month': source_run.month,
            'run_type': 'correction',
            'source_run_id': source_run.id,
            'policy_id': request.data.get('policy_id') or source_run.policy_used_id,
            'notes': request.data.get('notes', ''),
        }
        serializer = PayrollRunGenerateSerializer(data=payload)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        try:
            payroll_run = generate_payroll_run(
                year=serializer.validated_data['year'],
                month=serializer.validated_data['month'],
                run_type='correction',
                policy_id=serializer.validated_data.get('policy_id'),
                notes=serializer.validated_data.get('notes', ''),
                acting_user=_request_user(request),
                source_run=source_run,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        return Response(PayrollRunSerializer(payroll_run, context={'request': request}).data, status=201)


class PayrollRunDeltasView(APIView):
    def get(self, request, pk):
        payroll_run = PayrollRun.objects.filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        queryset = PayrollCorrectionDelta.objects.select_related('employee').filter(current_run=payroll_run).order_by('employee__name', 'employee_id')
        serializer = PayrollCorrectionDeltaSerializer(queryset, many=True)
        return Response({'records': serializer.data})


class PayrollRunReportsView(APIView):
    def get(self, request, pk):
        payroll_run = PayrollRun.objects.filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        queryset = PayrollReportArtifact.objects.select_related('employee').filter(payroll_run=payroll_run)
        report_type = request.query_params.get('report_type')
        if report_type:
            queryset = queryset.filter(report_type=report_type)
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        serializer = PayrollReportArtifactSerializer(queryset.order_by('-generated_at', 'report_type', 'format'), many=True, context={'request': request})
        return Response({'records': serializer.data})

    def post(self, request, pk):
        payroll_run = PayrollRun.objects.filter(pk=pk).first()
        if payroll_run is None:
            return Response({'error': 'Payroll run not found.'}, status=404)
        serializer = PayrollReportRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)
        employee = None
        employee_id = serializer.validated_data.get('employee_id')
        if employee_id is not None:
            employee = Employee.objects.filter(pk=employee_id).first()
            if employee is None:
                return Response({'error': 'Employee not found.'}, status=404)
        try:
            artifacts = generate_report_artifacts(payroll_run, serializer.validated_data['report_type'], employee)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        response_serializer = PayrollReportArtifactSerializer(artifacts, many=True, context={'request': request})
        return Response({'records': response_serializer.data}, status=201)


class PayrollCarryForwardBalancesView(APIView):
    def get(self, request):
        queryset = EmployeePayrollCarryForwardBalance.objects.select_related('employee', 'origin_correction_delta').all()
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        status_value = request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value)
        serializer = EmployeePayrollCarryForwardBalanceSerializer(queryset.order_by('apply_from_year', 'apply_from_month', 'employee__name'), many=True)
        return Response({'records': serializer.data})


class PayrollWorkforceReportPreviewView(APIView):
    def get(self, request):
        try:
            payroll_run = _resolve_payroll_run_for_preview(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        except LookupError as exc:
            return Response({'error': str(exc)}, status=404)

        return Response(build_workforce_report_payload(payroll_run))


class PayrollEmployeeReportPreviewView(APIView):
    def get(self, request):
        employee_id = request.query_params.get('employee') or request.query_params.get('employee_id')
        if not employee_id:
            return Response({'error': 'employee or employee_id is required.'}, status=400)

        try:
            payroll_run = _resolve_payroll_run_for_preview(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        except LookupError as exc:
            return Response({'error': str(exc)}, status=404)

        employee = Employee.objects.filter(pk=employee_id).first()
        if employee is None:
            return Response({'error': 'Employee not found.'}, status=404)

        try:
            payload = build_employee_report_payload(payroll_run, employee)
        except PayrollRun.employees.rel.related_model.DoesNotExist:
            return Response({'error': 'Employee is not part of the requested payroll run.'}, status=404)
        except Exception as exc:
            return Response({'error': str(exc)}, status=400)

        return Response(payload)


class PayrollReportsGenerateView(APIView):
    def post(self, request):
        try:
            payroll_run = _resolve_payroll_run_for_preview(request, explicit_run_id=request.data.get('run_id'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        except LookupError as exc:
            return Response({'error': str(exc)}, status=404)

        serializer = PayrollReportRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        employee = None
        employee_id = serializer.validated_data.get('employee_id')
        if employee_id is not None:
            employee = Employee.objects.filter(pk=employee_id).first()
            if employee is None:
                return Response({'error': 'Employee not found.'}, status=404)

        try:
            artifacts = generate_report_artifacts(payroll_run, serializer.validated_data['report_type'], employee)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        response_serializer = PayrollReportArtifactSerializer(artifacts, many=True, context={'request': request})
        return Response({'records': response_serializer.data}, status=201)