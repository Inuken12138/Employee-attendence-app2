import calendar
import hashlib
import json
import textwrap
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from .models import (
    AttendanceMonthlySummary,
    AttendanceRecord,
    ConstructionProject,
    ConstructionProjectSettlement,
    Employee,
    EmployeeCompensationProfile,
    EmployeePayrollAdjustment,
    EmployeePayrollCarryForwardBalance,
    EmployeePaidRestMonthlyBalance,
    EmployeePaidRestRequest,
    EmployeeRosterAssignment,
    PayrollComponent,
    PayrollCorrectionDelta,
    PayrollMonthlySummary,
    PayrollPolicy,
    PayrollReportArtifact,
    PayrollRun,
    PayrollRunEmployee,
)
from .utils import build_roster_schedule_lookup, normalize_clock_time, resolve_roster_day


MONEY_QUANTUM = Decimal('0.01')
DAYS_QUANTUM = Decimal('0.01')
DEFAULT_MORNING_START = '08:00'
DEFAULT_MORNING_END = '12:00'
DEFAULT_AFTERNOON_START = '13:00'
DEFAULT_AFTERNOON_END = '17:00'


@dataclass
class CompensationContext:
    profile: EmployeeCompensationProfile | None
    monthly_salary: Decimal
    rice_allowance_amount: Decimal
    social_security_allowance_amount: Decimal
    eligible_for_social_security: bool
    monthly_base_wage: Decimal
    policy: PayrollPolicy


def _decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None or value == '':
        return Decimal('0')
    return Decimal(str(value))


def _money(value) -> Decimal:
    return _decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _day_quantity(value) -> Decimal:
    return _decimal(value).quantize(DAYS_QUANTUM, rounding=ROUND_HALF_UP)


def _divide_decimal(numerator: Decimal, denominator: Decimal | int | float) -> Decimal:
    denominator_decimal = _decimal(denominator)
    if denominator_decimal == 0:
        return Decimal('0')
    return numerator / denominator_decimal


def _round_to_unit(amount: Decimal, unit_amount: int) -> Decimal:
    unit_decimal = _decimal(unit_amount)
    if unit_decimal <= 0:
        return _money(amount)
    rounded_units = (_decimal(amount) / unit_decimal).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return (rounded_units * unit_decimal).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _serialize_for_json(value):
    if isinstance(value, Decimal):
        return format(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP), 'f')
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _serialize_for_json(raw_value) for key, raw_value in value.items()}
    if isinstance(value, list):
        return [_serialize_for_json(item) for item in value]
    return value


def _parse_time_to_minutes(value: str) -> int | None:
    normalized_value = normalize_clock_time(value)
    if not normalized_value:
        return None

    hour_text, minute_text = normalized_value.split(':')
    return int(hour_text) * 60 + int(minute_text)


def _minutes_between(start_time: str, end_time: str) -> int:
    start_minutes = _parse_time_to_minutes(start_time)
    end_minutes = _parse_time_to_minutes(end_time)
    if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
        return 0
    return end_minutes - start_minutes


