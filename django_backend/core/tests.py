# Tests
# When running `python manage.py test`, the backend switches to an in-memory SQLite database so tests do not require PostgreSQL permissions.

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

from .models import AttendanceOvertimeDecision, AttendanceRecord, AttendanceRecordEmployee, AttendanceShift, ConstructionProject, ConstructionProjectAssignment, ConstructionProjectWorkLog, Employee, EmployeeCompensationProfile, EmployeeLeaveRecord, EmployeePayrollAdjustment, EmployeePayrollCarryForwardBalance, EmployeeRosterAssignment, PayrollPolicy, PayrollReportArtifact, PayrollRun, RosterTemplate
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

	def _build_valid_attendance_upload(self, filename='attendance.xls'):
		file_path = self._attendance_file_path()
		with file_path.open('rb') as handle:
			return SimpleUploadedFile(
				filename,
				handle.read(),
				content_type='application/vnd.ms-excel',
			)

	def _build_invalid_attendance_upload(self, filename='wrong-sheet.xlsx'):
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

	def test_create_employee_requires_worker_id(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': 'No Worker ID',
				'base_salary': 900000,
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
				'base_salary': 900000,
				'worker_id': 'E1002',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('name', response.data)

	def test_create_employee_rejects_non_positive_base_salary(self):
		response = self.client.post(
			'/api/employees/',
			{
				'name': 'No Salary',
				'base_salary': 0,
				'worker_id': 'E1002',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('base_salary', response.data)

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
				'base_salary': 900000,
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
				'base_salary': 900000,
				'worker_id': 'E1001',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('worker_id', response.data)

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

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

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

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

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

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

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

		save_response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

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

		response = self.client.post('/api/payroll/attendance-records/save/', payload, format='json')

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


class PayrollPlatformTests(APITestCase):
	def setUp(self):
		self.employee = Employee.objects.create(
			name='Payroll Employee',
			base_salary=800000,
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
