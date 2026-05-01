"""Set a safer default value for employee base salary."""

from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('core', '0018_alter_attendanceshift_afternoon_status_and_more'),
	]

	operations = [
		migrations.AlterField(
			model_name='employee',
			name='base_salary',
			field=models.FloatField(default=0),
		),
	]