def _month_date_range(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _get_active_payroll_employees() -> list[Employee]:
    return list(Employee.objects.filter(is_active=True).order_by('name', 'id'))


def rebuild_paid_rest_balances(
    year: int,
    month: int,
    employee_ids: list[int] | None = None,
) -> list[EmployeePaidRestMonthlyBalance]:
    if month < 1 or month > 12:
        raise ValueError('Month must be between 1 and 12.')

    employees_queryset = Employee.objects.select_related('department').filter(is_active=True).order_by('name', 'id')
    if employee_ids is not None:
        employees_queryset = employees_queryset.filter(pk__in=employee_ids)

    employees = list(employees_queryset)
    if not employees:
        return []

    employee_id_list = [employee.id for employee in employees]
    previous_year, previous_month = _previous_month(year, 1)
    previous_december_balances = {
        balance.employee_id: balance
        for balance in EmployeePaidRestMonthlyBalance.objects.filter(
            employee_id__in=employee_id_list,
            year=previous_year,
            month=previous_month,
        )
    }
    existing_balances = {
        (balance.employee_id, balance.month): balance
        for balance in EmployeePaidRestMonthlyBalance.objects.filter(
            employee_id__in=employee_id_list,
            year=year,
            month__lte=month,
        )
    }

    approved_request_days = {}
    approved_request_counts = {}
    for paid_rest_request in EmployeePaidRestRequest.objects.filter(
        employee_id__in=employee_id_list,
        rest_date__year=year,
        rest_date__month__lte=month,
        submission_status='approved',
    ):
        request_key = (paid_rest_request.employee_id, paid_rest_request.rest_date.month)
        approved_request_days[request_key] = approved_request_days.get(request_key, Decimal('0')) + _day_quantity(
            paid_rest_request.paid_rest_days
        )
        approved_request_counts[request_key] = approved_request_counts.get(request_key, 0) + 1

    carried_opening_by_employee = {
        employee.id: _day_quantity(previous_december_balances.get(employee.id).closing_balance_days if employee.id in previous_december_balances else 0)
        for employee in employees
    }
    target_month_balances = []

    for month_index in range(1, month + 1):
        for employee in employees:
            department = employee.department
            opening_balance_days = _day_quantity(carried_opening_by_employee.get(employee.id, Decimal('0')))
            granted_days = _day_quantity(
                department.paid_rest_days_granted_per_month
                if department is not None and department.is_active and department.shop_paid_rest_enabled
                else 0
            )
            carry_forward_cap_days = _day_quantity(
                department.paid_rest_carry_forward_cap_days
                if department is not None
                else opening_balance_days + granted_days
            )
            used_days = _day_quantity(approved_request_days.get((employee.id, month_index), Decimal('0')))

            closing_balance_days = opening_balance_days + granted_days - used_days
            if closing_balance_days < 0:
                closing_balance_days = Decimal('0')
            closing_balance_days = min(closing_balance_days, carry_forward_cap_days)

            should_persist = bool(department) or opening_balance_days > 0 or granted_days > 0 or used_days > 0 or (employee.id, month_index) in existing_balances
            carried_opening_by_employee[employee.id] = _day_quantity(closing_balance_days)
            if not should_persist:
                continue

            balance, _ = EmployeePaidRestMonthlyBalance.objects.update_or_create(
                employee=employee,
                year=year,
                month=month_index,
                defaults={
                    'department': department,
                    'opening_balance_days': opening_balance_days,
                    'granted_days': granted_days,
                    'used_days': used_days,
                    'closing_balance_days': _day_quantity(closing_balance_days),
                    'carry_forward_cap_days': carry_forward_cap_days,
                    'calc_snapshot': _serialize_for_json(
                        {
                            'department_id': department.id if department is not None else None,
                            'department_name': department.name if department is not None else None,
                            'shop_paid_rest_enabled': bool(department and department.shop_paid_rest_enabled),
                            'approved_request_count': approved_request_counts.get((employee.id, month_index), 0),
                        }
                    ),
                },
            )
            if month_index == month:
                target_month_balances.append(balance)

    return target_month_balances


def ensure_finalized_attendance_coverage(year: int, month: int, employees: list[Employee] | None = None) -> AttendanceRecord:
    payroll_employees = employees if employees is not None else _get_active_payroll_employees()
    final_record = AttendanceRecord.objects.filter(year=year, month=month, status='final').first()
    if final_record is None:
        raise ValueError('Finalize attendance for this month before generating payroll or rebuilding payroll summaries.')

    covered_employee_ids = set(
        final_record.employees.exclude(employee_id__isnull=True).values_list('employee_id', flat=True)
    )
    missing_employees = [employee for employee in payroll_employees if employee.id not in covered_employee_ids]
    if missing_employees:
        missing_labels = ', '.join((employee.worker_id or employee.name) for employee in missing_employees[:10])
        remainder_count = len(missing_employees) - 10
        remainder_label = '' if remainder_count <= 0 else f' and {remainder_count} more'
        raise ValueError(
            'Finalize attendance for all active employees before generating payroll. '
            f'Missing attendance coverage for: {missing_labels}{remainder_label}.'
        )

    return final_record


def _next_month(year: int, month: int) -> tuple[int, int]:
    if month == 12:
        return year + 1, 1
    return year, month + 1


def get_active_payroll_policy(year: int, month: int, policy_id: int | None = None) -> PayrollPolicy:
    target_date = date(year, month, 1)
    queryset = PayrollPolicy.objects.all()
    if policy_id is not None:
        queryset = queryset.filter(pk=policy_id)
    else:
        queryset = queryset.filter(status='active', is_active=True)

    policy = queryset.filter(
        effective_from__lte=target_date,
    ).filter(
        effective_to__isnull=True,
    ).order_by('-effective_from', '-version_number').first()

    if policy is None:
        policy = queryset.filter(
            effective_from__lte=target_date,
            effective_to__gte=target_date,
        ).order_by('-effective_from', '-version_number').first()

    if policy is None:
        policy = queryset.order_by('-effective_from', '-version_number').first()

    if policy is None:
        raise ValueError('No payroll policy is configured yet.')

    return policy


def resolve_employee_compensation(employee: Employee, period_date: date, default_policy: PayrollPolicy) -> CompensationContext:
    profile = employee.compensation_profiles.filter(
        effective_from__lte=period_date,
    ).filter(
        Q(effective_to__isnull=True) | Q(effective_to__gte=period_date)
    ).select_related('payroll_policy').order_by('-effective_from', '-id').first()

    policy = profile.payroll_policy if profile and profile.payroll_policy else default_policy
    monthly_salary = _money(profile.monthly_salary if profile else employee.base_salary)
    rice_allowance_amount = _money(
        profile.rice_allowance_amount if profile and profile.rice_allowance_amount is not None else policy.rice_allowance_amount
    )
    social_security_allowance_amount = _money(
        profile.social_security_allowance_amount
        if profile and profile.social_security_allowance_amount is not None
        else policy.social_security_allowance_amount
    )
    eligible_for_social_security = True
    if profile is not None:
        eligible_for_social_security = profile.eligible_for_social_security
        if profile.trial_period_end_date and period_date <= profile.trial_period_end_date:
            eligible_for_social_security = False

    monthly_base_wage = monthly_salary + rice_allowance_amount
    if eligible_for_social_security:
        monthly_base_wage += social_security_allowance_amount

    return CompensationContext(
        profile=profile,
        monthly_salary=monthly_salary,
        rice_allowance_amount=rice_allowance_amount,
        social_security_allowance_amount=social_security_allowance_amount,
        eligible_for_social_security=eligible_for_social_security,
        monthly_base_wage=_money(monthly_base_wage),
        policy=policy,
    )


def _default_roster_day(target_date: date, policy: PayrollPolicy) -> dict:
    half_day_minutes = int((_decimal(policy.normal_work_hours_per_day) * Decimal('60')) / Decimal('2'))
    afternoon_end_minutes = _parse_time_to_minutes(DEFAULT_AFTERNOON_START) + half_day_minutes
    afternoon_end_hour = afternoon_end_minutes // 60
    afternoon_end_minute = afternoon_end_minutes % 60
    return {
        'is_working': target_date.weekday() < 6,
        'morning_in': DEFAULT_MORNING_START,
        'morning_out': DEFAULT_MORNING_END,
        'afternoon_in': DEFAULT_AFTERNOON_START,
        'afternoon_out': f'{afternoon_end_hour:02d}:{afternoon_end_minute:02d}',
    }


def _resolve_employee_roster_day(employee: Employee, target_date: date, policy: PayrollPolicy) -> dict:
    try:
        assignment = employee.roster_assignment
    except EmployeeRosterAssignment.DoesNotExist:
        assignment = None

    if assignment is None or assignment.template is None:
        return _default_roster_day(target_date, policy)

    try:
        schedule_lookup = build_roster_schedule_lookup(assignment.template.schedule, assignment.template.cycle_length_weeks)
    except ValueError:
        return _default_roster_day(target_date, policy)

    roster_day = resolve_roster_day(
        schedule_lookup,
        assignment.template.cycle_length_weeks,
        assignment.effective_start_date,
        target_date,
    )
    return roster_day or _default_roster_day(target_date, policy)


def _build_attendance_record_employee_map(record: AttendanceRecord | None) -> dict[int, object]:
    if record is None:
        return {}

    attendance_map = {}
    for record_employee in record.employees.select_related('employee').prefetch_related('shifts'):
        if record_employee.employee_id:
            attendance_map[record_employee.employee_id] = record_employee
    return attendance_map


def rebuild_attendance_summaries(year: int, month: int, employee_ids: list[int] | None = None, policy: PayrollPolicy | None = None) -> list[AttendanceMonthlySummary]:
    selected_policy = policy or get_active_payroll_policy(year, month)
    target_start_date, target_end_date = _month_date_range(year, month)
    employees_queryset = Employee.objects.filter(is_active=True).order_by('name', 'id')
    if employee_ids is not None:
        employees_queryset = employees_queryset.filter(pk__in=employee_ids)

    employees = list(employees_queryset)
    final_record = ensure_finalized_attendance_coverage(year, month, employees)
    attendance_map = _build_attendance_record_employee_map(final_record)
    summaries = []

    for employee in employees:
        summary_defaults = {
            'scheduled_work_days': 0,
            'actual_present_days': 0,
            'scheduled_minutes_total': 0,
            'worked_minutes_total': 0,
            'late_minutes_total': 0,
            'absent_minutes_total': 0,
            'paid_rest_minutes_total': 0,
            'approved_leave_minutes_total': 0,
            'unapproved_leave_minutes_total': 0,
            'potential_ot_minutes_total': 0,
            'approved_ot_minutes_total': 0,
            'denied_ot_minutes_total': 0,
            'full_attendance_eligible': False,
            'disciplinary_flags_json': {},
        }
        record_employee = attendance_map.get(employee.id)
        day_map = {}
        if record_employee is not None:
            for shift in record_employee.shifts.all():
                day_map[shift.day] = shift

        grace_minutes = int(selected_policy.late_grace_minutes or 0)
        actual_present_days = set()
        scheduled_work_days = 0
        scheduled_minutes_total = 0
        worked_minutes_total = 0
        late_minutes_total = 0
        absent_minutes_total = 0
        paid_rest_minutes_total = 0

        current_day = target_start_date
        while current_day <= target_end_date:
            roster_day = _resolve_employee_roster_day(employee, current_day, selected_policy)
            shift_record = day_map.get(current_day.day)
            if roster_day.get('is_working'):
                day_scheduled_minutes = 0
                for shift_key in ('morning', 'afternoon'):
                    scheduled_start = roster_day.get(f'{shift_key}_in') or ''
                    scheduled_end = roster_day.get(f'{shift_key}_out') or ''
                    scheduled_minutes = _minutes_between(scheduled_start, scheduled_end)
                    day_scheduled_minutes += scheduled_minutes

                    status = getattr(shift_record, f'{shift_key}_status', 'missing') if shift_record is not None else 'missing'
                    if status == 'present':
                        actual_in = getattr(shift_record, f'{shift_key}_in', '')
                        actual_out = getattr(shift_record, f'{shift_key}_out', '')
                        worked_minutes_total += _minutes_between(actual_in, actual_out)
                        actual_present_days.add(current_day.isoformat())
                        actual_in_minutes = _parse_time_to_minutes(actual_in)
                        scheduled_in_minutes = _parse_time_to_minutes(scheduled_start)
                        if actual_in_minutes is not None and scheduled_in_minutes is not None and actual_in_minutes > scheduled_in_minutes:
                            late_minutes_total += max(actual_in_minutes - scheduled_in_minutes - grace_minutes, 0)
                    elif status == 'paid_rest':
                        paid_rest_minutes_total += scheduled_minutes
                    elif status == 'absent':
                        absent_minutes_total += scheduled_minutes

                if day_scheduled_minutes > 0:
                    scheduled_work_days += 1
                    scheduled_minutes_total += day_scheduled_minutes

            current_day += timedelta(days=1)

        leave_records = list(
            employee.leave_records.filter(
                leave_date__year=year,
                leave_date__month=month,
            ).order_by('leave_date', 'id')
        )
        approved_leave_minutes_total = sum(
            leave_record.leave_minutes for leave_record in leave_records if leave_record.submission_status == 'approved'
        )
        unapproved_leave_minutes_total = sum(
            leave_record.leave_minutes for leave_record in leave_records if leave_record.submission_status == 'recorded_unapproved'
        )
        unapproved_full_day_incidents = sum(
            1
            for leave_record in leave_records
            if leave_record.submission_status == 'recorded_unapproved'
            and leave_record.leave_minutes >= int(_decimal(selected_policy.normal_work_hours_per_day) * Decimal('60'))
        )

        overtime_decisions = employee.overtime_decisions.filter(
            attendance_date__year=year,
            attendance_date__month=month,
        )
        potential_ot_minutes_total = sum(decision.potential_ot_minutes for decision in overtime_decisions)
        approved_ot_minutes_total = sum(decision.approved_ot_minutes for decision in overtime_decisions)
        denied_ot_minutes_total = sum(decision.denied_ot_minutes for decision in overtime_decisions)

        full_attendance_eligible = bool(final_record) and all(
            [
                late_minutes_total == 0,
                absent_minutes_total == 0,
                approved_leave_minutes_total == 0,
                unapproved_leave_minutes_total == 0,
            ]
        )

        disciplinary_flags = {
            'unapproved_full_day_incidents': unapproved_full_day_incidents,
            'termination_review_alert': unapproved_full_day_incidents >= selected_policy.unapproved_absence_incident_threshold,
        }

        summary, _ = AttendanceMonthlySummary.objects.update_or_create(
            employee=employee,
            year=year,
            month=month,
            defaults={
                'scheduled_work_days': scheduled_work_days,
                'actual_present_days': len(actual_present_days),
                'scheduled_minutes_total': scheduled_minutes_total,
                'worked_minutes_total': worked_minutes_total,
                'late_minutes_total': late_minutes_total,
                'absent_minutes_total': absent_minutes_total,
                'paid_rest_minutes_total': paid_rest_minutes_total,
                'approved_leave_minutes_total': approved_leave_minutes_total,
                'unapproved_leave_minutes_total': unapproved_leave_minutes_total,
                'potential_ot_minutes_total': potential_ot_minutes_total,
                'approved_ot_minutes_total': approved_ot_minutes_total,
                'denied_ot_minutes_total': denied_ot_minutes_total,
                'full_attendance_eligible': full_attendance_eligible,
                'disciplinary_flags_json': disciplinary_flags,
            },
        )
        summaries.append(summary)

    return summaries


def _build_adjustment_totals(year: int, month: int) -> dict[int, Decimal]:
    totals = {}
    queryset = EmployeePayrollAdjustment.objects.filter(
        year=year,
        month=month,
        approval_status='approved',
    )
    for adjustment in queryset:
        totals.setdefault(adjustment.employee_id, Decimal('0'))
        totals[adjustment.employee_id] += _decimal(adjustment.amount)
    return totals


def _build_settlement_totals(year: int, month: int) -> dict[int, Decimal]:
    totals = {}
    queryset = ConstructionProjectSettlement.objects.filter(
        settled_to_year=year,
        settled_to_month=month,
    )
    for settlement in queryset:
        totals.setdefault(settlement.employee_id, Decimal('0'))
        totals[settlement.employee_id] += _decimal(settlement.bonus_share_amount)
    return totals


def _build_carry_forward_totals(year: int, month: int) -> dict[int, Decimal]:
    totals = {}
    queryset = EmployeePayrollCarryForwardBalance.objects.filter(
        status__in=('open', 'partially_applied'),
    )
    for balance in queryset:
        if (balance.apply_from_year, balance.apply_from_month) > (year, month):
            continue
        totals.setdefault(balance.employee_id, Decimal('0'))
        totals[balance.employee_id] += _decimal(balance.remaining_amount)
    return totals


def _build_previous_run_employee_map(payroll_run: PayrollRun | None) -> dict[int, PayrollRunEmployee]:
    if payroll_run is None:
        return {}
    return {
        payroll_run_employee.employee_id: payroll_run_employee
        for payroll_run_employee in payroll_run.employees.all()
    }


def _component_payloads(
    attendance_summary: AttendanceMonthlySummary,
    monthly_base_wage: Decimal,
    attendance_bonus_amount: Decimal,
    deduction_amount: Decimal,
    overtime_pay_amount: Decimal,
    manual_adjustments_amount: Decimal,
    project_bonus_amount: Decimal,
    carry_forward_recovery_amount: Decimal,
    rounding_adjustment_amount: Decimal,
):
    return [
        {
            'component_type': 'base_wage',
            'code': 'monthly_base_wage',
            'label': 'Monthly base wage',
            'amount': monthly_base_wage,
            'display_order': 10,
        },
        {
            'component_type': 'attendance_bonus',
            'code': 'full_attendance_bonus',
            'label': 'Full attendance bonus',
            'amount': attendance_bonus_amount,
            'display_order': 20,
        },
        {
            'component_type': 'deduction',
            'code': 'deduction_amount',
            'label': 'Deduction amount',
            'amount': -deduction_amount,
            'quantity': attendance_summary.late_minutes_total + attendance_summary.absent_minutes_total + attendance_summary.approved_leave_minutes_total + attendance_summary.unapproved_leave_minutes_total,
            'display_order': 30,
        },
        {
            'component_type': 'overtime',
            'code': 'approved_overtime_pay',
            'label': 'Approved overtime pay',
            'amount': overtime_pay_amount,
            'quantity': attendance_summary.approved_ot_minutes_total,
            'display_order': 40,
        },
        {
            'component_type': 'adjustment',
            'code': 'manual_adjustments',
            'label': 'Manual adjustments',
            'amount': manual_adjustments_amount,
            'display_order': 50,
        },
        {
            'component_type': 'project_bonus',
            'code': 'project_bonus',
            'label': 'Project bonus',
            'amount': project_bonus_amount,
            'display_order': 60,
        },
        {
            'component_type': 'carry_forward',
            'code': 'carry_forward_recovery',
            'label': 'Carry-forward recovery',
            'amount': -carry_forward_recovery_amount,
            'display_order': 70,
        },
        {
            'component_type': 'rounding',
            'code': 'rounding_adjustment',
            'label': 'Rounding adjustment',
            'amount': rounding_adjustment_amount,
            'display_order': 80,
            'notes': 'Rounded to the nearest thousand kip.',
        },
    ]


@transaction.atomic
def generate_payroll_run(
    year: int,
    month: int,
    run_type: str = 'normal',
    policy_id: int | None = None,
    notes: str = '',
    acting_user=None,
    existing_run: PayrollRun | None = None,
    source_run: PayrollRun | None = None,
) -> PayrollRun:
    policy = source_run.policy_used if source_run is not None else get_active_payroll_policy(year, month, policy_id)

    if source_run is not None and (source_run.year != year or source_run.month != month):
        raise ValueError('Correction runs must use the same year and month as the source payroll run.')

    payroll_run = existing_run
    if payroll_run is None:
        if run_type == 'normal':
            payroll_run = PayrollRun.objects.filter(
                year=year,
                month=month,
                run_type='normal',
                status__in=('draft', 'review', 'approved'),
            ).first()
            if payroll_run is None and PayrollRun.objects.filter(
                year=year,
                month=month,
                run_type='normal',
                status__in=('locked', 'paid'),
            ).exists():
                raise ValueError('A locked normal payroll run already exists for this month. Create a correction run instead.')
        if payroll_run is None:
            payroll_run = PayrollRun.objects.create(
                year=year,
                month=month,
                run_type=run_type,
                status='draft',
                policy_used=policy,
                created_by_user=acting_user if getattr(acting_user, 'is_authenticated', False) else None,
                notes=notes,
                parent_run=source_run,
                supersedes_run=source_run,
            )
    else:
        if payroll_run.status in ('locked', 'paid'):
            raise ValueError('Locked payroll runs cannot be regenerated.')
        payroll_run.notes = notes or payroll_run.notes
        payroll_run.policy_used = policy
        payroll_run.status = 'draft'
        payroll_run.approved_by_user = None
        payroll_run.authorized_by_user = None
        payroll_run.locked_at = None
        payroll_run.save(
            update_fields=[
                'notes',
                'policy_used',
                'status',
                'approved_by_user',
                'authorized_by_user',
                'locked_at',
                'updated_at',
            ]
        )

    payroll_run.employees.all().delete()
    PayrollMonthlySummary.objects.filter(payroll_run=payroll_run).delete()
    PayrollReportArtifact.objects.filter(payroll_run=payroll_run).delete()
    if payroll_run.run_type == 'correction':
        PayrollCorrectionDelta.objects.filter(current_run=payroll_run).delete()

    target_date = date(year, month, 1)
    summaries = rebuild_attendance_summaries(year, month, policy=policy)
    summary_map = {summary.employee_id: summary for summary in summaries}
    employees = _get_active_payroll_employees()
    adjustment_totals = _build_adjustment_totals(year, month)
    settlement_totals = _build_settlement_totals(year, month)
    carry_forward_totals = _build_carry_forward_totals(year, month)
    previous_run_employee_map = _build_previous_run_employee_map(source_run or payroll_run.parent_run)

    run_entries = []
    for employee in employees:
        attendance_summary = summary_map.get(employee.id)
        if attendance_summary is None:
            attendance_summary = AttendanceMonthlySummary.objects.create(
                employee=employee,
                year=year,
                month=month,
            )

        compensation = resolve_employee_compensation(employee, target_date, policy)
        daily_salary_rate = _divide_decimal(compensation.monthly_base_wage, compensation.policy.salary_days_per_month)
        hourly_wage = _divide_decimal(daily_salary_rate, compensation.policy.normal_work_hours_per_day)
        deductible_minutes_total = (
            attendance_summary.late_minutes_total
            + attendance_summary.absent_minutes_total
            + attendance_summary.approved_leave_minutes_total
            + attendance_summary.unapproved_leave_minutes_total
        )
        deduction_amount = _money(_divide_decimal(_decimal(deductible_minutes_total), 60) * hourly_wage)
        overtime_pay_amount = _money(
            _divide_decimal(_decimal(attendance_summary.approved_ot_minutes_total), 60)
            * hourly_wage
            * _decimal(compensation.policy.overtime_multiplier)
        )
        attendance_bonus_amount = _money(
            compensation.policy.full_attendance_bonus_amount if attendance_summary.full_attendance_eligible else 0
        )
        manual_adjustments_amount = _money(adjustment_totals.get(employee.id, Decimal('0')))
        project_bonus_amount = _money(settlement_totals.get(employee.id, Decimal('0')))
        carry_forward_recovery_amount = _money(carry_forward_totals.get(employee.id, Decimal('0')))
        gross_before_rounding_amount = _money(
            compensation.monthly_base_wage
            + attendance_bonus_amount
            + overtime_pay_amount
            - deduction_amount
            + manual_adjustments_amount
            + project_bonus_amount
            - carry_forward_recovery_amount
        )
        gross_payable_amount = _round_to_unit(gross_before_rounding_amount, compensation.policy.rounding_unit_amount)
        rounding_adjustment_amount = _money(gross_payable_amount - gross_before_rounding_amount)
        previous_run_employee = previous_run_employee_map.get(employee.id)
        previous_run_delta_amount = None
        if previous_run_employee is not None:
            previous_run_delta_amount = _money(gross_payable_amount - _decimal(previous_run_employee.gross_payable_amount))

        calc_snapshot = {
            'monthly_salary': compensation.monthly_salary,
            'rice_allowance_amount': compensation.rice_allowance_amount,
            'social_security_allowance_amount': compensation.social_security_allowance_amount,
            'eligible_for_social_security': compensation.eligible_for_social_security,
            'monthly_base_wage': compensation.monthly_base_wage,
            'daily_salary_rate': _money(daily_salary_rate),
            'hourly_wage': _money(hourly_wage),
            'deductible_minutes_total': deductible_minutes_total,
            'attendance_summary': {
                'late_minutes_total': attendance_summary.late_minutes_total,
                'absent_minutes_total': attendance_summary.absent_minutes_total,
                'paid_rest_minutes_total': attendance_summary.paid_rest_minutes_total,
                'approved_leave_minutes_total': attendance_summary.approved_leave_minutes_total,
                'unapproved_leave_minutes_total': attendance_summary.unapproved_leave_minutes_total,
                'approved_ot_minutes_total': attendance_summary.approved_ot_minutes_total,
                'denied_ot_minutes_total': attendance_summary.denied_ot_minutes_total,
                'full_attendance_eligible': attendance_summary.full_attendance_eligible,
                'disciplinary_flags_json': attendance_summary.disciplinary_flags_json,
            },
            'attendance_bonus_amount': attendance_bonus_amount,
            'deduction_amount': deduction_amount,
            'overtime_pay_amount': overtime_pay_amount,
            'manual_adjustments_amount': manual_adjustments_amount,
            'project_bonus_amount': project_bonus_amount,
            'carry_forward_recovery_amount': carry_forward_recovery_amount,
            'gross_before_rounding_amount': gross_before_rounding_amount,
            'rounding_adjustment_amount': rounding_adjustment_amount,
            'gross_payable_amount': gross_payable_amount,
        }

        payroll_run_employee = PayrollRunEmployee.objects.create(
            payroll_run=payroll_run,
            employee=employee,
            monthly_base_wage_amount=compensation.monthly_base_wage,
            attendance_bonus_amount=attendance_bonus_amount,
            late_minutes_total=attendance_summary.late_minutes_total,
            absent_minutes_total=attendance_summary.absent_minutes_total,
            paid_rest_minutes_total=attendance_summary.paid_rest_minutes_total,
            approved_leave_minutes_total=attendance_summary.approved_leave_minutes_total,
            unapproved_leave_minutes_total=attendance_summary.unapproved_leave_minutes_total,
            approved_ot_minutes_total=attendance_summary.approved_ot_minutes_total,
            denied_ot_minutes_total=attendance_summary.denied_ot_minutes_total,
            deduction_amount=deduction_amount,
            overtime_pay_amount=overtime_pay_amount,
            project_bonus_amount=project_bonus_amount,
            manual_adjustments_amount=manual_adjustments_amount,
            carry_forward_recovery_amount=carry_forward_recovery_amount,
            gross_before_rounding_amount=gross_before_rounding_amount,
            rounding_adjustment_amount=rounding_adjustment_amount,
            gross_payable_amount=gross_payable_amount,
            previous_run_delta_amount=previous_run_delta_amount,
            calc_snapshot=_serialize_for_json(calc_snapshot),
        )

        for component_payload in _component_payloads(
            attendance_summary,
            compensation.monthly_base_wage,
            attendance_bonus_amount,
            deduction_amount,
            overtime_pay_amount,
            manual_adjustments_amount,
            project_bonus_amount,
            carry_forward_recovery_amount,
            rounding_adjustment_amount,
        ):
            PayrollComponent.objects.create(payroll_run_employee=payroll_run_employee, **component_payload)

        run_entries.append(payroll_run_employee)

    monthly_summary_defaults = {
        'headcount_paid': len(run_entries),
        'total_monthly_base_wages': _money(sum(_decimal(entry.monthly_base_wage_amount) for entry in run_entries)),
        'total_attendance_bonus_amount': _money(sum(_decimal(entry.attendance_bonus_amount) for entry in run_entries)),
        'total_deduction_amount': _money(sum(_decimal(entry.deduction_amount) for entry in run_entries)),
        'total_approved_overtime_pay_amount': _money(sum(_decimal(entry.overtime_pay_amount) for entry in run_entries)),
        'total_project_bonus_amount': _money(sum(_decimal(entry.project_bonus_amount) for entry in run_entries)),
        'total_manual_adjustments_amount': _money(sum(_decimal(entry.manual_adjustments_amount) for entry in run_entries)),
        'total_carry_forward_recovery_amount': _money(sum(_decimal(entry.carry_forward_recovery_amount) for entry in run_entries)),
        'total_gross_before_rounding_amount': _money(sum(_decimal(entry.gross_before_rounding_amount) for entry in run_entries)),
        'total_rounding_adjustment_amount': _money(sum(_decimal(entry.rounding_adjustment_amount) for entry in run_entries)),
        'total_gross_payable_amount': _money(sum(_decimal(entry.gross_payable_amount) for entry in run_entries)),
        'total_late_minutes': sum(entry.late_minutes_total for entry in run_entries),
        'total_absent_minutes': sum(entry.absent_minutes_total for entry in run_entries),
        'total_leave_minutes': sum(entry.approved_leave_minutes_total + entry.unapproved_leave_minutes_total for entry in run_entries),
        'total_paid_rest_minutes': sum(entry.paid_rest_minutes_total for entry in run_entries),
        'total_approved_ot_minutes': sum(entry.approved_ot_minutes_total for entry in run_entries),
        'trend_snapshot_json': {
            'year': year,
            'month': month,
            'headcount_paid': len(run_entries),
        },
    }
    PayrollMonthlySummary.objects.update_or_create(payroll_run=payroll_run, defaults=monthly_summary_defaults)

    if payroll_run.run_type == 'correction' and (source_run or payroll_run.parent_run):
        build_correction_deltas(payroll_run, source_run or payroll_run.parent_run)

    return payroll_run


@transaction.atomic
def build_correction_deltas(current_run: PayrollRun, previous_run: PayrollRun):
    PayrollCorrectionDelta.objects.filter(current_run=current_run).delete()
    EmployeePayrollCarryForwardBalance.objects.filter(origin_correction_delta__current_run=current_run).delete()

    previous_entries = _build_previous_run_employee_map(previous_run)
    current_entries = _build_previous_run_employee_map(current_run)
    employee_ids = sorted(set(previous_entries.keys()) | set(current_entries.keys()))
    deltas = []
    next_year, next_month = _next_month(current_run.year, current_run.month)

    for employee_id in employee_ids:
        previous_amount = _money(previous_entries.get(employee_id).gross_payable_amount if employee_id in previous_entries else 0)
        corrected_amount = _money(current_entries.get(employee_id).gross_payable_amount if employee_id in current_entries else 0)
        delta_amount = _money(corrected_amount - previous_amount)
        if delta_amount > 0:
            delta_direction = 'employer_owes_employee'
            settlement_strategy = 'pay_now'
        elif delta_amount < 0:
            delta_direction = 'employee_owes_employer'
            settlement_strategy = 'carry_forward_recovery'
        else:
            delta_direction = 'no_change'
            settlement_strategy = 'none'

        employee = current_entries.get(employee_id).employee if employee_id in current_entries else previous_entries[employee_id].employee
        correction_delta = PayrollCorrectionDelta.objects.create(
            current_run=current_run,
            previous_run=previous_run,
            employee=employee,
            previous_gross_payable_amount=previous_amount,
            corrected_gross_payable_amount=corrected_amount,
            delta_amount=delta_amount,
            delta_direction=delta_direction,
            settlement_strategy=settlement_strategy,
            notes='',
        )
        deltas.append(correction_delta)

        if settlement_strategy == 'carry_forward_recovery':
            EmployeePayrollCarryForwardBalance.objects.create(
                employee=employee,
                origin_correction_delta=correction_delta,
                amount=abs(delta_amount),
                apply_from_year=next_year,
                apply_from_month=next_month,
                remaining_amount=abs(delta_amount),
            )

    return deltas


@transaction.atomic
def approve_payroll_run(payroll_run: PayrollRun, acting_user=None) -> PayrollRun:
    payroll_run.status = 'approved'
    payroll_run.approved_by_user = acting_user if getattr(acting_user, 'is_authenticated', False) else None
    payroll_run.save(update_fields=['status', 'approved_by_user', 'updated_at'])
    return payroll_run


@transaction.atomic
def lock_payroll_run(payroll_run: PayrollRun, acting_user=None) -> PayrollRun:
    payroll_run.status = 'locked'
    payroll_run.authorized_by_user = acting_user if getattr(acting_user, 'is_authenticated', False) else None
    payroll_run.locked_at = timezone.now()
    payroll_run.save(update_fields=['status', 'authorized_by_user', 'locked_at', 'updated_at'])

    for payroll_run_employee in payroll_run.employees.all():
        balances = EmployeePayrollCarryForwardBalance.objects.filter(
            employee=payroll_run_employee.employee,
            status__in=('open', 'partially_applied'),
        )
        for balance in balances:
            if (balance.apply_from_year, balance.apply_from_month) > (payroll_run.year, payroll_run.month):
                continue
            balance.remaining_amount = Decimal('0')
            balance.status = 'closed'
            balance.save(update_fields=['remaining_amount', 'status', 'updated_at'])

    return payroll_run


def settle_project_bonus(project: ConstructionProject, settled_to_year: int, settled_to_month: int) -> dict:
    policy = get_active_payroll_policy(settled_to_year, settled_to_month)
    project.labor_pool_amount = _money(_decimal(project.revenue_amount) * _decimal(project.labor_pool_percent or policy.labor_pool_percent))
    project.save(update_fields=['labor_pool_amount', 'updated_at'])

    logs = list(project.work_logs.select_related('employee').order_by('work_date', 'employee_id', 'id'))
    employee_spend = {}
    employee_hours = {}
    total_actual_labor_cost_spend = Decimal('0')
    normal_work_hours = _decimal(policy.normal_work_hours_per_day)

    for work_log in logs:
        if work_log.quantity_unit == 'day':
            normalized_hours = normal_work_hours * _decimal(work_log.quantity_value)
        elif work_log.quantity_unit == 'half_day':
            normalized_hours = (normal_work_hours / Decimal('2')) * _decimal(work_log.quantity_value)
        else:
            normalized_hours = _decimal(work_log.quantity_value)

        day_equivalent = _divide_decimal(normalized_hours, normal_work_hours)
        compensation = resolve_employee_compensation(work_log.employee, work_log.work_date, policy)
        daily_salary_rate = _money(_divide_decimal(compensation.monthly_base_wage, compensation.policy.salary_days_per_month))
        labor_cost = _money(daily_salary_rate * day_equivalent)

        work_log.normalized_hours = normalized_hours.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
        work_log.day_equivalent = day_equivalent.quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        work_log.daily_salary_rate_snapshot = daily_salary_rate
        work_log.save(update_fields=['normalized_hours', 'day_equivalent', 'daily_salary_rate_snapshot', 'updated_at'])

        employee_hours.setdefault(work_log.employee_id, Decimal('0'))
        employee_hours[work_log.employee_id] += normalized_hours
        employee_spend.setdefault(work_log.employee_id, Decimal('0'))
        employee_spend[work_log.employee_id] += labor_cost
        total_actual_labor_cost_spend += labor_cost

    remaining_bonus_pool = max(project.labor_pool_amount - total_actual_labor_cost_spend, Decimal('0'))
    project.status = 'settled'
    if project.completed_date is None:
        project.completed_date = date(settled_to_year, settled_to_month, 1)
    project.save(update_fields=['status', 'completed_date', 'updated_at'])

    settlements = []
    for assignment in project.assignments.select_related('employee').all():
        employee_labor_cost = employee_spend.get(assignment.employee_id, Decimal('0'))
        employee_reserved_hours = employee_hours.get(assignment.employee_id, Decimal('0'))
        employee_day_equivalent = _divide_decimal(employee_reserved_hours, normal_work_hours)
        weight_ratio = _divide_decimal(employee_labor_cost, total_actual_labor_cost_spend) if total_actual_labor_cost_spend > 0 else Decimal('0')
        bonus_share_amount = _money(remaining_bonus_pool * weight_ratio)
        settlement, _ = ConstructionProjectSettlement.objects.update_or_create(
            project=project,
            employee=assignment.employee,
            defaults={
                'employee_project_reserved_hours': employee_reserved_hours.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP),
                'employee_project_day_equivalent': employee_day_equivalent.quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP),
                'employee_project_labor_cost_amount': _money(employee_labor_cost),
                'total_actual_labor_cost_spend_snapshot': _money(total_actual_labor_cost_spend),
                'weight_ratio': weight_ratio.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP),
                'bonus_share_amount': bonus_share_amount,
                'settled_to_year': settled_to_year,
                'settled_to_month': settled_to_month,
                'snapshot': _serialize_for_json(
                    {
                        'labor_pool_amount': project.labor_pool_amount,
                        'remaining_bonus_pool': remaining_bonus_pool,
                        'total_actual_labor_cost_spend': total_actual_labor_cost_spend,
                    }
                ),
            },
        )
        settlements.append(settlement)

    return {
        'project': project,
        'settlements': settlements,
        'labor_pool_amount': _money(project.labor_pool_amount),
        'total_actual_labor_cost_spend': _money(total_actual_labor_cost_spend),
        'remaining_bonus_pool': _money(remaining_bonus_pool),
    }


