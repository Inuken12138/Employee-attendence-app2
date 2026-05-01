"""Normalize worker IDs and temporarily enforce worker-id uniqueness."""

from django.db import migrations, models


def normalize_worker_ids(apps, schema_editor):
	"""Trim stored worker IDs before applying the uniqueness constraint."""

	Employee = apps.get_model('core', 'Employee')
	for employee in Employee.objects.all().order_by('id'):
		worker_id = (employee.worker_id or '').strip() or None
		if employee.worker_id != worker_id:
			employee.worker_id = worker_id
			employee.save(update_fields=['worker_id'])


class Migration(migrations.Migration):

	dependencies = [
		('core', '0012_constructionproject_constructionprojectworklog_and_more'),
	]

	operations = [
		migrations.RunPython(normalize_worker_ids, migrations.RunPython.noop),
		migrations.RemoveConstraint(
			model_name='employee',
			name='unique_employee_worker_name',
		),
		migrations.AlterField(
			model_name='employee',
			name='worker_id',
			field=models.CharField(max_length=50, null=True, unique=True),
		),
	]