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
from .models import Employee, InventoryItem, Product, User, Workplace, EmployeeFaceProfile, Category, CustomerProfile, Review, Purchase, RosterTemplate
from .utils import normalize_employee_name, normalize_worker_id, summarize_roster_schedule, validate_roster_schedule


def _serialize_roster_assignment(assignment):
    template = assignment.template
    if template is None:
        return {
            'template_id': None,
            'template_name': None,
            'cycle_length_weeks': None,
            'effective_start_date': assignment.effective_start_date.isoformat() if assignment.effective_start_date else None,
            'summary_lines': [],
        }

    return {
        'template_id': template.id,
        'template_name': template.name,
        'cycle_length_weeks': template.cycle_length_weeks,
        'effective_start_date': assignment.effective_start_date.isoformat() if assignment.effective_start_date else None,
        'summary_lines': summarize_roster_schedule(template.schedule, template.cycle_length_weeks),
    }


class RosterTemplateSerializer(serializers.ModelSerializer):
    usage_count = serializers.SerializerMethodField()
    summary_lines = serializers.SerializerMethodField()

    class Meta:
        model = RosterTemplate
        fields = [
            'id',
            'name',
            'description',
            'cycle_length_weeks',
            'schedule',
            'is_active',
            'usage_count',
            'summary_lines',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'usage_count', 'summary_lines', 'created_at', 'updated_at']

    def validate_cycle_length_weeks(self, value):
        if value < 1 or value > 4:
            raise serializers.ValidationError('Cycle length must be between 1 and 4 weeks.')
        return value

    def validate(self, attrs):
        cycle_length_weeks = attrs.get(
            'cycle_length_weeks',
            self.instance.cycle_length_weeks if self.instance else 1,
        )
        raw_schedule = attrs.get('schedule', self.instance.schedule if self.instance else [])

        try:
            attrs['schedule'] = validate_roster_schedule(raw_schedule, cycle_length_weeks)
        except ValueError as exc:
            raise serializers.ValidationError({'schedule': str(exc)})

        return attrs

    def get_usage_count(self, obj):
        annotated_usage_count = getattr(obj, 'usage_count', None)
        if annotated_usage_count is not None:
            return annotated_usage_count
        return obj.assignments.count()

    def get_summary_lines(self, obj):
        return summarize_roster_schedule(obj.schedule, obj.cycle_length_weeks)

class EmployeeSerializer(serializers.ModelSerializer):
    roster_assignment = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = ['id', 'name', 'base_salary', 'worker_id', 'is_active', 'roster_assignment']

    def validate(self, attrs):
        attrs = super().validate(attrs)

        worker_id = normalize_worker_id(attrs.get('worker_id', getattr(self.instance, 'worker_id', None))) or None
        employee_name = attrs.get('name', getattr(self.instance, 'name', ''))
        attrs['worker_id'] = worker_id

        if worker_id:
            existing = Employee.objects.filter(worker_id=worker_id)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)

            normalized_name = normalize_employee_name(employee_name)
            for employee in existing.only('id', 'name'):
                if normalize_employee_name(employee.name) == normalized_name:
                    raise serializers.ValidationError({
                        'worker_id': 'Another employee already uses this worker ID and name combination.',
                    })

        return attrs

    def get_roster_assignment(self, obj):
        try:
            assignment = obj.roster_assignment
        except obj.__class__.roster_assignment.RelatedObjectDoesNotExist:
            return None

        return _serialize_roster_assignment(assignment)

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
    rating = serializers.FloatField(read_only=True)
    ratingCount = serializers.IntegerField(source='rating_count', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'product_id', 'name', 'price', 'description', 'category', 'category_name', 'category_slug',
            'slug', 'image', 'image_url', 'colour', 'material', 'is_best_seller', 'is_new',
            'rating', 'ratingCount'
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


class CustomerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = CustomerProfile
        fields = ['id', 'user', 'phone', 'loyalty_id', 'default_shipping_address']

class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'password', 'email', 'role']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        if not validated_data.get('role'):
            validated_data['role'] = 'customer'
        user = User.objects.create_user(**validated_data)
        if user.role == 'customer':
            CustomerProfile.objects.get_or_create(user=user)
        return user


class WorkplaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workplace
        fields = '__all__'


class EmployeeFaceProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeFaceProfile
        fields = '__all__'


class ReviewSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'product', 'user', 'user_username', 'rating', 'title', 'body', 'created_at', 'verified_purchase']
        read_only_fields = ['user', 'verified_purchase', 'created_at']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Rating must be between 1 and 5.')
        return value
