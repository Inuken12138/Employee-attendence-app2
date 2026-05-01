"""Add extra inventory fields used by the ERP stock-management UI."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_remove_employee_bonus_remove_employee_deductions_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventoryitem',
            name='item_code',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='image_url',
            field=models.URLField(blank=True),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='least_inventory_amount',
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='inventoryitem',
            name='unit',
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
