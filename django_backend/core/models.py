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
from django.contrib.auth.models import AbstractUser
from PIL import Image, ImageOps
import os

# Create your models here.

class User(AbstractUser):
    ROLE_CHOICES = (
        ('manager', 'Manager'),
        ('employee', 'Employee'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')

class Employee(models.Model):
    name = models.CharField(max_length=100)
    #position = models.CharField(max_length=100)
    base_salary = models.FloatField()
    
    def __str__(self):
        return self.name

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

class Product(models.Model):
    name = models.CharField(max_length=100)
    price = models.FloatField()
    description = models.TextField(blank=True)
    image_url = models.URLField(blank=True)


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
