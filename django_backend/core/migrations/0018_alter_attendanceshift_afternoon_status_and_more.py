from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_paid_rest_summary_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='attendanceshift',
            name='afternoon_status',
            field=models.CharField(
                choices=[
                    ('present', 'Present'),
                    ('absent', 'Absent'),
                    ('off', 'Off day'),
                    ('missing', 'Missing'),
                    ('paid_rest', 'Paid rest'),
                    ('approved_leave', 'Approved leave'),
                    ('unapproved_leave', 'Unapproved leave'),
                ],
                default='missing',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='attendanceshift',
            name='morning_status',
            field=models.CharField(
                choices=[
                    ('present', 'Present'),
                    ('absent', 'Absent'),
                    ('off', 'Off day'),
                    ('missing', 'Missing'),
                    ('paid_rest', 'Paid rest'),
                    ('approved_leave', 'Approved leave'),
                    ('unapproved_leave', 'Unapproved leave'),
                ],
                default='missing',
                max_length=20,
            ),
        ),
    ]