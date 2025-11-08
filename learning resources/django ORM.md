ERD Relationship Symbols Explained
1. One (|)
Meaning: Exactly one record
Example: One employee has exactly one employee ID

2. Many (<)
Meaning: Multiple records (one or more)
Example: A department can have many employees

3. One (and only one) (||)
Meaning: Exactly one, mandatory relationship
Example: Every employee must belong to exactly one company

4. Zero or one (○|)
Meaning: Optional relationship, at most one
Example: An employee may or may not have one manager

5. One or many (|<)
Meaning: At least one, possibly more
Example: A project must have at least one employee assigned

6. Zero or many (○<)
Meaning: Optional relationship, any number including none
Example: A department may have zero or many employees

Translating ERD to Django Models
One-to-One Relationships
ERD: Employee ||—○| Profile (One employee has zero or one profile)

```
class Employee(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()

class Profile(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, null=True, blank=True)
    bio = models.TextField()
    profile_picture = models.ImageField(upload_to='profiles/', null=True, blank=True)
```
One-to-Many Relationships
ERD: Department ||—○< Employee (One department has zero or many employees)


```
class Department(models.Model):
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=200)

class Employee(models.Model):
    name = models.CharField(max_length=100)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    # null=True, blank=True because it's "zero or many" (optional)

```

ERD: Department ||—|< Employee (One department has one or many employees)

```
class Employee(models.Model):
    name = models.CharField(max_length=100)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    # No null=True because it's mandatory ("one or many")
```

ERD: Department ||—|< Employee (One department has one or many employees)


```
class Employee(models.Model):
    name = models.CharField(max_length=100)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    # No null=True because it's mandatory ("one or many")

```
Many-to-Many Relationships
ERD: Employee ○<—>○ Project (Employees can work on zero or many projects, projects can have zero or many employees)


```
class Project(models.Model):
    name = models.CharField(max_length=100)
    deadline = models.DateField()

class Employee(models.Model):
    name = models.CharField(max_length=100)
    projects = models.ManyToManyField(Project, blank=True)
    # blank=True because it's "zero or many" (optional)

```
ERD: Employee |<—>|< Project (Employees must work on at least one project, projects must have at least one employee)


```
class Employee(models.Model):
    name = models.CharField(max_length=100)
    projects = models.ManyToManyField(Project)
    # No blank=True because it's mandatory ("one or many")
    
    def clean(self):
        # Custom validation to ensure at least one project
        if self.pk and self.projects.count() == 0:
            raise ValidationError("Employee must be assigned to at least one project")
```
Complete Example: Employee Management System

```
from django.db import models
from django.core.exceptions import ValidationError

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    location = models.CharField(max_length=200)
    
    def __str__(self):
        return self.name

class Employee(models.Model):
    # Employee ||—|| Department (Every employee must have exactly one department)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    
    # Employee ||—○| Employee (Self-referencing: employee may have one manager)
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    
    def __str__(self):
        return self.name

class Profile(models.Model):
    # Employee ||—○| Profile (Each employee may have zero or one profile)
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, null=True, blank=True)
    
    bio = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)

class Project(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Project ○<—>○ Employee (Projects can have zero or many employees, employees can work on zero or many projects)
    employees = models.ManyToManyField(Employee, through='ProjectAssignment', blank=True)

class ProjectAssignment(models.Model):
    """Through model for additional data about the relationship"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    role = models.CharField(max_length=100)  # e.g., "Developer", "Manager"
    hours_allocated = models.PositiveIntegerField()
    
    class Meta:
        unique_together = ('employee', 'project')

```
Key Translation Rules
Mandatory vs Optional
Solid line (||, |<): Use null=False (default)
Circle (○|, ○<): Use null=True, blank=True
Cardinality Translation
One: ForeignKey or OneToOneField
Many: ManyToManyField or reverse ForeignKey


Django Field Parameters

```
# ERD: Department ||—○< Employee
department = models.ForeignKey(Department, on_delete=models.CASCADE, null=True, blank=True)

# ERD: Department ||—|< Employee  
department = models.ForeignKey(Department, on_delete=models.CASCADE)

# ERD: Employee ○<—>○ Project
projects = models.ManyToManyField(Project, blank=True)

# ERD: Employee |<—>|< Project
projects = models.ManyToManyField(Project)
```

This systematic approach helps you translate any ERD directly into Django models while preserving the business rules and relationships!