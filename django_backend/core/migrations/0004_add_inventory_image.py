"""Add image upload support for inventory items."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_add_inventory_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventoryitem',
            name='image',
            field=models.ImageField(blank=True, null=True, upload_to='inventory/'),
        ),
    ]
