"""Add paid-rest request and monthly balance models."""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0015_department_employee_department'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeePaidRestRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rest_date', models.DateField()),
                ('duration_unit', models.CharField(choices=[('full_day', 'Full day'), ('half_day', 'Half day')], default='full_day', max_length=20)),
                ('linked_attendance_shift', models.CharField(blank=True, choices=[('', 'Unlinked'), ('morning', 'Morning'), ('afternoon', 'Afternoon')], max_length=20)),
                ('paid_rest_days', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('submission_status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='draft', max_length=20)),
                ('employee_reason', models.TextField(blank=True)),
                ('manager_note', models.TextField(blank=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('decision_at', models.DateTimeField(blank=True, null=True)),
                ('coverage_snapshot_json', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('decision_by', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='decided_employee_paid_rest_requests', to=settings.AUTH_USER_MODEL)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=models.PROTECT, related_name='paid_rest_requests', to='core.department')),
                ('employee', models.ForeignKey(on_delete=models.CASCADE, related_name='paid_rest_requests', to='core.employee')),
                ('submitted_by', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='submitted_employee_paid_rest_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['rest_date', 'employee_id', 'id'],
            },
        ),
        migrations.CreateModel(
            name='EmployeePaidRestMonthlyBalance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveIntegerField()),
                ('month', models.PositiveSmallIntegerField()),
                ('opening_balance_days', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('granted_days', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('used_days', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('closing_balance_days', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('carry_forward_cap_days', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('calc_snapshot', models.JSONField(blank=True, default=dict)),
                ('generated_at', models.DateTimeField(auto_now=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=models.PROTECT, related_name='paid_rest_balances', to='core.department')),
                ('employee', models.ForeignKey(on_delete=models.CASCADE, related_name='paid_rest_balances', to='core.employee')),
            ],
            options={
                'ordering': ['-year', '-month', 'employee_id'],
                'unique_together': {('employee', 'year', 'month')},
            },
        ),
    ]