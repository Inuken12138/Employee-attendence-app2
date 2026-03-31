# Tests
# When running `python manage.py test`, the backend switches to an in-memory SQLite database so tests do not require PostgreSQL permissions.

from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from .models import Employee
from .views import _parse_attendance_sheet_records


class AttendanceRecordsTests(APITestCase):
	def setUp(self):
		self.employee = Employee.objects.create(
			name='Test Employee',
			base_salary=1000000,
			worker_id='E1001',
			is_active=True,
		)

	def _attendance_file_path(self) -> Path:
		base_dir = Path(settings.BASE_DIR).parent
		return base_dir / 'attendence' / '1_(12月)员工刷卡记录表.xls'

	def test_parser_returns_records(self):
		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			payload = _parse_attendance_sheet_records(handle, year=2025, month=12)

		self.assertIn('employees', payload)
		self.assertIn('days_in_month', payload)
		self.assertEqual(payload['month'], 12)

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
			{'file': upload, 'year': 2025, 'month': 12},
			format='multipart',
		)

		self.assertEqual(response.status_code, 200)
		self.assertIn('employees', response.data)
		self.assertIn('days_in_month', response.data)
		for employee in response.data['employees']:
			self.assertEqual(employee.get('worker_id'), 'E1001')

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