def _artifact_relative_path(payroll_run: PayrollRun, report_type: str, format_name: str, employee: Employee | None = None) -> str:
    employee_token = f'-employee-{employee.id}' if employee is not None else ''
    return str(Path('payroll_reports') / f'run-{payroll_run.id}' / f'{report_type}{employee_token}.{format_name}')


def _artifact_absolute_path(relative_path: str) -> Path:
    return Path(settings.MEDIA_ROOT) / relative_path


def _public_media_path(relative_path: str) -> str:
    return f'{settings.MEDIA_URL}{relative_path}'.replace('//', '/')


def build_employee_report_payload(payroll_run: PayrollRun, employee: Employee) -> dict:
    payroll_entry = payroll_run.employees.select_related('employee').prefetch_related('components').get(employee=employee)
    summary = AttendanceMonthlySummary.objects.filter(employee=employee, year=payroll_run.year, month=payroll_run.month).first()
    leave_records = list(
        employee.leave_records.filter(leave_date__year=payroll_run.year, leave_date__month=payroll_run.month).order_by('leave_date', 'id')
    )
    overtime_decisions = list(
        employee.overtime_decisions.filter(attendance_date__year=payroll_run.year, attendance_date__month=payroll_run.month).order_by('attendance_date', 'attendance_shift')
    )

    return {
        'report_title': f'Employee payroll report - {employee.name}',
        'employee': {
            'id': employee.id,
            'name': employee.name,
            'worker_id': employee.worker_id,
        },
        'payroll_run': {
            'id': payroll_run.id,
            'year': payroll_run.year,
            'month': payroll_run.month,
            'run_type': payroll_run.run_type,
            'status': payroll_run.status,
        },
        'attendance_summary': _serialize_for_json(
            {
                'late_minutes_total': summary.late_minutes_total if summary else 0,
                'absent_minutes_total': summary.absent_minutes_total if summary else 0,
                'approved_leave_minutes_total': summary.approved_leave_minutes_total if summary else 0,
                'unapproved_leave_minutes_total': summary.unapproved_leave_minutes_total if summary else 0,
                'approved_ot_minutes_total': summary.approved_ot_minutes_total if summary else 0,
                'denied_ot_minutes_total': summary.denied_ot_minutes_total if summary else 0,
                'full_attendance_eligible': summary.full_attendance_eligible if summary else False,
            }
        ),
        'leave_records': _serialize_for_json(
            [
                {
                    'leave_date': leave_record.leave_date,
                    'submission_status': leave_record.submission_status,
                    'leave_minutes': leave_record.leave_minutes,
                    'employee_reason': leave_record.employee_reason,
                    'manager_note': leave_record.manager_note,
                }
                for leave_record in leave_records
            ]
        ),
        'overtime_decisions': _serialize_for_json(
            [
                {
                    'attendance_date': decision.attendance_date,
                    'attendance_shift': decision.attendance_shift,
                    'approved_ot_minutes': decision.approved_ot_minutes,
                    'denied_ot_minutes': decision.denied_ot_minutes,
                    'status': decision.status,
                    'decision_reason': decision.decision_reason,
                }
                for decision in overtime_decisions
            ]
        ),
        'components': _serialize_for_json(
            [
                {
                    'label': component.label,
                    'amount': component.amount,
                    'code': component.code,
                    'notes': component.notes,
                }
                for component in payroll_entry.components.all()
            ]
        ),
        'gross_before_rounding_amount': _serialize_for_json(payroll_entry.gross_before_rounding_amount),
        'rounding_adjustment_amount': _serialize_for_json(payroll_entry.rounding_adjustment_amount),
        'gross_payable_amount': _serialize_for_json(payroll_entry.gross_payable_amount),
        'rounding_note': 'Rounded to the nearest thousand kip at the final payroll step.',
    }


