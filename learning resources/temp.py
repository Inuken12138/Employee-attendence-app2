from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal
from datetime import datetime, timedelta
import calendar

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    manager = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_department')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name

class Position(models.Model):
    title = models.CharField(max_length=100)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    base_salary = models.DecimalField(max_digits=10, decimal_places=2)
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    description = models.TextField(blank=True)
    
    def __str__(self):
        return f"{self.title} - {self.department.name}"

class Employee(models.Model):
    EMPLOYMENT_STATUS = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('terminated', 'Terminated'),
        ('on_leave', 'On Leave'),
    ]
    
    EMPLOYMENT_TYPE = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('contract', 'Contract'),
        ('intern', 'Intern'),
    ]
    
    # Personal Information
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    employee_id = models.CharField(max_length=20, unique=True)
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    
    # Employment Information
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True)
    position = models.ForeignKey(Position, on_delete=models.SET_NULL, null=True)
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    
    # Employment Details
    hire_date = models.DateField()
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE, default='full_time')
    employment_status = models.CharField(max_length=20, choices=EMPLOYMENT_STATUS, default='active')
    termination_date = models.DateField(null=True, blank=True)
    
    # Contact Information
    address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    @property
    def years_of_service(self):
        if self.termination_date:
            end_date = self.termination_date
        else:
            end_date = datetime.now().date()
        return (end_date - self.hire_date).days / 365.25
    
    def __str__(self):
        return f"{self.employee_id} - {self.full_name}"

class WorkSchedule(models.Model):
    DAYS_OF_WEEK = [
        (0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'),
        (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')
    ]
    
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='schedules')
    day_of_week = models.IntegerField(choices=DAYS_OF_WEEK)
    start_time = models.TimeField()
    end_time = models.TimeField()
    break_duration = models.DurationField(default=timedelta(hours=1))  # Lunch break
    is_working_day = models.BooleanField(default=True)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    
    class Meta:
        unique_together = ('employee', 'day_of_week', 'effective_from')
    
    @property
    def total_work_hours(self):
        if not self.is_working_day:
            return timedelta(0)
        start = datetime.combine(datetime.today(), self.start_time)
        end = datetime.combine(datetime.today(), self.end_time)
        return (end - start) - self.break_duration

class AttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('early_leave', 'Early Leave'),
        ('half_day', 'Half Day'),
        ('holiday', 'Holiday'),
        ('sick_leave', 'Sick Leave'),
        ('vacation', 'Vacation'),
        ('personal_leave', 'Personal Leave'),
    ]
    
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField()
    
    # Time tracking
    clock_in = models.DateTimeField(null=True, blank=True)
    clock_out = models.DateTimeField(null=True, blank=True)
    break_start = models.DateTimeField(null=True, blank=True)
    break_end = models.DateTimeField(null=True, blank=True)
    
    # Calculated fields
    total_hours = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    # Status and notes
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='present')
    notes = models.TextField(blank=True)
    
    # Approval workflow
    is_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_attendance')
    approved_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('employee', 'date')
        ordering = ['-date']
    
    def calculate_total_hours(self):
        """Calculate total work hours for the day"""
        if not self.clock_in or not self.clock_out:
            return Decimal('0.00')
        
        total_time = self.clock_out - self.clock_in
        
        # Subtract break time if recorded
        if self.break_start and self.break_end:
            break_time = self.break_end - self.break_start
            total_time -= break_time
        
        # Convert to decimal hours
        total_hours = Decimal(str(total_time.total_seconds() / 3600))
        return round(total_hours, 2)
    
    def calculate_overtime(self):
        """Calculate overtime hours based on standard 8-hour workday"""
        total_hours = self.calculate_total_hours()
        standard_hours = Decimal('8.00')
        
        if total_hours > standard_hours:
            return total_hours - standard_hours
        return Decimal('0.00')
    
    def save(self, *args, **kwargs):
        # Auto-calculate total hours and overtime
        if self.clock_in and self.clock_out:
            self.total_hours = self.calculate_total_hours()
            self.overtime_hours = self.calculate_overtime()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.employee.full_name} - {self.date} ({self.status})"

class LeaveType(models.Model):
    name = models.CharField(max_length=50, unique=True)  # Sick, Vacation, Personal, etc.
    max_days_per_year = models.PositiveIntegerField()
    is_paid = models.BooleanField(default=True)
    requires_approval = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    
    def __str__(self):
        return self.name

