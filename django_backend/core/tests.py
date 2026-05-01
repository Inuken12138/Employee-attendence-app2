# Tests
# When running `python manage.py test`, the backend switches to an in-memory SQLite database so tests do not require PostgreSQL permissions.
"""Regression tests for attendance parsing, employee identity, and payroll flows.

This file holds a broad integration-style test suite for the ``core`` app. The
tests are especially helpful during onboarding because they demonstrate the
expected request payloads for attendance import, employee CRUD, and payroll
adjacent APIs."""


import calendar
from datetime import date
from io import BytesIO
from pathlib import Path
import tempfile

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from openpyxl import Workbook
from rest_framework.test import APITestCase

from .models import AttendanceOvertimeDecision, AttendanceRecord, AttendanceRecordEmployee, AttendanceShift, AttendanceTimeBankEntry, ConstructionProject, ConstructionProjectAssignment, ConstructionProjectWorkLog, Employee, EmployeeAttendanceWorkRuleProfile, EmployeeCompensationProfile, EmployeeLeaveRecord, EmployeePayrollAdjustment, EmployeePayrollCarryForwardBalance, EmployeeRosterAssignment, PayrollPolicy, PayrollReportArtifact, PayrollRun, RosterTemplate
from .views import _parse_attendance_sheet_records


