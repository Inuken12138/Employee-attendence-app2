"""
Django Models.py - Purpose and Relationship

Theoretical Understanding
The models.py file defines the database schema and business logic using Django's Object-Relational Mapping (ORM). 
It represents database tables as Python classes and provides an abstraction layer for database operations.

Relationship with Other Components
1. Views (views.py)
- Models provide data that views process and send to clients
- Views query models through the ORM
- Models define the structure of data that views can access

2. Serializers (serializers.py)
- Models define the data structure that serializers convert
- Serializers use model fields to create API representations

3. Database
- Models map directly to database tables
- Django ORM translates model operations to SQL queries

Current Implementation
1. User Model
    class User(AbstractUser):
        ROLE_CHOICES = (
            ('manager', 'Manager'),
            ('employee', 'Employee'),
        )
        role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')

- Extends Django's AbstractUser
- Adds role-based authentication

2. Employee Model
    class Employee(models.Model):
        name = models.CharField(max_length=100)
        base_salary = models.FloatField()

- Basic employee information
- Tracks name and salary

3. InventoryItem Model
    class InventoryItem(models.Model):
        name = models.CharField(max_length=100)
        quantity = models.IntegerField()
        unit = models.CharField(max_length=20)
        last_updated = models.DateTimeField(auto_now=True)

- Inventory tracking system
- Automated timestamp updates

4. Product Model
    class Product(models.Model):
        name = models.CharField(max_length=100)
        price = models.FloatField()
        description = models.TextField(blank=True)
        image_url = models.URLField(blank=True)

- Product catalog information
- Optional description and image

How to extend:
1. Add new fields to existing models:
   class Employee(models.Model):
       department = models.CharField(max_length=100)
       hire_date = models.DateField()

2. Create relationships between models:
   class Order(models.Model):
       product = models.ForeignKey(Product, on_delete=models.CASCADE)
       employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True)

3. Add model methods:
   class Product(models.Model):
       def get_discounted_price(self, discount):
           return self.price * (1 - discount)

4. Add Meta options:
   class Meta:
       ordering = ['name']
       verbose_name_plural = 'Categories'
"""

from django.db import models
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from django.utils.text import slugify
from PIL import Image, ImageOps
import os
import uuid

# Create your models here.

class User(AbstractUser):
    ROLE_CHOICES = (
        ('manager', 'Manager'),
        ('employee', 'Employee'),
        ('customer', 'Customer'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')

class Employee(models.Model):
    name = models.CharField(max_length=100)
    #position = models.CharField(max_length=100)
    base_salary = models.FloatField()
    worker_id = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['worker_id', 'name'], name='unique_employee_worker_name'),
        ]
        ordering = ['name', 'id']
    
    def __str__(self):
        return self.name


class AttendanceRecord(models.Model):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('final', 'Final'),
    )

    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['year', 'month', 'status'], name='unique_attendance_record_status'),
        ]

    def __str__(self):
        return f"AttendanceRecord({self.year}-{self.month:02d}, {self.status})"


class AttendanceRecordEmployee(models.Model):
    record = models.ForeignKey(AttendanceRecord, on_delete=models.CASCADE, related_name='employees')
    employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True)
    employee_name = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    worker_id = models.CharField(max_length=50, blank=True)

    class Meta:
        unique_together = ('record', 'worker_id', 'employee_name')

    def __str__(self):
        return f"AttendanceRecordEmployee({self.worker_id or self.employee_name})"


class AttendanceShift(models.Model):
    STATUS_CHOICES = (
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('off', 'Off day'),
        ('missing', 'Missing'),
    )

    record_employee = models.ForeignKey(AttendanceRecordEmployee, on_delete=models.CASCADE, related_name='shifts')
    day = models.PositiveSmallIntegerField()
    raw_logs = models.JSONField(default=list, blank=True)
    morning_in = models.CharField(max_length=20, blank=True)
    morning_out = models.CharField(max_length=20, blank=True)
    afternoon_in = models.CharField(max_length=20, blank=True)
    afternoon_out = models.CharField(max_length=20, blank=True)
    morning_status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='missing')
    afternoon_status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='missing')

    class Meta:
        unique_together = ('record_employee', 'day')

    def __str__(self):
        return f"AttendanceShift({self.record_employee_id}, day {self.day})"