class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE)
    
    start_date = models.DateField()
    end_date = models.DateField()
    total_days = models.PositiveIntegerField()
    reason = models.TextField()
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    approved_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_leaves')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        # Auto-calculate total days
        if self.start_date and self.end_date:
            self.total_days = (self.end_date - self.start_date).days + 1
        super().save(*args, **kwargs)
    
    class Meta:
        ordering = ['-created_at']

class SalaryStructure(models.Model):
    """Define salary components and calculation rules"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='salary_structures')
    
    # Basic salary components
    base_salary = models.DecimalField(max_digits=10, decimal_places=2)
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    
    # Allowances
    house_allowance = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    transport_allowance = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    meal_allowance = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    other_allowances = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    
    # Overtime rates
    overtime_rate_multiplier = models.DecimalField(max_digits=3, decimal_places=2, default=1.5)
    holiday_rate_multiplier = models.DecimalField(max_digits=3, decimal_places=2, default=2.0)
    
    # Tax and deductions
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    insurance_deduction = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    retirement_contribution = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-effective_from']
    
    @property
    def total_allowances(self):
        return self.house_allowance + self.transport_allowance + self.meal_allowance + self.other_allowances
    
    @property
    def gross_monthly_salary(self):
        return self.base_salary + self.total_allowances

class Payroll(models.Model):
    """Monthly payroll calculation"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payrolls')
    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.CASCADE)
    
    # Period
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    
    # Attendance summary
    days_worked = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    total_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    leave_days = models.PositiveIntegerField(default=0)
    absent_days = models.PositiveIntegerField(default=0)
    
    # Calculated amounts
    base_pay = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    overtime_pay = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    allowances = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    gross_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Deductions
    tax_deduction = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    insurance_deduction = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    retirement_deduction = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    other_deductions = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    
    # Final amount
    net_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Status
    is_processed = models.BooleanField(default=False)
    processed_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_payrolls')
    processed_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('employee', 'year', 'month')
        ordering = ['-year', '-month']
    
    def calculate_payroll(self):
        """Calculate complete payroll for the employee"""
        # Get attendance data for the month
        attendance_records = AttendanceRecord.objects.filter(
            employee=self.employee,
            date__year=self.year,
            date__month=self.month
        )
        
        # Calculate attendance summary
        self.days_worked = attendance_records.filter(status='present').count()
        self.total_hours = sum(record.total_hours or 0 for record in attendance_records)
        self.overtime_hours = sum(record.overtime_hours or 0 for record in attendance_records)
        self.leave_days = attendance_records.filter(status__in=['sick_leave', 'vacation', 'personal_leave']).count()
        self.absent_days = attendance_records.filter(status='absent').count()
        
        # Calculate base pay
        total_working_days = calendar.monthrange(self.year, self.month)[1]
        daily_rate = self.salary_structure.base_salary / total_working_days
        self.base_pay = daily_rate * self.days_worked
        
        # Calculate overtime pay
        if self.salary_structure.hourly_rate:
            overtime_rate = self.salary_structure.hourly_rate * self.salary_structure.overtime_rate_multiplier
            self.overtime_pay = overtime_rate * self.overtime_hours
        
        # Add allowances
        self.allowances = self.salary_structure.total_allowances
        
        # Calculate gross salary
        self.gross_salary = self.base_pay + self.overtime_pay + self.allowances
        
        # Calculate deductions
        self.tax_deduction = self.gross_salary * (self.salary_structure.tax_percentage / 100)
        self.insurance_deduction = self.salary_structure.insurance_deduction
        self.retirement_deduction = self.salary_structure.retirement_contribution
        self.total_deductions = (self.tax_deduction + self.insurance_deduction + 
                               self.retirement_deduction + self.other_deductions)
        
        # Calculate net salary
        self.net_salary = self.gross_salary - self.total_deductions
        
        self.save()
    
    def __str__(self):
        return f"{self.employee.full_name} - {self.year}/{self.month:02d}"

class Bonus(models.Model):
    """Performance bonuses and one-time payments"""
    BONUS_TYPES = [
        ('performance', 'Performance Bonus'),
        ('festival', 'Festival Bonus'),
        ('project', 'Project Completion'),
        ('retention', 'Retention Bonus'),
        ('other', 'Other'),
    ]
    
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='bonuses')
    bonus_type = models.CharField(max_length=20, choices=BONUS_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField()
    date_awarded = models.DateField()
    
    # Link to payroll if processed
    payroll = models.ForeignKey(Payroll, on_delete=models.SET_NULL, null=True, blank=True, related_name='bonuses')
    
    approved_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_bonuses')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.employee.full_name} - {self.bonus_type} ({self.amount})"