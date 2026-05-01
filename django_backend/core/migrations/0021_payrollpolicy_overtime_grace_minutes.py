"""Add overtime grace minutes to payroll policy definitions."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_remove_employeecompensationprofile_trial_period_end_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='payrollpolicy',
            name='overtime_grace_minutes',
            field=models.PositiveIntegerField(default=0),
        ),
    ]