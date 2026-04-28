from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('planner', '0005_kitchendesignerproductprofile_planner_taxonomy'),
    ]

    operations = [
        migrations.AddField(
            model_name='kitchendesignerproductprofile',
            name='allow_vertical_movement',
            field=models.BooleanField(default=False),
        ),
    ]