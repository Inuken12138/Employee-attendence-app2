"""
Django Serializers.py - Purpose and Relationship

Theoretical Understanding
The serializers.py file serves as a translator between Django models and JSON/XML formats in a REST API. 
It handles data validation, conversion, and formatting for both incoming requests and outgoing responses.

Relationship with Other Components
1. Models (models.py)
- Serializers convert model instances to/from JSON/XML
- Define which model fields should be exposed in the API

class Meta:
    model = Employee
    fields = '__all__'

2. Views (views.py)
- Views use serializers to process incoming data and format responses
- Handles data validation before saving to database

serializer_class = EmployeeSerializer

3. API Response/Request Cycle
- Converts incoming JSON to model instances
- Transforms model instances to JSON for responses
- Handles validation and error reporting

Current Implementation
1. Model Serializers
- EmployeeSerializer: Exposes all Employee model fields
- InventoryItemSerializer: Handles inventory data serialization
- ProductSerializer: Manages product catalog data
- UserSerializer: Limited user field exposure for security
- RegisterSerializer: Special handling for user registration with password protection
"""

from rest_framework import serializers
from .models import Employee, InventoryItem, Product, User

class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = '__all__'

class InventoryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryItem
        fields = '__all__'

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role']

class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'password', 'email', 'role']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user