def build_workforce_report_payload(payroll_run: PayrollRun) -> dict:
    monthly_summary = payroll_run.monthly_summary
    employee_rows = [
        {
            'employee_name': payroll_run_employee.employee.name,
            'gross_payable_amount': payroll_run_employee.gross_payable_amount,
            'late_minutes_total': payroll_run_employee.late_minutes_total,
            'approved_ot_minutes_total': payroll_run_employee.approved_ot_minutes_total,
            'project_bonus_amount': payroll_run_employee.project_bonus_amount,
        }
        for payroll_run_employee in payroll_run.employees.select_related('employee').all().order_by('-gross_payable_amount', 'employee__name')
    ]
    return {
        'report_title': f'Workforce payroll summary - {payroll_run.year}-{payroll_run.month:02d}',
        'payroll_run': {
            'id': payroll_run.id,
            'year': payroll_run.year,
            'month': payroll_run.month,
            'run_type': payroll_run.run_type,
            'status': payroll_run.status,
        },
        'monthly_summary': _serialize_for_json(
            {
                'headcount_paid': monthly_summary.headcount_paid,
                'total_monthly_base_wages': monthly_summary.total_monthly_base_wages,
                'total_attendance_bonus_amount': monthly_summary.total_attendance_bonus_amount,
                'total_deduction_amount': monthly_summary.total_deduction_amount,
                'total_approved_overtime_pay_amount': monthly_summary.total_approved_overtime_pay_amount,
                'total_project_bonus_amount': monthly_summary.total_project_bonus_amount,
                'total_manual_adjustments_amount': monthly_summary.total_manual_adjustments_amount,
                'total_carry_forward_recovery_amount': monthly_summary.total_carry_forward_recovery_amount,
                'total_gross_before_rounding_amount': monthly_summary.total_gross_before_rounding_amount,
                'total_rounding_adjustment_amount': monthly_summary.total_rounding_adjustment_amount,
                'total_gross_payable_amount': monthly_summary.total_gross_payable_amount,
                'total_late_minutes': monthly_summary.total_late_minutes,
                'total_absent_minutes': monthly_summary.total_absent_minutes,
                'total_leave_minutes': monthly_summary.total_leave_minutes,
                'total_approved_ot_minutes': monthly_summary.total_approved_ot_minutes,
            }
        ),
        'employee_rows': _serialize_for_json(employee_rows),
        'rounding_note': 'Rounded to the nearest thousand kip at the final payroll step.',
    }