class RosterTemplate(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    cycle_length_weeks = models.PositiveSmallIntegerField(default=1)
    schedule = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class EmployeeRosterAssignment(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='roster_assignment')
    template = models.ForeignKey(RosterTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments')
    effective_start_date = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee_id']

    def __str__(self):
        template_name = self.template.name if self.template else 'No template'
        return f'{self.employee.name} -> {template_name}'

class InventoryItem(models.Model):
    item_code = models.CharField(max_length=50, blank=True)
    name = models.CharField(max_length=100)
    image_url = models.URLField(blank=True)
    image = models.ImageField(upload_to='inventory/', blank=True, null=True)
    quantity = models.IntegerField()
    least_inventory_amount = models.IntegerField(default=0)
    unit = models.CharField(max_length=20, blank=True)
    last_updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old = InventoryItem.objects.get(pk=self.pk)
                if old.image and old.image != self.image:
                    if os.path.isfile(old.image.path):
                        os.remove(old.image.path)
            except InventoryItem.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        if self.image and self.image.path:
            try:
                img = Image.open(self.image.path)
                img = ImageOps.exif_transpose(img)
                img.thumbnail((300, 300), Image.LANCZOS)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.save(self.image.path, optimize=True, quality=85)
            except Exception:
                pass

    def delete(self, *args, **kwargs):
        if self.image and self.image.path and os.path.isfile(self.image.path):
            os.remove(self.image.path)
        super().delete(*args, **kwargs)

class Category(models.Model):
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=250, unique=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    display_order = models.IntegerField(default=0)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Category.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{str(uuid.uuid4())[:6]}"
                counter += 1
            self.slug = slug

        # If replacing an existing image, remove the old file
        if self.pk:
            try:
                old = Category.objects.get(pk=self.pk)
                if old.image and old.image != self.image:
                    if os.path.isfile(old.image.path):
                        os.remove(old.image.path)
            except Category.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        # Resize and optimize uploaded image to 300x300 to match inventory behavior
        if self.image and getattr(self.image, 'path', None):
            try:
                img = Image.open(self.image.path)
                img = ImageOps.exif_transpose(img)
                img.thumbnail((300, 300), Image.LANCZOS)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.save(self.image.path, optimize=True, quality=85)
            except Exception:
                pass

    def get_breadcrumb(self):
        """Return breadcrumb path as list of categories from root to self"""
        breadcrumb = []
        current = self
        while current:
            breadcrumb.insert(0, {'id': current.id, 'name': current.name, 'slug': current.slug})
            current = current.parent
        return breadcrumb

    def get_all_descendants(self):
        """Get all descendant categories recursively"""
        descendants = []
        for child in self.children.all():
            descendants.append(child)
            descendants.extend(child.get_all_descendants())
        return descendants

    def get_level(self):
        """Get the depth level of this category (1 = root, 2 = child of root, etc.)"""
        level = 1
        current = self.parent
        while current:
            level += 1
            current = current.parent
        return level

    def delete(self, *args, **kwargs):
        if self.image and getattr(self.image, 'path', None) and os.path.isfile(self.image.path):
            os.remove(self.image.path)
        super().delete(*args, **kwargs)


class Product(models.Model):
    product_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    price = models.FloatField()
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    slug = models.SlugField(max_length=250, unique=True, blank=True)
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    colour = models.CharField(max_length=50, blank=True)
    material = models.CharField(max_length=100, blank=True)
    is_best_seller = models.BooleanField(default=False)
    is_new = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.product_id})"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = f"{slugify(self.name)}-{self.product_id}"
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.image and self.image.path and os.path.isfile(self.image.path):
            os.remove(self.image.path)
        super().delete(*args, **kwargs)


class CustomerProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='customer_profile')
    phone = models.CharField(max_length=40, blank=True)
    loyalty_id = models.CharField(max_length=80, blank=True)
    default_shipping_address = models.TextField(blank=True)

    def __str__(self):
        return f"CustomerProfile({self.user.username})"


class Purchase(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('refunded', 'Refunded'),
        ('cancelled', 'Cancelled'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='purchases')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='purchases')
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    purchased_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} -> {self.product.name} ({self.status})"


class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews')
    rating = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_purchase = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Review({self.product.name}, {self.user.username}, {self.rating})"


class Workplace(models.Model):
    name = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    radius_meters = models.FloatField(default=150)

    def __str__(self):
        return self.name


class EmployeeFaceProfile(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE)
    face_image = models.ImageField(upload_to='face_profiles/')
    enrolled_at = models.DateTimeField(auto_now_add=True)
