import calendar
from datetime import date

from rest_framework.test import APITestCase

from .models import (
    AttendanceRecord,
    AttendanceRecordEmployee,
    AttendanceShift,
    Department,
    Employee,
    EmployeeLeaveRecord,
    EmployeeRosterAssignment,
    PayrollPolicy,
    RosterTemplate,
)


class DepartmentAndPaidRestTests(APITestCase):
    def setUp(self):
        self.department = Department.objects.create(
            name='Shop Floor',
            code='SHOP',
            shop_paid_rest_enabled=True,
            paid_rest_days_granted_per_month='2.00',
            paid_rest_carry_forward_cap_days='9999.00',
            minimum_staff_required_per_shift=2,
            allow_half_day_paid_rest=True,
        )
        self.policy = PayrollPolicy.objects.create(
            policy_code='PAIDREST',
            name='Paid Rest Policy',
            version_number=1,
            effective_from='2025-09-01',
            rice_allowance_amount='0.00',
            social_security_allowance_amount='0.00',
            full_attendance_bonus_amount='25000.00',
            labor_pool_percent='0.1000',
            normal_work_hours_per_day='8.00',
            salary_days_per_month=30,
            overtime_multiplier='2.00',
            late_grace_minutes=5,
            rounding_unit_amount=1000,
            unapproved_absence_incident_threshold=2,
            status='active',
            currency='LAK',
            is_active=True,
        )
        self.roster_template = RosterTemplate.objects.create(
            name='All Week Shop Base',
            description='Base roster for shop staff using floating paid rest.',
            cycle_length_weeks=1,
            schedule=self._build_all_week_schedule(),
            is_active=True,
        )
        self.employees = [
            Employee.objects.create(name='Employee One', base_salary=1000000, worker_id='SHOP-1', department=self.department, is_active=True),
            Employee.objects.create(name='Employee Two', base_salary=1000000, worker_id='SHOP-2', department=self.department, is_active=True),
            Employee.objects.create(name='Employee Three', base_salary=1000000, worker_id='SHOP-3', department=self.department, is_active=True),
        ]
        for employee in self.employees:
            EmployeeRosterAssignment.objects.create(
                employee=employee,
                template=self.roster_template,
                effective_start_date='2025-09-01',
            )

        self.primary_employee = self.employees[0]
        self.secondary_employee = self.employees[1]
        self.tertiary_employee = self.employees[2]

    def _build_all_week_schedule(self):
        return [
            {
                'week_index': 1,
                'day_of_week': day_of_week,
                'is_working': True,
                'morning_in': '08:00',
                'morning_out': '12:00',
                'afternoon_in': '13:00',
                'afternoon_out': '17:00',
            }
            for day_of_week in range(7)
        ]

    def _create_paid_rest_request(
        self,
        employee,
        rest_date,
        duration_unit='full_day',
        linked_attendance_shift='',
        submission_status='draft',
    ):
        return self.client.post(
            '/api/payroll/paid-rest/',
            {
                'employee': employee.id,
                'rest_date': rest_date,
                'duration_unit': duration_unit,
                'linked_attendance_shift': linked_attendance_shift,
                'submission_status': submission_status,
                'employee_reason': 'Monthly paid rest',
            },
            format='json',
        )

    def _create_finalized_month(self, year, month, paid_rest_shifts=None):
        paid_rest_shifts = paid_rest_shifts or set()
        record = AttendanceRecord.objects.create(year=year, month=month, status='final')
        last_day = calendar.monthrange(year, month)[1]

        for employee in self.employees:
            record_employee = AttendanceRecordEmployee.objects.create(
                record=record,
                employee=employee,
                employee_name=employee.name,
                department=employee.department.name if employee.department else '',
                worker_id=employee.worker_id or '',
            )
            for day in range(1, last_day + 1):
                morning_paid_rest = (employee.id, day, 'morning') in paid_rest_shifts
                afternoon_paid_rest = (employee.id, day, 'afternoon') in paid_rest_shifts
                raw_logs = [] if morning_paid_rest and afternoon_paid_rest else ['08:00', '12:00', '13:00', '17:00']
                AttendanceShift.objects.create(
                    record_employee=record_employee,
                    day=day,
                    raw_logs=raw_logs,
                    morning_in='' if morning_paid_rest else '08:00',
                    morning_out='' if morning_paid_rest else '12:00',
                    afternoon_in='' if afternoon_paid_rest else '13:00',
                    afternoon_out='' if afternoon_paid_rest else '17:00',
                    morning_status='paid_rest' if morning_paid_rest else 'present',
                    afternoon_status='paid_rest' if afternoon_paid_rest else 'present',
                )

        return record

    def test_department_crud_and_unused_delete(self):
        create_response = self.client.post(
            '/api/departments/',
            {
                'name': 'Warehouse',
                'code': 'WH',
                'shop_paid_rest_enabled': False,
                'minimum_staff_required_per_shift': 1,
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, 201)
        department_id = create_response.data['id']

        patch_response = self.client.patch(
            f'/api/departments/{department_id}/',
            {
                'shop_paid_rest_enabled': True,
                'paid_rest_days_granted_per_month': '3.00',
            },
            format='json',
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertTrue(patch_response.data['shop_paid_rest_enabled'])
        self.assertEqual(patch_response.data['paid_rest_days_granted_per_month'], '3.00')

        delete_response = self.client.delete(f'/api/departments/{department_id}/')
        self.assertEqual(delete_response.status_code, 204)

    def test_used_department_delete_soft_deactivates(self):
        response = self.client.delete(f'/api/departments/{self.department.id}/')

        self.assertEqual(response.status_code, 200)
        self.department.refresh_from_db()
        self.assertFalse(self.department.is_active)

    def test_employee_department_is_optional_but_assignable(self):
        no_department_response = self.client.post(
            '/api/employees/',
            {
                'name': 'No Department Employee',
                'base_salary': 800000,
                'worker_id': 'NO-DEPT',
                'is_active': True,
            },
            format='json',
        )
        with_department_response = self.client.post(
            '/api/employees/',
            {
                'name': 'Assigned Department Employee',
                'base_salary': 800000,
                'worker_id': 'WITH-DEPT',
                'department': self.department.id,
                'is_active': True,
            },
            format='json',
        )

        self.assertEqual(no_department_response.status_code, 201)
        self.assertIsNone(no_department_response.data['department'])
        self.assertEqual(with_department_response.status_code, 201)
        self.assertEqual(with_department_response.data['department'], self.department.id)
        self.assertEqual(with_department_response.data['department_name'], self.department.name)

    def test_half_day_paid_rest_requires_a_shift(self):
        response = self._create_paid_rest_request(
            self.primary_employee,
            '2025-09-03',
            duration_unit='half_day',
            submission_status='draft',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('linked_attendance_shift', str(response.data))

    def test_paid_rest_approval_rejects_overlap_with_approved_leave(self):
        EmployeeLeaveRecord.objects.create(
            employee=self.primary_employee,
            leave_date='2025-09-04',
            duration_unit='half_day',
            duration_value=0.5,
            leave_minutes=240,
            linked_attendance_shift='morning',
            submission_status='approved',
        )

        response = self._create_paid_rest_request(
            self.primary_employee,
            '2025-09-04',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('approved leave', str(response.data).lower())

    def test_paid_rest_approval_rejects_overlap_with_existing_paid_rest(self):
        first_response = self._create_paid_rest_request(
            self.primary_employee,
            '2025-09-05',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )
        second_response = self._create_paid_rest_request(
            self.primary_employee,
            '2025-09-05',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 400)
        self.assertIn('another approved paid-rest request', str(second_response.data).lower())

    def test_paid_rest_approval_rejects_when_balance_is_insufficient(self):
        first_response = self._create_paid_rest_request(self.primary_employee, '2026-01-06', submission_status='approved')
        second_response = self._create_paid_rest_request(self.primary_employee, '2026-01-07', submission_status='approved')
        third_response = self._create_paid_rest_request(
            self.primary_employee,
            '2026-01-08',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(third_response.status_code, 400)
        self.assertIn('insufficient paid-rest balance', str(third_response.data).lower())

    def test_paid_rest_approval_rejects_when_coverage_would_drop_below_minimum(self):
        first_response = self._create_paid_rest_request(
            self.primary_employee,
            '2025-09-09',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )
        second_response = self._create_paid_rest_request(
            self.secondary_employee,
            '2025-09-09',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 400)
        self.assertIn('minimum coverage', str(second_response.data).lower())

    def test_paid_rest_overlays_into_attendance_draft(self):
        self._create_paid_rest_request(
            self.primary_employee,
            '2025-09-10',
            duration_unit='half_day',
            linked_attendance_shift='morning',
            submission_status='approved',
        )

        response = self.client.post(
            '/api/payroll/attendance-records/save-draft/',
            {
                'year': 2025,
                'month': 9,
                'employees': [
                    {
                        'worker_id': self.primary_employee.worker_id,
                        'employee_name': self.primary_employee.name,
                        'department': self.department.name,
                        'days': {
                            '10': {
                                'raw_logs': [],
                                'morning': {'in': '', 'out': '', 'status': 'missing'},
                                'afternoon': {'in': '', 'out': '', 'status': 'missing'},
                            },
                        },
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['employees'][0]['days']['10']['morning']['status'], 'paid_rest')

    def test_paid_rest_balance_endpoint_rebuilds_monthly_carry_forward(self):
        approve_response = self._create_paid_rest_request(
            self.primary_employee,
            '2026-01-11',
            duration_unit='half_day',
            linked_attendance_shift='afternoon',
            submission_status='approved',
        )
        self.assertEqual(approve_response.status_code, 201)

        september_response = self.client.get(
            f'/api/payroll/paid-rest-balances/?year=2026&month=1&employee_id={self.primary_employee.id}'
        )
        october_response = self.client.get(
            f'/api/payroll/paid-rest-balances/?year=2026&month=2&employee_id={self.primary_employee.id}'
        )

        self.assertEqual(september_response.status_code, 200)
        self.assertEqual(october_response.status_code, 200)
        september_balance = september_response.data['records'][0]
        october_balance = october_response.data['records'][0]
        self.assertEqual(september_balance['closing_balance_days'], '1.50')
        self.assertEqual(october_balance['opening_balance_days'], '1.50')
        self.assertEqual(october_balance['closing_balance_days'], '3.50')

    def test_paid_rest_is_neutral_in_attendance_summary_and_payroll(self):
        self._create_finalized_month(
            2025,
            9,
            paid_rest_shifts={
                (self.primary_employee.id, 1, 'morning'),
                (self.primary_employee.id, 1, 'afternoon'),
            },
        )

        summary_response = self.client.get('/api/payroll/attendance-summaries/?year=2025&month=9&rebuild=1')
        self.assertEqual(summary_response.status_code, 200)
        primary_summary = next(
            summary for summary in summary_response.data['records'] if summary['employee'] == self.primary_employee.id
        )
        self.assertEqual(primary_summary['paid_rest_minutes_total'], 480)
        self.assertEqual(primary_summary['approved_leave_minutes_total'], 0)
        self.assertEqual(primary_summary['absent_minutes_total'], 0)
        self.assertTrue(primary_summary['full_attendance_eligible'])

        payroll_response = self.client.post(
            '/api/payroll/runs/',
            {
                'year': 2025,
                'month': 9,
                'run_type': 'normal',
            },
            format='json',
        )

        self.assertEqual(payroll_response.status_code, 201)
        primary_entry = next(
            payroll_run_employee for payroll_run_employee in payroll_response.data['employees'] if payroll_run_employee['employee'] == self.primary_employee.id
        )
        self.assertEqual(primary_entry['paid_rest_minutes_total'], 480)
        self.assertEqual(primary_entry['deduction_amount'], '0.00')
        self.assertEqual(primary_entry['attendance_bonus_amount'], '25000.00')