def _report_lines_from_payload(payload: dict) -> list[str]:
    lines = [payload.get('report_title', 'Payroll report')]
    payroll_run = payload.get('payroll_run', {})
    if payroll_run:
        lines.append(
            f"Payroll run: {payroll_run.get('year')}-{str(payroll_run.get('month')).zfill(2)} | {payroll_run.get('run_type')} | {payroll_run.get('status')}"
        )

    employee = payload.get('employee')
    if employee:
        lines.append(f"Employee: {employee.get('name')} ({employee.get('worker_id') or 'no worker id'})")

    attendance_summary = payload.get('attendance_summary')
    if attendance_summary:
        lines.append('Attendance summary:')
        for label, value in attendance_summary.items():
            lines.append(f'  {label}: {value}')

    monthly_summary = payload.get('monthly_summary')
    if monthly_summary:
        lines.append('Workforce summary:')
        for label, value in monthly_summary.items():
            lines.append(f'  {label}: {value}')

    components = payload.get('components') or []
    if components:
        lines.append('Components:')
        for component in components:
            lines.append(f"  {component['label']}: {component['amount']}")

    leave_records = payload.get('leave_records') or []
    if leave_records:
        lines.append('Leave records:')
        for leave_record in leave_records:
            lines.append(
                f"  {leave_record['leave_date']} | {leave_record['submission_status']} | {leave_record['leave_minutes']} minutes"
            )

    overtime_decisions = payload.get('overtime_decisions') or []
    if overtime_decisions:
        lines.append('Overtime decisions:')
        for decision in overtime_decisions:
            lines.append(
                f"  {decision['attendance_date']} {decision['attendance_shift']} | approved {decision['approved_ot_minutes']}m | denied {decision['denied_ot_minutes']}m"
            )
            if decision.get('decision_reason'):
                lines.append(f"    reason: {decision['decision_reason']}")

    employee_rows = payload.get('employee_rows') or []
    if employee_rows:
        lines.append('Employee rows:')
        for employee_row in employee_rows[:20]:
            lines.append(
                f"  {employee_row['employee_name']} | gross {employee_row['gross_payable_amount']} | late {employee_row['late_minutes_total']}m | OT {employee_row['approved_ot_minutes_total']}m"
            )

    if payload.get('gross_before_rounding_amount') is not None:
        lines.append(f"Gross before rounding: {payload['gross_before_rounding_amount']}")
        lines.append(f"Rounding adjustment: {payload['rounding_adjustment_amount']}")
        lines.append(f"Gross payable: {payload['gross_payable_amount']}")

    if payload.get('rounding_note'):
        lines.append(payload['rounding_note'])

    return lines


