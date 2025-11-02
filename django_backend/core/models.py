from django.db import models
from django.contrib.auth.models import AbstractUser

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
    name = models.CharField(max_length=100)
    quantity = models.IntegerField()
    unit = models.CharField(max_length=20)
    last_updated = models.DateTimeField(auto_now=True)

class Product(models.Model):
    name = models.CharField(max_length=100)
    price = models.FloatField()
    description = models.TextField(blank=True)
    image_url = models.URLField(blank=True)