class AttendanceRecordsTests(APITestCase):
	"""Exercise the attendance import, employee validation, and payroll endpoints."""

	def setUp(self):
		"""Create baseline employees used by parser and employee-CRUD tests."""

		self.parser_employee = Employee.objects.create(
			name='TOU',
			base_salary=1000000,
			worker_id='1',
			is_active=False,
		)
		self.employee = Employee.objects.create(
			name='Test Employee',
			base_salary=1000000,
			worker_id='E1001',
			is_active=True,
		)

	def _attendance_file_path(self) -> Path:
		"""Return the bundled sample attendance file used across parser tests."""

		self.parser_employee.is_active = True
		self.parser_employee.save(update_fields=['is_active'])

		base_dir = Path(settings.BASE_DIR).parent
		return base_dir / 'attendence' / '1_(12月)员工刷卡记录表.xls'

	def _build_mon_sat_schedule(self):
		"""Create a simple Monday-through-Saturday roster template payload."""

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

	def _build_valid_attendance_upload(self, filename='attendance.xls'):
		"""Load the real sample attendance export into an uploaded-file object."""

		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			return SimpleUploadedFile(
				filename,
				handle.read(),
				content_type='application/vnd.ms-excel',
			)

	def _build_invalid_attendance_upload(self, filename='wrong-sheet.xlsx'):
		"""Create a workbook that intentionally does not match the parser format."""

		workbook = Workbook()
		sheet = workbook.active
		sheet.title = 'Sheet1'
		sheet['A1'] = 'This is not an attendance export'
		sheet['B2'] = 'No worker headers here'

		buffer = BytesIO()
		workbook.save(buffer)
		return SimpleUploadedFile(
			filename,
			buffer.getvalue(),
			content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		)

	def _build_unmatched_attendance_upload(self, filename='unmatched-sheet.xlsx'):
		"""Create a valid-looking sheet whose worker cannot be matched to an employee."""

		workbook = Workbook()
		sheet = workbook.active
		sheet.title = 'Attendance'
		sheet['A1'] = '工号'
		sheet['B1'] = '999'
		sheet['C1'] = '姓名'
		sheet['D1'] = 'Ghost Worker'
		sheet['A2'] = 1
		sheet['A3'] = '08:00\n12:00\n13:00\n17:00'

		buffer = BytesIO()
		workbook.save(buffer)
		return SimpleUploadedFile(
			filename,
			buffer.getvalue(),
			content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		)

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
		upload = self._build_valid_attendance_upload()

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
		self.assertEqual(response.data.get('warnings'), [])

	def test_parse_endpoint_accepts_multiple_identical_files(self):
		single_response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{'file': self._build_valid_attendance_upload('single.xls')},
			format='multipart',
		)

		multi_response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{'files': [self._build_valid_attendance_upload('machine-a.xls'), self._build_valid_attendance_upload('machine-b.xls')]},
			format='multipart',
		)

		self.assertEqual(single_response.status_code, 200)
		self.assertEqual(multi_response.status_code, 200)
		self.assertEqual(multi_response.data['employees'], single_response.data['employees'])
		self.assertEqual(multi_response.data.get('warnings'), [])
		self.assertEqual(len(multi_response.data.get('source_files', [])), 2)
		self.assertEqual(multi_response.data['source_files'][0]['status'], 'parsed')

	def test_parse_endpoint_skips_wrong_format_files_in_batch(self):
		single_response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{'file': self._build_valid_attendance_upload('single.xls')},
			format='multipart',
		)

		batch_response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{
				'files': [
					self._build_valid_attendance_upload('machine-a.xls'),
					self._build_invalid_attendance_upload('wrong-middle.xlsx'),
					self._build_valid_attendance_upload('machine-b.xls'),
				],
			},
			format='multipart',
		)

		self.assertEqual(single_response.status_code, 200)
		self.assertEqual(batch_response.status_code, 200)
		self.assertEqual(batch_response.data['employees'], single_response.data['employees'])
		self.assertEqual(len(batch_response.data.get('warnings', [])), 1)
		self.assertIn('wrong-middle.xlsx', batch_response.data['warnings'][0])
		self.assertEqual(
			[source_file['status'] for source_file in batch_response.data.get('source_files', [])],
			['parsed', 'skipped', 'parsed'],
		)

	def test_parse_endpoint_errors_when_all_files_are_invalid(self):
		response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{'files': [self._build_invalid_attendance_upload()]},
			format='multipart',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('No valid attendance files were parsed.', response.data.get('error', ''))
		self.assertEqual(len(response.data.get('warnings', [])), 1)

	def test_parse_endpoint_warns_when_sheet_employees_do_not_match_directory(self):
		response = self.client.post(
			'/api/payroll/attendance-records/parse/',
			{'file': self._build_unmatched_attendance_upload()},
			format='multipart',
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employees'], [])
		self.assertEqual(len(response.data.get('warnings', [])), 1)
		self.assertIn('Worker ID + Employee Name combination', response.data['warnings'][0])

	def test_create_employee_requires_worker_id(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': 'No Worker ID',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('worker_id', response.data)

	def test_create_employee_rejects_blank_name(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': '   ',
				'worker_id': 'E1002',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('name', response.data)

	def test_create_employee_allows_missing_salary_in_employee_record(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': 'Comp Ledger Only',
				'worker_id': 'E1002',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		created_employee = Employee.objects.get(worker_id='E1002')
		self.assertEqual(created_employee.base_salary, 0)
		self.assertIsNone(response.data['base_salary'])

	def test_update_employee_requires_worker_id(self):
		response = self.client.patch(
			f'/api/employees/{self.employee.id}/',
			{
				'worker_id': ' ',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('worker_id', response.data)

	def test_create_employee_allows_duplicate_worker_id_when_name_differs(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': 'Second Machine Worker',
				'worker_id': 'E1001',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data['worker_id'], 'E1001')

	def test_create_employee_rejects_duplicate_worker_id_and_name(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': 'Test Employee',
				'worker_id': 'E1001',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('worker_id', response.data)

	def test_employee_list_uses_current_compensation_profile_salary(self):
		EmployeeCompensationProfile.objects.create(
			employee=self.employee,
			monthly_salary='1234567.00',
			effective_from='2020-01-01',
			effective_to='2099-12-31',
		)
		EmployeeCompensationProfile.objects.create(
			employee=self.employee,
			monthly_salary='7654321.00',
			effective_from='2100-01-01',
		)

		response = self.client.get('/api/employees/')

		self.assertEqual(response.status_code, 200)
		record = next(item for item in response.data if item['id'] == self.employee.id)
		self.assertEqual(record['base_salary'], 1234567.0)

	def test_save_uses_worker_id_and_name_as_attendance_identity(self):
		other_employee = Employee.objects.create(
			name='Another Employee',
			base_salary=1000000,
			worker_id='E1001',
			is_active=True,
		)

		payload = {
			'year': 2025,
			'month': 7,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Test Employee',
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

		response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(response.data['employees']), 1)
		self.assertEqual(response.data['employees'][0]['employee_db_id'], self.employee.id)
		self.assertEqual(response.data['employees'][0]['worker_id'], 'E1001')
		self.assertNotEqual(response.data['employees'][0]['employee_db_id'], other_employee.id)

	def test_save_skips_employee_when_worker_id_matches_but_name_does_not(self):
		Employee.objects.create(
			name='Another Employee',
			base_salary=1000000,
			worker_id='E1001',
			is_active=True,
		)

		payload = {
			'year': 2025,
			'month': 7,
			'employees': [
				{
					'worker_id': 'E1001',
					'employee_name': 'Unknown Same-ID Name',
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

		response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employees'], [])

	def test_inactive_employee_worker_id_is_ignored(self):
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

		response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employees'], [])

	def test_parser_uses_composite_identity_when_worker_ids_overlap(self):
		Employee.objects.create(
			name='Different Person',
			base_salary=1000000,
			worker_id='1',
			is_active=True,
		)

		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			payload = _parse_attendance_sheet_records(handle)

		self.assertEqual(len(payload['employees']), 1)
		self.assertEqual(payload['employees'][0]['employee_db_id'], self.parser_employee.id)

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

		save_response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(save_response.status_code, 200)
		self.assertEqual(len(save_response.data['employees']), 1)
		self.assertEqual(save_response.data['employees'][0]['worker_id'], 'E1001')

	def test_save_skips_employee_when_worker_id_missing(self):
		Employee.objects.create(
			name='Name Only Worker',
			base_salary=980000,
			worker_id='OPS-1',
			is_active=True,
		)

		payload = {
			'year': 2025,
			'month': 8,
			'employees': [
				{
					'worker_id': '',
					'employee_name': 'Name Only Worker',
					'department': 'Operations',
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

		response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employees'], [])

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

	def test_final_save_requires_every_active_employee_to_appear(self):
		Employee.objects.create(
			name='Second Active Employee',
			base_salary=1100000,
			worker_id='E2002',
			is_active=True,
		)

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
							'raw_logs': ['08:00', '12:00', '13:00', '17:00'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:00', 'status': 'present'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 400)
		self.assertIn('Final attendance must include every active employee', str(response.data.get('error')))
		self.assertIn('E2002', str(response.data.get('error')))

	def test_reopen_final_attendance_converts_month_back_to_draft(self):
		self.parser_employee.is_active = False
		self.parser_employee.save(update_fields=['is_active'])

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

		reopen_response = self.client.post(
			'/api/payroll/attendance-records/reopen/',
			{'year': 2025, 'month': 11},
			format='json',
		)

		self.assertEqual(reopen_response.status_code, 200)
		self.assertEqual(reopen_response.data.get('status'), 'draft')
		self.assertFalse(AttendanceRecord.objects.filter(year=2025, month=11, status='final').exists())
		self.assertTrue(AttendanceRecord.objects.filter(year=2025, month=11, status='draft').exists())

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

	def test_leave_record_can_be_created_and_listed(self):
		create_response = self.client.post(
			'/api/payroll/leaves/',
			{
				'employee': self.employee.id,
				'leave_date': '2025-09-03',
				'duration_unit': 'half_day',
				'linked_attendance_shift': 'morning',
				'submission_status': 'approved',
				'employee_reason': 'Clinic visit',
			},
			format='json',
		)

		self.assertEqual(create_response.status_code, 201)
		self.assertEqual(create_response.data['leave_minutes'], 240)
		self.assertEqual(create_response.data['submission_status'], 'approved')

		list_response = self.client.get('/api/payroll/leaves/?year=2025&month=9')
		self.assertEqual(list_response.status_code, 200)
		records = list_response.data.get('records', [])
		self.assertEqual(len(records), 1)
		self.assertEqual(records[0]['employee_name'], 'Test Employee')

	def test_draft_save_overlays_approved_leave_record(self):
		EmployeeLeaveRecord.objects.create(
			employee=self.employee,
			leave_date='2025-09-03',
			duration_unit='full_day',
			duration_value=1,
			leave_minutes=480,
			submission_status='approved',
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
						'3': {
							'raw_logs': [],
							'morning': {'in': '', 'out': '', 'status': 'missing'},
							'afternoon': {'in': '', 'out': '', 'status': 'missing'},
						}
					},
				}
			],
		}

		save_response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(save_response.status_code, 200)
		self.assertEqual(save_response.data['employees'][0]['days']['3']['morning']['status'], 'approved_leave')
		self.assertEqual(save_response.data['employees'][0]['days']['3']['afternoon']['status'], 'approved_leave')

	def test_final_save_rejects_pending_leave_record(self):
		EmployeeLeaveRecord.objects.create(
			employee=self.employee,
			leave_date='2025-09-04',
			duration_unit='full_day',
			duration_value=1,
			leave_minutes=480,
			submission_status='submitted',
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
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 400)
		self.assertIn('Leave decisions are still pending', str(response.data.get('error')))

	def test_overtime_decision_can_be_upserted_and_listed(self):
		create_response = self.client.post(
			'/api/payroll/overtime-decisions/',
			{
				'employee': self.employee.id,
				'attendance_date': '2025-09-02',
				'attendance_shift': 'afternoon',
				'roster_start_time': '13:00',
				'roster_end_time': '17:30',
				'actual_checkout_time': '18:45',
				'status': 'approved',
			},
			format='json',
		)

		self.assertEqual(create_response.status_code, 201)
		self.assertEqual(create_response.data['potential_ot_minutes'], 75)
		self.assertEqual(create_response.data['approved_ot_minutes'], 75)

		update_response = self.client.post(
			'/api/payroll/overtime-decisions/',
			{
				'employee': self.employee.id,
				'attendance_date': '2025-09-02',
				'attendance_shift': 'afternoon',
				'roster_start_time': '13:00',
				'roster_end_time': '17:30',
				'actual_checkout_time': '18:45',
				'status': 'denied',
				'decision_reason': 'Unauthorized overtime',
			},
			format='json',
		)

		self.assertEqual(update_response.status_code, 200)
		self.assertEqual(update_response.data['status'], 'denied')

		list_response = self.client.get('/api/payroll/overtime-decisions/?year=2025&month=9')
		self.assertEqual(list_response.status_code, 200)
		records = list_response.data.get('records', [])
		self.assertEqual(len(records), 1)
		self.assertEqual(records[0]['decision_reason'], 'Unauthorized overtime')

	def test_save_draft_persists_overtime_decisions_from_payload(self):
		template = RosterTemplate.objects.create(
			name='Draft OT Template',
			description='Template with overtime-sensitive end times',
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
							'raw_logs': ['08:00', '12:00', '13:00', '18:15'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '18:15', 'status': 'present'},
						}
					},
				}
			],
			'overtime_decisions': [
				{
					'employee': self.employee.id,
					'attendance_date': '2025-09-01',
					'attendance_shift': 'afternoon',
					'roster_start_time': '13:00',
					'roster_end_time': '17:30',
					'actual_checkout_time': '18:15',
					'status': 'denied',
					'decision_reason': 'Stayed back for handover only.',
				},
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save-draft/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		decision = AttendanceOvertimeDecision.objects.get(
			employee=self.employee,
			attendance_date='2025-09-01',
			attendance_shift='afternoon',
		)
		self.assertEqual(decision.status, 'denied')
		self.assertEqual(decision.denied_ot_minutes, 45)
		self.assertEqual(decision.decision_reason, 'Stayed back for handover only.')

	def test_final_save_requires_resolved_overtime_decision(self):
		template = RosterTemplate.objects.create(
			name='OT Template',
			description='Template with overtime-sensitive end times',
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
							'raw_logs': ['08:00', '12:00', '13:00', '18:15'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '18:15', 'status': 'present'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 400)
		self.assertIn('Overtime decision still pending', str(response.data.get('error')))

	def test_final_save_accepts_resolved_overtime_decision(self):
		template = RosterTemplate.objects.create(
			name='Resolved OT Template',
			description='Template with overtime-sensitive end times',
			cycle_length_weeks=1,
			schedule=self._build_mon_sat_schedule(),
		)
		EmployeeRosterAssignment.objects.create(
			employee=self.employee,
			template=template,
			effective_start_date='2025-09-01',
		)
		AttendanceOvertimeDecision.objects.create(
			employee=self.employee,
			attendance_date='2025-09-01',
			attendance_shift='afternoon',
			roster_start_time='13:00',
			roster_end_time='17:30',
			actual_checkout_time='18:15',
			potential_ot_minutes=45,
			approved_ot_minutes=45,
			denied_ot_minutes=0,
			status='approved',
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
							'raw_logs': ['08:00', '12:00', '13:00', '18:15'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '18:15', 'status': 'present'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['employees'][0]['days']['1']['afternoon']['status'], 'present')

	def test_final_save_ignores_overtime_below_policy_grace(self):
		template = RosterTemplate.objects.create(
			name='Grace OT Template',
			description='Template with short overtime overrun',
			cycle_length_weeks=1,
			schedule=self._build_mon_sat_schedule(),
		)
		EmployeeRosterAssignment.objects.create(
			employee=self.employee,
			template=template,
			effective_start_date='2025-09-01',
		)
		PayrollPolicy.objects.create(
			policy_code='PAYROLL',
			name='Grace Policy',
			version_number=1,
			effective_from='2025-09-01',
			overtime_grace_minutes=10,
			status='active',
			is_active=True,
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
							'raw_logs': ['08:00', '12:00', '13:00', '17:38'],
							'morning': {'in': '08:00', 'out': '12:00', 'status': 'present'},
							'afternoon': {'in': '13:00', 'out': '17:38', 'status': 'present'},
						}
					},
				}
			],
		}

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

		self.assertEqual(response.status_code, 200)


class PayrollPlatformTests(APITestCase):
	def setUp(self):
		self.employee = Employee.objects.create(
			name='Payroll Employee',
			base_salary=0,
			worker_id='PAY-1',
			is_active=True,
		)
		self.policy = PayrollPolicy.objects.create(
			policy_code='PAYROLL',
			name='September Policy',
			version_number=1,
			effective_from='2025-09-01',
			rice_allowance_amount='100000.00',
			social_security_allowance_amount='50000.00',
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
		self.compensation_profile = EmployeeCompensationProfile.objects.create(
			employee=self.employee,
			monthly_salary='1000000.00',
			rice_allowance_amount='100000.00',
			social_security_allowance_amount='50000.00',
			eligible_for_social_security=True,
			payroll_policy=self.policy,
			effective_from='2025-09-01',
		)
		self._create_finalized_attendance_month(2025, 9)

	def _create_finalized_attendance_month(self, year, month):
		record = AttendanceRecord.objects.create(year=year, month=month, status='final')
		record_employee = AttendanceRecordEmployee.objects.create(
			record=record,
			employee=self.employee,
			employee_name=self.employee.name,
			department='Payroll',
			worker_id=self.employee.worker_id or '',
		)

		last_day = calendar.monthrange(year, month)[1]
		for day in range(1, last_day + 1):
			target_date = date(year, month, day)
			if target_date.weekday() < 6:
				AttendanceShift.objects.create(
					record_employee=record_employee,
					day=day,
					raw_logs=['08:00', '12:00', '13:00', '17:00'],
					morning_in='08:00',
					morning_out='12:00',
					afternoon_in='13:00',
					afternoon_out='17:00',
					morning_status='present',
					afternoon_status='present',
				)
			else:
				AttendanceShift.objects.create(
					record_employee=record_employee,
					day=day,
					raw_logs=[],
					morning_status='off',
					afternoon_status='off',
				)

	def _get_shift(self, year, month, day):
		return AttendanceShift.objects.get(
			record_employee__record__year=year,
			record_employee__record__month=month,
			record_employee__record__status='final',
			record_employee__employee=self.employee,
			day=day,
		)

	def _set_afternoon_checkout(self, year, month, day, checkout_time):
		shift = self._get_shift(year, month, day)
		shift.afternoon_out = checkout_time
		shift.save(update_fields=['afternoon_out'])

	def _create_approved_overtime(self, year, month, day, checkout_time, minutes):
		AttendanceOvertimeDecision.objects.create(
			employee=self.employee,
			attendance_date=date(year, month, day),
			attendance_shift='afternoon',
			roster_start_time='13:00',
			roster_end_time='17:00',
			actual_checkout_time=checkout_time,
			potential_ot_minutes=minutes,
			approved_ot_minutes=minutes,
			status='approved',
		)

	def test_generate_normal_payroll_run_uses_compensation_profile(self):
		response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data['policy_name'], 'September Policy')
		self.assertEqual(len(response.data['employees']), 1)
		self.assertEqual(response.data['employees'][0]['monthly_base_wage_amount'], '1150000.00')
		self.assertEqual(response.data['employees'][0]['attendance_bonus_amount'], '25000.00')
		self.assertEqual(response.data['employees'][0]['gross_payable_amount'], '1175000.00')
		self.assertEqual(response.data['monthly_summary']['total_gross_payable_amount'], '1175000.00')

	def test_generate_normal_payroll_run_requires_active_compensation_profile(self):
		self.compensation_profile.delete()

		response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('No compensation profile is active', response.data['error'])

	def test_compensation_profiles_reject_overlap_for_same_employee(self):
		response = self.client.post(
			'/api/payroll/compensation-profiles/',
			{
				'employee': self.employee.id,
				'monthly_salary': '1200000.00',
				'effective_from': '2025-09-15',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('effective_from', response.data['error'])

	def test_attendance_work_rule_profiles_reject_overlap_for_same_employee(self):
		create_response = self.client.post(
			'/api/payroll/attendance-work-rule-profiles/',
			{
				'employee': self.employee.id,
				'work_rule': 'driver_time_bank',
				'effective_from': '2025-09-01',
			},
			format='json',
		)

		self.assertEqual(create_response.status_code, 201)

		overlap_response = self.client.post(
			'/api/payroll/attendance-work-rule-profiles/',
			{
				'employee': self.employee.id,
				'work_rule': 'standard',
				'effective_from': '2025-09-15',
			},
			format='json',
		)

		self.assertEqual(overlap_response.status_code, 400)
		self.assertIn('effective_from', overlap_response.data['error'])

	def test_standard_early_departure_becomes_absence_and_offsets_approved_ot(self):
		self._set_afternoon_checkout(2025, 9, 1, '16:00')
		self._create_approved_overtime(2025, 9, 2, '18:00', 60)

		response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		record = response.data['employees'][0]
		self.assertEqual(record['early_departure_minutes_total'], 60)
		self.assertEqual(record['absent_minutes_total'], 60)
		self.assertEqual(record['time_bank_minutes_total'], 0)
		self.assertEqual(record['approved_ot_minutes_total'], 60)
		self.assertEqual(record['approved_ot_offset_minutes_total'], 60)
		self.assertEqual(record['payable_ot_minutes_total'], 0)
		self.assertEqual(record['deductible_minutes_total'], 0)
		self.assertEqual(record['attendance_bonus_amount'], '0.00')
		self.assertEqual(record['overtime_pay_amount'], '0.00')
		self.assertEqual(record['deduction_amount'], '0.00')

	def test_driver_early_departure_uses_time_bank_before_overtime_pay(self):
		EmployeeAttendanceWorkRuleProfile.objects.create(
			employee=self.employee,
			work_rule='driver_time_bank',
			effective_from='2025-09-01',
		)
		self._set_afternoon_checkout(2025, 9, 1, '16:00')
		self._create_approved_overtime(2025, 9, 2, '18:00', 60)

		response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		run_id = response.data['id']
		record = response.data['employees'][0]
		self.assertEqual(record['early_departure_minutes_total'], 60)
		self.assertEqual(record['absent_minutes_total'], 0)
		self.assertEqual(record['time_bank_minutes_total'], 60)
		self.assertEqual(record['opening_time_bank_minutes_total'], 0)
		self.assertEqual(record['settled_time_bank_minutes_total'], 60)
		self.assertEqual(record['closing_time_bank_minutes_total'], 0)
		self.assertEqual(record['approved_ot_offset_minutes_total'], 0)
		self.assertEqual(record['payable_ot_minutes_total'], 0)
		self.assertEqual(record['deductible_minutes_total'], 0)

		lock_response = self.client.post(f'/api/payroll/runs/{run_id}/lock/', {}, format='json')
		self.assertEqual(lock_response.status_code, 200)

		entries = list(AttendanceTimeBankEntry.objects.filter(employee=self.employee).order_by('entry_date', 'id'))
		self.assertEqual([entry.minutes_delta for entry in entries], [-60, 60])

	def test_driver_time_bank_balance_resets_at_the_start_of_next_month(self):
		EmployeeAttendanceWorkRuleProfile.objects.create(
			employee=self.employee,
			work_rule='driver_time_bank',
			effective_from='2025-09-01',
		)
		self._set_afternoon_checkout(2025, 9, 1, '16:00')

		september_response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)
		self.assertEqual(september_response.status_code, 201)
		self.assertEqual(september_response.data['employees'][0]['closing_time_bank_minutes_total'], 60)

		september_run = september_response.data['id']
		lock_response = self.client.post(f'/api/payroll/runs/{september_run}/lock/', {}, format='json')
		self.assertEqual(lock_response.status_code, 200)

		self._create_finalized_attendance_month(2025, 10)
		self._create_approved_overtime(2025, 10, 1, '18:00', 60)

		october_response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 10,
				'run_type': 'normal',
			},
			format='json',
		)

		self.assertEqual(october_response.status_code, 201)
		record = october_response.data['employees'][0]
		self.assertEqual(record['opening_time_bank_minutes_total'], 0)
		self.assertEqual(record['time_bank_minutes_total'], 0)
		self.assertEqual(record['settled_time_bank_minutes_total'], 0)
		self.assertEqual(record['closing_time_bank_minutes_total'], 0)
		self.assertEqual(record['approved_ot_offset_minutes_total'], 0)
		self.assertEqual(record['payable_ot_minutes_total'], 60)

	def test_compensation_profiles_allow_contiguous_successor(self):
		close_response = self.client.patch(
			f'/api/payroll/compensation-profiles/{self.compensation_profile.id}/',
			{
				'effective_to': '2025-09-30',
			},
			format='json',
		)

		self.assertEqual(close_response.status_code, 200)

		create_response = self.client.post(
			'/api/payroll/compensation-profiles/',
			{
				'employee': self.employee.id,
				'monthly_salary': '1300000.00',
				'payroll_policy': self.policy.id,
				'effective_from': '2025-10-01',
			},
			format='json',
		)

		self.assertEqual(create_response.status_code, 201)
		self.assertEqual(create_response.data['effective_from'], '2025-10-01')

	def test_compensation_profiles_reject_gap_before_successor(self):
		close_response = self.client.patch(
			f'/api/payroll/compensation-profiles/{self.compensation_profile.id}/',
			{
				'effective_to': '2025-09-30',
			},
			format='json',
		)

		self.assertEqual(close_response.status_code, 200)

		create_response = self.client.post(
			'/api/payroll/compensation-profiles/',
			{
				'employee': self.employee.id,
				'monthly_salary': '1300000.00',
				'payroll_policy': self.policy.id,
				'effective_from': '2025-10-02',
			},
			format='json',
		)

		self.assertEqual(create_response.status_code, 400)
		self.assertIn('effective_from', create_response.data['error'])

	def test_project_settlement_creates_bonus_distribution(self):
		project = ConstructionProject.objects.create(
			name='Kitchen Renovation',
			project_code='PRJ-1',
			revenue_amount='1000000.00',
			labor_pool_percent='0.1000',
			status='active',
			start_date='2025-09-01',
		)
		ConstructionProjectAssignment.objects.create(project=project, employee=self.employee, role='Installer')
		ConstructionProjectWorkLog.objects.create(
			project=project,
			employee=self.employee,
			work_date='2025-09-03',
			quantity_unit='day',
			quantity_value='1.00',
		)

		response = self.client.post(
			f'/api/payroll/projects/{project.id}/settle/',
			{
				'settled_to_year': 2025,
				'settled_to_month': 9,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		project.refresh_from_db()
		self.assertEqual(project.status, 'settled')
		self.assertEqual(len(response.data['settlements']), 1)
		self.assertGreater(float(response.data['settlements'][0]['bonus_share_amount']), 0)

	def test_payroll_adjustments_normalize_signed_amounts_and_can_be_deleted(self):
		create_response = self.client.post(
			'/api/payroll/adjustments/',
			{
				'employee': self.employee.id,
				'year': 2025,
				'month': 9,
				'adjustment_type': 'advance',
				'amount': '50000.00',
				'approval_status': 'approved',
			},
			format='json',
		)

		self.assertEqual(create_response.status_code, 201)
		self.assertEqual(create_response.data['amount'], '-50000.00')

		adjustment_id = create_response.data['id']
		stored_adjustment = EmployeePayrollAdjustment.objects.get(pk=adjustment_id)
		self.assertEqual(str(stored_adjustment.amount), '-50000.00')

		update_response = self.client.patch(
			f'/api/payroll/adjustments/{adjustment_id}/',
			{
				'adjustment_type': 'manual_bonus',
				'amount': '-25000.00',
			},
			format='json',
		)

		self.assertEqual(update_response.status_code, 200)
		self.assertEqual(update_response.data['amount'], '25000.00')

		delete_response = self.client.delete(f'/api/payroll/adjustments/{adjustment_id}/')
		self.assertEqual(delete_response.status_code, 204)
		self.assertFalse(EmployeePayrollAdjustment.objects.filter(pk=adjustment_id).exists())

	def test_correction_run_creates_carry_forward_balance_for_overpayment(self):
		normal_run_response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)
		self.assertEqual(normal_run_response.status_code, 201)
		normal_run = PayrollRun.objects.get(pk=normal_run_response.data['id'])

		lock_response = self.client.post(f'/api/payroll/runs/{normal_run.id}/lock/', {}, format='json')
		self.assertEqual(lock_response.status_code, 200)

		EmployeePayrollAdjustment.objects.create(
			employee=self.employee,
			year=2025,
			month=9,
			adjustment_type='manual_deduction',
			amount='-100000.00',
			approval_status='approved',
			notes='Correction after lock',
		)

		correction_response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'correction',
				'source_run_id': normal_run.id,
			},
			format='json',
		)

		self.assertEqual(correction_response.status_code, 201)
		self.assertEqual(len(correction_response.data['correction_deltas']), 1)
		self.assertEqual(correction_response.data['correction_deltas'][0]['settlement_strategy'], 'carry_forward_recovery')

		balance = EmployeePayrollCarryForwardBalance.objects.get(employee=self.employee)
		self.assertEqual(str(balance.remaining_amount), '100000.00')
		self.assertEqual(balance.apply_from_year, 2025)
		self.assertEqual(balance.apply_from_month, 10)

	def test_report_generation_creates_pdf_and_jpg_artifacts(self):
		run_response = self.client.post(
			'/api/payroll/runs/',
			{
				'year': 2025,
				'month': 9,
				'run_type': 'normal',
			},
			format='json',
		)
		self.assertEqual(run_response.status_code, 201)
		run_id = run_response.data['id']

		with tempfile.TemporaryDirectory() as media_root:
			with override_settings(MEDIA_ROOT=media_root):
				report_response = self.client.post(
					f'/api/payroll/runs/{run_id}/reports/',
					{'report_type': 'workforce_management'},
					format='json',
				)

			self.assertEqual(report_response.status_code, 201)
			self.assertEqual(len(report_response.data['records']), 2)
			self.assertEqual(PayrollReportArtifact.objects.filter(payroll_run_id=run_id).count(), 2)
			for artifact in PayrollReportArtifact.objects.filter(payroll_run_id=run_id):
				self.assertTrue((Path(media_root) / artifact.file_path).exists())
