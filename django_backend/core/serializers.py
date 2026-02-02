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
from .models import Employee, InventoryItem, Product, User, Workplace, EmployeeFaceProfile, Category

class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = '__all__'

class InventoryItemSerializer(serializers.ModelSerializer):
    inventory_condition = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            'id',
            'item_code',
            'name',
            'image_url',
            'image',
            'quantity',
            'least_inventory_amount',
            'unit',
            'last_updated',
            'inventory_condition',
        ]

    def get_inventory_condition(self, obj):
        return 'requiring restock' if obj.quantity < obj.least_inventory_amount else 'normal'

class CategorySerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    breadcrumb = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image', 'image_url', 'parent', 'display_order', 'breadcrumb', 'children_count', 'level']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_breadcrumb(self, obj):
        return obj.get_breadcrumb()

    def get_children_count(self, obj):
        return obj.children.count()

    def get_level(self, obj):
        return obj.get_level()


class ProductSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'product_id', 'name', 'price', 'description', 'category', 'category_name', 'category_slug',
            'slug', 'image', 'image_url', 'colour', 'material', 'is_best_seller', 'is_new'
        ]

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def validate_product_id(self, value):
        """Validate that product_id is unique"""
        if self.instance and self.instance.product_id == value:
            return value
        if Product.objects.filter(product_id=value).exists():
            raise serializers.ValidationError("A product with this product_id already exists.")
        return value

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


class WorkplaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workplace
        fields = '__all__'


class EmployeeFaceProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeFaceProfile
        fields = '__all__'
