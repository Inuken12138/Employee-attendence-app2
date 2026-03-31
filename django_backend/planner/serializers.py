from rest_framework import serializers

from core.models import Product
from planner.models import (
    KitchenCartBundle,
    KitchenDesignerAssetValidation,
    KitchenDesignerProductProfile,
    KitchenProject,
    KitchenProjectDuplication,
    KitchenProjectVersion,
    KitchenValidationRun,
    KitchenProductionAsset,
)
from planner.taxonomy import planner_path_is_valid


class KitchenProductionAssetSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = KitchenProductionAsset
        fields = [
            'id',
            'label',
            'asset_type',
            'file',
            'file_url',
            'file_format',
            'machine_profile',
            'variant_key',
            'version_label',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class KitchenDesignerAssetValidationSerializer(serializers.ModelSerializer):
    validated_by_username = serializers.CharField(source='validated_by.username', read_only=True)

    class Meta:
        model = KitchenDesignerAssetValidation
        fields = [
            'id',
            'status',
            'detected_format',
            'file_size_bytes',
            'warnings',
            'errors',
            'validated_at',
            'validated_by',
            'validated_by_username',
        ]
        read_only_fields = fields


class KitchenDesignerProductProfileSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_code = serializers.CharField(source='product.product_id', read_only=True)
    glb_file_url = serializers.SerializerMethodField()
    latest_validation = serializers.SerializerMethodField()
    production_assets = serializers.SerializerMethodField()

    class Meta:
        model = KitchenDesignerProductProfile
        fields = [
            'id',
            'product',
            'product_name',
            'product_code',
            'is_enabled',
            'catalog_state',
            'planner_role',
            'planner_root_category',
            'planner_group_category',
            'planner_leaf_category',
            'glb_file',
            'glb_file_url',
            'width_mm',
            'depth_mm',
            'height_mm',
            'bounding_box_mm',
            'origin_anchor',
            'default_rotation_deg',
            'requires_wall_attachment',
            'requires_benchtop',
            'supports_left_end_panel',
            'supports_right_end_panel',
            'pricing_mode',
            'override_price',
            'interaction_schema',
            'constraint_schema',
            'compatibility_schema',
            'has_production_assets',
            'production_asset_notes',
            'validation_notes',
            'updated_by',
            'created_at',
            'updated_at',
            'latest_validation',
            'production_assets',
        ]
        read_only_fields = ['created_at', 'updated_at', 'updated_by']

    def validate_product(self, value):
        if not Product.objects.filter(pk=value.pk).exists():
            raise serializers.ValidationError('Product not found.')
        return value

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        root_category = attrs.get('planner_root_category', getattr(instance, 'planner_root_category', '')) or ''
        group_category = attrs.get('planner_group_category', getattr(instance, 'planner_group_category', '')) or ''
        leaf_category = attrs.get('planner_leaf_category', getattr(instance, 'planner_leaf_category', '')) or ''

        if not planner_path_is_valid(root_category, group_category, leaf_category):
            raise serializers.ValidationError('Planner category path is invalid for the current hardcoded planner taxonomy.')

        return attrs

    def get_glb_file_url(self, obj):
        if obj.glb_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.glb_file.url)
            return obj.glb_file.url
        return None

    def get_latest_validation(self, obj):
        validation = obj.asset_validations.order_by('-validated_at').first()
        if not validation:
            return None
        return KitchenDesignerAssetValidationSerializer(validation).data

    def get_production_assets(self, obj):
        assets = obj.production_assets.all()
        return KitchenProductionAssetSerializer(assets, many=True, context=self.context).data


class PlannerCatalogProductSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    planner_profile_id = serializers.IntegerField(source='kitchen_designer_profile.id', read_only=True)
    planner_role = serializers.CharField(source='kitchen_designer_profile.planner_role', read_only=True)
    planner_root_category = serializers.CharField(source='kitchen_designer_profile.planner_root_category', read_only=True)
    planner_group_category = serializers.CharField(source='kitchen_designer_profile.planner_group_category', read_only=True)
    planner_leaf_category = serializers.CharField(source='kitchen_designer_profile.planner_leaf_category', read_only=True)
    width_mm = serializers.IntegerField(source='kitchen_designer_profile.width_mm', read_only=True)
    depth_mm = serializers.IntegerField(source='kitchen_designer_profile.depth_mm', read_only=True)
    height_mm = serializers.IntegerField(source='kitchen_designer_profile.height_mm', read_only=True)
    glb_file_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id',
            'product_id',
            'name',
            'slug',
            'price',
            'description',
            'colour',
            'material',
            'image_url',
            'planner_profile_id',
            'planner_role',
            'planner_root_category',
            'planner_group_category',
            'planner_leaf_category',
            'width_mm',
            'depth_mm',
            'height_mm',
            'glb_file_url',
        ]

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_glb_file_url(self, obj):
        profile = getattr(obj, 'kitchen_designer_profile', None)
        if profile and profile.glb_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(profile.glb_file.url)
            return profile.glb_file.url
        return None


class KitchenProjectVersionSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = KitchenProjectVersion
        fields = [
            'id',
            'version_name',
            'version_number',
            'scene_snapshot',
            'price_snapshot',
            'validation_summary',
            'source_version',
            'is_auto_snapshot',
            'created_by',
            'created_by_username',
            'created_at',
        ]
        read_only_fields = ['created_at', 'created_by', 'created_by_username']


class KitchenProjectSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    current_version = KitchenProjectVersionSerializer(read_only=True)
    version_count = serializers.SerializerMethodField()
    latest_version_number = serializers.SerializerMethodField()

    class Meta:
        model = KitchenProject
        fields = [
            'id',
            'title',
            'slug',
            'status',
            'estimated_price',
            'share_mode',
            'share_token',
            'owner',
            'owner_username',
            'current_version',
            'version_count',
            'latest_version_number',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'slug',
            'share_token',
            'owner',
            'owner_username',
            'current_version',
            'version_count',
            'latest_version_number',
            'created_at',
            'updated_at',
        ]

    def get_version_count(self, obj):
        return obj.versions.count()

    def get_latest_version_number(self, obj):
        if obj.current_version:
            return obj.current_version.version_number
        latest = obj.versions.order_by('-version_number').first()
        return latest.version_number if latest else 0


class KitchenValidationRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = KitchenValidationRun
        fields = [
            'id',
            'status',
            'hard_issue_count',
            'soft_issue_count',
            'issues',
            'started_at',
            'completed_at',
        ]
        read_only_fields = fields


class KitchenCartBundleSerializer(serializers.ModelSerializer):
    project_slug = serializers.CharField(source='project.slug', read_only=True)

    class Meta:
        model = KitchenCartBundle
        fields = [
            'id',
            'project',
            'project_slug',
            'project_version',
            'status',
            'bundle_total',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class KitchenProjectDuplicationSerializer(serializers.ModelSerializer):
    duplicated_by_username = serializers.CharField(source='duplicated_by.username', read_only=True)

    class Meta:
        model = KitchenProjectDuplication
        fields = [
            'id',
            'source_project',
            'source_version',
            'duplicated_project',
            'duplicated_by',
            'duplicated_by_username',
            'reason',
            'created_at',
        ]
        read_only_fields = fields
