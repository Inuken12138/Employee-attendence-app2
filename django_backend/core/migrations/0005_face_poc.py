from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_add_inventory_image'),
    ]

    operations = [
        migrations.CreateModel(
            name='Workplace',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('latitude', models.FloatField()),
                ('longitude', models.FloatField()),
                ('radius_meters', models.FloatField(default=150)),
            ],
        ),
        migrations.CreateModel(
            name='EmployeeFaceProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('face_image', models.ImageField(upload_to='face_profiles/')),
                ('enrolled_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to='core.employee')),
            ],
        ),
    ]
