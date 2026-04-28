from django.db import migrations, models


def normalize_employee_identity_fields(apps, schema_editor):
	Employee = apps.get_model('core', 'Employee')
	for employee in Employee.objects.all().order_by('id'):
		worker_id = (employee.worker_id or '').strip() or None
		name = ' '.join(str(employee.name or '').split())
		updated_fields = []
		if employee.worker_id != worker_id:
			employee.worker_id = worker_id
			updated_fields.append('worker_id')
		if employee.name != name:
			employee.name = name
			updated_fields.append('name')
		if updated_fields:
			employee.save(update_fields=updated_fields)


class Migration(migrations.Migration):

	dependencies = [
		('core', '0013_employee_worker_id_unique_key'),
	]

	operations = [
		migrations.RunPython(normalize_employee_identity_fields, migrations.RunPython.noop),
		migrations.AlterField(
			model_name='employee',
			name='worker_id',
			field=models.CharField(max_length=50, null=True),
		),
		migrations.AddConstraint(
			model_name='employee',
			constraint=models.UniqueConstraint(fields=('worker_id', 'name'), name='unique_employee_worker_name'),
		),
	]