def _draw_report_image(lines: list[str], destination_path: Path):
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    wrapped_lines = []
    for line in lines:
        wrapped_lines.extend(textwrap.wrap(str(line), width=92) or [''])

    line_height = 22
    image_width = 1400
    image_height = max(900, 80 + line_height * len(wrapped_lines))
    image = Image.new('RGB', (image_width, image_height), color='white')
    draw = ImageDraw.Draw(image)

    y_position = 40
    for index, line in enumerate(wrapped_lines):
        fill = 'black'
        if index == 0:
            fill = '#0b0c10'
        draw.text((40, y_position), line, fill=fill, font=font)
        y_position += line_height

    image.save(destination_path, format='JPEG', quality=90)
    return image


def generate_report_artifacts(payroll_run: PayrollRun, report_type: str, employee: Employee | None = None) -> list[PayrollReportArtifact]:
    if report_type == 'employee' and employee is None:
        raise ValueError('Employee report generation requires an employee.')

    payload = build_employee_report_payload(payroll_run, employee) if report_type == 'employee' else build_workforce_report_payload(payroll_run)
    payload_json = json.dumps(_serialize_for_json(payload), sort_keys=True)
    snapshot_hash = hashlib.sha256(payload_json.encode('utf-8')).hexdigest()
    lines = _report_lines_from_payload(payload)

    relative_jpg_path = _artifact_relative_path(payroll_run, report_type, 'jpg', employee)
    relative_pdf_path = _artifact_relative_path(payroll_run, report_type, 'pdf', employee)
    absolute_jpg_path = _artifact_absolute_path(relative_jpg_path)
    absolute_pdf_path = _artifact_absolute_path(relative_pdf_path)

    report_image = _draw_report_image(lines, absolute_jpg_path)
    absolute_pdf_path.parent.mkdir(parents=True, exist_ok=True)
    report_image.save(absolute_pdf_path, format='PDF', resolution=100.0)

    jpg_artifact, _ = PayrollReportArtifact.objects.update_or_create(
        payroll_run=payroll_run,
        employee=employee,
        report_type=report_type,
        format='jpg',
        defaults={
            'file_path': relative_jpg_path,
            'snapshot_hash': snapshot_hash,
        },
    )
    pdf_artifact, _ = PayrollReportArtifact.objects.update_or_create(
        payroll_run=payroll_run,
        employee=employee,
        report_type=report_type,
        format='pdf',
        defaults={
            'file_path': relative_pdf_path,
            'snapshot_hash': snapshot_hash,
        },
    )
    return [jpg_artifact, pdf_artifact]


def serialize_report_artifact(artifact: PayrollReportArtifact) -> dict:
    return {
        'id': artifact.id,
        'report_type': artifact.report_type,
        'format': artifact.format,
        'file_path': artifact.file_path,
        'url': _public_media_path(artifact.file_path),
        'generated_at': artifact.generated_at.isoformat() if artifact.generated_at else None,
    }