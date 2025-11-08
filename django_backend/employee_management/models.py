from django.db import models

class Employee(models.Model):
    name = models.CharField(max_length=100)
    #position = models.CharField(max_length=100)
    base_salary = models.FloatField()
    
    def __str__(self):
        return self.name