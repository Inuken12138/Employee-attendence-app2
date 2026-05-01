"""Remove an unused trial-period field from compensation profiles."""

from django.db import migrations


class Migration(migrations.Migration):

	dependencies = [
		('core', '0019_alter_employee_base_salary_default'),
	]

	operations = [
		migrations.RemoveField(
			model_name='employeecompensationprofile',
			name='trial_period_end_date',
		),
	]