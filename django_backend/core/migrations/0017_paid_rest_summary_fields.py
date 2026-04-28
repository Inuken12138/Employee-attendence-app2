from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_paid_rest_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancemonthlysummary',
            name='paid_rest_minutes_total',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='payrollmonthlysummary',
            name='total_paid_rest_minutes',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='payrollrunemployee',
            name='paid_rest_minutes_total',
            field=models.PositiveIntegerField(default=0),
        ),
    ]