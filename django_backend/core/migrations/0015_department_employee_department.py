"""Add departments and optional employee department assignment."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_employee_worker_name_identity'),
    ]

    operations = [
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('code', models.CharField(blank=True, max_length=40, null=True, unique=True)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('shop_paid_rest_enabled', models.BooleanField(default=False)),
                ('paid_rest_days_granted_per_month', models.DecimalField(decimal_places=2, default=2, max_digits=8)),
                ('paid_rest_carry_forward_cap_days', models.DecimalField(decimal_places=2, default=9999, max_digits=8)),
                ('minimum_staff_required_per_shift', models.PositiveIntegerField(default=2)),
                ('allow_half_day_paid_rest', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['name', 'id'],
            },
        ),
        migrations.AddField(
            model_name='employee',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='employees', to='core.department'),
        ),
    ]