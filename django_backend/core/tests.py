# Tests
# When running `python manage.py test`, the backend switches to an in-memory SQLite database so tests do not require PostgreSQL permissions.

from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from .models import Employee, EmployeeRosterAssignment, RosterTemplate
from .views import _parse_attendance_sheet_records


class AttendanceRecordsTests(APITestCase):
	def setUp(self):
		self.parser_employee = Employee.objects.create(
			name='TOU',
			base_salary=1000000,
			worker_id='1',
			is_active=True,
		)
		self.employee = Employee.objects.create(
			name='Test Employee',
			base_salary=1000000,
			worker_id='E1001',
			is_active=True,
		)

	def _attendance_file_path(self) -> Path:
		base_dir = Path(settings.BASE_DIR).parent
		return base_dir / 'attendence' / '1_(12月)员工刷卡记录表.xls'

	def _build_mon_sat_schedule(self):
		return [
			{
				'week_index': 1,
				'day_of_week': day_of_week,
				'is_working': day_of_week < 6,
				'morning_in': '08:00',
				'morning_out': '12:00',
				'afternoon_in': '13:00',
				'afternoon_out': '17:30',
			}
			for day_of_week in range(7)
		]

	def test_parser_returns_records(self):
		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			payload = _parse_attendance_sheet_records(handle, year=2025, month=12)

		self.assertIn('employees', payload)
		self.assertIn('days_in_month', payload)
		self.assertEqual(payload['month'], 12)

	def test_parser_extracts_period_from_sheet_header(self):
		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			payload = _parse_attendance_sheet_records(handle)

		self.assertEqual(payload['year'], 2024)
		self.assertEqual(payload['month'], 12)
		self.assertEqual(payload['date_range_start'], '2024-12-01')
		self.assertEqual(payload['date_range_end'], '2024-12-31')
		self.assertIn('考勤日期', payload['source_date_range'])
		self.assertEqual(payload['sheet_generated_at'], '2025-01-10 14:56:56')

	def test_parse_endpoint_returns_records(self):
		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			upload = SimpleUploadedFile(
				'attendance.xls',
				handle.read(),
				content_type='application/vnd.ms-excel',
			)

		response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{'file': upload},
			format='multipart',
		)

		self.assertEqual(response.status_code, 200)
		self.assertIn('employees', response.data)
		self.assertIn('days_in_month', response.data)
		self.assertEqual(response.data.get('year'), 2024)
		self.assertEqual(response.data.get('month'), 12)
		self.assertEqual(len(response.data['employees']), 1)
		for employee in response.data['employees']:
			self.assertEqual(employee.get('worker_id'), '1')
			self.assertEqual(employee.get('employee_name'), 'TOU')

	def test_save_uses_worker_id_and_employee_name_composite(self):
		matching_employee = Employee.objects.create(
			name='Another Employee',
			base_salary=1100000,
			worker_id='E1001',
			is_active=True,
		)

		payload = {
			'year': 2025,
			'month': 7,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Another Employee',
					'department': 'Sales',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(response.data['employees']), 1)
		self.assertEqual(response.data['employees'][0]['employee_db_id'], matching_employee.id)
		self.assertEqual(response.data['employees'][0]['employee_name'], 'Another Employee')

	def test_inactive_matching_name_does_not_fall_back_to_active_same_worker_id(self):
		Employee.objects.create(
			name='Another Employee',
			base_salary=1100000,
			worker_id='SHARED-1',
			is_active=True,
		)
		Employee.objects.create(
			name='Inactive Match',
			base_salary=1000000,
			worker_id='SHARED-1',
			is_active=False,
		)

		payload = {
			'year': 2025,
			'month': 6,
			'employees': [
				{
					'worker_id': 'SHARED-1',
					'employee_name': 'Inactive Match',
					'department': 'Sales',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employees'], [])

	def test_parser_filters_out_inactive_or_unknown_workers(self):
		Employee.objects.create(
			name='Inactive Employee',
			base_salary=900000,
			worker_id='E1002',
			is_active=False,
		)

		payload = {
			'year': 2025,
			'month': 12,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				},
				{
					'worker_id': 'E1002',
					'employee_name': 'Inactive Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				},
				{
					'worker_id': 'UNKNOWN',
					'employee_name': 'Unknown Worker',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				},
			],
		}

		save_response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(save_response.status_code, 200)
		self.assertEqual(len(save_response.data['employees']), 1)
		self.assertEqual(save_response.data['employees'][0]['worker_id'], 'E1001')

	def test_save_draft_and_fetch(self):
		payload = {
			'year': 2025,
			'month': 11,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:01', '12:02'],
							'morning': {'in': '', 'out': '', 'status': 'missing'},
							'afternoon': {'in': '', 'out': '', 'status': 'missing'},
						}
					},
				}
			],
		}

		save_response = self.client.post(
			'/api/payroll/attendance-records/save-draft/',
			payload,
			format='json',
		)

		self.assertEqual(save_response.status_code, 200)
		self.assertEqual(save_response.data.get('status'), 'draft')

		fetch_response = self.client.get('/api/payroll/attendance-records/drafts/?year=2025&month=11')
		self.assertEqual(fetch_response.status_code, 200)
		self.assertEqual(fetch_response.data.get('status'), 'draft')

	def test_history_lists_saved_periods(self):
		draft_payload = {
			'year': 2024,
			'month': 12,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:01'],
							'morning': {'in': '', 'out': '', 'status': 'missing'},
							'afternoon': {'in': '', 'out': '', 'status': 'missing'},
						}
					},
				}
			],
		}
		final_payload = {
			'year': 2024,
			'month': 12,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				}
			],
		}

		self.client.post('/api/payroll/attendance-records/save-draft/', draft_payload, format='json')
		self.client.post('/api/payroll/attendance-records/save/', final_payload, format='json')

		history_response = self.client.get('/api/payroll/attendance-records/history/')

		self.assertEqual(history_response.status_code, 200)
		records = history_response.data.get('records', [])
		self.assertEqual(len(records), 2)
		self.assertEqual(records[0]['year'], 2024)
		self.assertEqual(records[0]['month'], 12)
		self.assertEqual(records[0]['status'], 'final')
		self.assertEqual(records[1]['status'], 'draft')

	def test_final_save_rejects_missing(self):
		payload = {
			'year': 2025,
			'month': 10,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:01', '12:02'],
							'morning': {'in': '', 'out': '', 'status': 'missing'},
							'afternoon': {'in': '', 'out': '', 'status': 'missing'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')
		self.assertEqual(response.status_code, 400)

	def test_final_save_and_fetch(self):
		payload = {
			'year': 2025,
			'month': 9,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				}
			],
		}

		save_response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')
		self.assertEqual(save_response.status_code, 200)
		self.assertEqual(save_response.data.get('status'), 'final')

		fetch_response = self.client.get('/api/payroll/attendance-records/?year=2025&month=9')
		self.assertEqual(fetch_response.status_code, 200)
		self.assertEqual(fetch_response.data.get('status'), 'final')

	def test_final_save_marks_roster_days_off(self):
		template = RosterTemplate.objects.create(
			name='Mon-Sat Standard',
			description='Standard production roster',
			cycle_length_weeks=1,
			schedule=self._build_mon_sat_schedule(),
		)
		EmployeeRosterAssignment.objects.create(
			employee=self.employee,
			template=template,
			effective_start_date='2025-09-01',
		)

		payload = {
			'year': 2025,
			'month': 9,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						},
						'7': {
							'raw_logs': [],
							'morning': {'in': '', 'out': '', 'status': 'missing'},
							'afternoon': {'in': '', 'out': '', 'status': 'missing'},
						},
					},
				}
			],
		}

		save_response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(save_response.status_code, 200)
		days = save_response.data['employees'][0]['days']
		self.assertEqual(days['7']['morning']['status'], 'off')
		self.assertEqual(days['7']['afternoon']['status'], 'off')
		self.assertEqual(save_response.data['employees'][0]['roster_assignment']['template_name'], 'Mon-Sat Standard')

		fetch_response = self.client.get('/api/payroll/attendance-records/?year=2025&month=9')
		self.assertEqual(fetch_response.status_code, 200)
		self.assertEqual(fetch_response.data['employees'][0]['days']['7']['morning']['status'], 'off')

	def test_fetch_hides_rows_for_now_inactive_workers(self):
		payload = {
			'year': 2025,
			'month': 8,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
					'department': 'HR',
					'days': {
						'1': {
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				}
			],
		}

		save_response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')
		self.assertEqual(save_response.status_code, 200)

		self.employee.is_active = False
		self.employee.save(update_fields=['is_active'])

		fetch_response = self.client.get('/api/payroll/attendance-records/?year=2025&month=8')
		self.assertEqual(fetch_response.status_code, 200)
		self.assertEqual(fetch_response.data['employees'], [])

	def test_roster_template_can_be_created_and_assigned(self):
		template_payload = {
			'name': 'Mon-Sat Standard',
			'description': 'Standard production roster',
			'cycle_length_weeks': 1,
			'schedule': self._build_mon_sat_schedule(),
		}

		template_response = self.client.post('/api/roster-templates/', template_payload, format='json')

		self.assertEqual(template_response.status_code, 201)
		assignment_response = self.client.post(
			f'/api/employees/{self.employee.id}/roster-assignment/',
			{
				'template_id': template_response.data['id'],
				'effective_start_date': '2026-04-01',
			},
			format='json',
		)

		self.assertEqual(assignment_response.status_code, 200)
		self.assertEqual(assignment_response.data['roster_assignment']['template_name'], 'Mon-Sat Standard')
		self.assertEqual(assignment_response.data['roster_assignment']['effective_start_date'], '2026-04-01')
