from pathlib import Path
from uuid import uuid4

from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils.text import slugify

from core.models import Product, User


MAX_GLB_FILE_SIZE_BYTES = 25 * 1024 * 1024


def _profile_upload_path(instance, filename):
    suffix = Path(filename).suffix.lower()
    safe_name = Path(filename).stem.replace(' ', '-').lower() or 'model'
    return f"planner/products/{instance.product_id}/{safe_name}{suffix}"


def _production_asset_upload_path(instance, filename):
    suffix = Path(filename).suffix.lower()
    safe_name = Path(filename).stem.replace(' ', '-').lower() or 'asset'
    return f"planner/production/{instance.designer_profile.product.product_id}/{safe_name}{suffix}"


class KitchenDesignerProductProfile(models.Model):
    class CatalogState(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        STAGING = 'staging', 'Staging'
        PUBLISHED = 'published', 'Published'
        ARCHIVED = 'archived', 'Archived'

    class PlannerRole(models.TextChoices):
        BASE = 'base', 'Base cabinet'
        WALL = 'wall', 'Wall cabinet'
        TALL = 'tall', 'Tall cabinet'
        PANEL = 'panel', 'Panel'
        BENCHTOP = 'benchtop', 'Benchtop'
        APPLIANCE = 'appliance', 'Appliance'
        ACCESSORY = 'accessory', 'Accessory'

    class OriginAnchor(models.TextChoices):
        FLOOR_BACK_LEFT = 'floor_back_left', 'Floor back left'
        FLOOR_BACK_CENTER = 'floor_back_center', 'Floor back center'
        CENTER = 'center', 'Center'

    class PricingMode(models.TextChoices):
        USE_PRODUCT_PRICE = 'use_product_price', 'Use product price'
        OVERRIDE = 'override', 'Override'
        FORMULA = 'formula', 'Formula'

    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='kitchen_designer_profile')
    is_enabled = models.BooleanField(default=False)
    catalog_state = models.CharField(max_length=20, choices=CatalogState.choices, default=CatalogState.DRAFT)
    planner_role = models.CharField(max_length=20, choices=PlannerRole.choices, blank=True)
    glb_file = models.FileField(
        upload_to=_profile_upload_path,
        blank=True,
        null=True,
        validators=[FileExtensionValidator(['glb'])],
    )
    width_mm = models.PositiveIntegerField(blank=True, null=True)
    depth_mm = models.PositiveIntegerField(blank=True, null=True)
    height_mm = models.PositiveIntegerField(blank=True, null=True)
    bounding_box_mm = models.JSONField(default=dict, blank=True)
    origin_anchor = models.CharField(max_length=30, choices=OriginAnchor.choices, default=OriginAnchor.FLOOR_BACK_LEFT)
    default_rotation_deg = models.IntegerField(default=0)
    requires_wall_attachment = models.BooleanField(default=False)
    requires_benchtop = models.BooleanField(default=False)
    supports_left_end_panel = models.BooleanField(default=False)
    supports_right_end_panel = models.BooleanField(default=False)
    pricing_mode = models.CharField(max_length=20, choices=PricingMode.choices, default=PricingMode.USE_PRODUCT_PRICE)
    override_price = models.FloatField(blank=True, null=True)
    interaction_schema = models.JSONField(default=dict, blank=True)
    constraint_schema = models.JSONField(default=dict, blank=True)
    compatibility_schema = models.JSONField(default=dict, blank=True)
    has_production_assets = models.BooleanField(default=False)
    production_asset_notes = models.TextField(blank=True)
    validation_notes = models.TextField(blank=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_kitchen_profiles')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['product__name']

    def __str__(self):
        return f"KitchenDesignerProductProfile({self.product.product_id})"


class KitchenDesignerAssetValidation(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PASSED = 'passed', 'Passed'
        FAILED = 'failed', 'Failed'

    designer_profile = models.ForeignKey(KitchenDesignerProductProfile, on_delete=models.CASCADE, related_name='asset_validations')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    detected_format = models.CharField(max_length=20, blank=True)
    file_size_bytes = models.BigIntegerField(default=0)
    warnings = models.JSONField(default=list, blank=True)
    errors = models.JSONField(default=list, blank=True)
    validated_at = models.DateTimeField(auto_now_add=True)
    validated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='kitchen_asset_validations')

    class Meta:
        ordering = ['-validated_at']

    def __str__(self):
        return f"KitchenDesignerAssetValidation({self.designer_profile.product.product_id}, {self.status})"


class KitchenProductionAsset(models.Model):
    class AssetType(models.TextChoices):
        GCODE = 'gcode', 'G-code'
        CNC_PROGRAM = 'cnc_program', 'CNC program'
        TOOLPATH = 'toolpath', 'Toolpath'
        SETUP_SHEET = 'setup_sheet', 'Setup sheet'
        CUT_LIST = 'cut_list', 'Cut list'
        MANUFACTURING_PDF = 'manufacturing_pdf', 'Manufacturing PDF'
        OTHER = 'other', 'Other'

    designer_profile = models.ForeignKey(KitchenDesignerProductProfile, on_delete=models.CASCADE, related_name='production_assets')
    label = models.CharField(max_length=120)
    asset_type = models.CharField(max_length=30, choices=AssetType.choices, default=AssetType.OTHER)
    file = models.FileField(upload_to=_production_asset_upload_path)
    file_format = models.CharField(max_length=30, blank=True)
    machine_profile = models.CharField(max_length=120, blank=True)
    variant_key = models.CharField(max_length=120, blank=True)
    version_label = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['label', '-created_at']

    def __str__(self):
        return f"KitchenProductionAsset({self.label})"


class KitchenProject(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        VALIDATING = 'validating', 'Validating'
        VALID = 'valid', 'Valid'
        INVALID = 'invalid', 'Invalid'
        PROCEEDING = 'proceeding', 'Proceeding'
        ORDERED = 'ordered', 'Ordered'
        ARCHIVED = 'archived', 'Archived'

    class ShareMode(models.TextChoices):
        PRIVATE = 'private', 'Private'
        VIEW_LINK = 'view_link', 'View link'

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='kitchen_projects')
    title = models.CharField(max_length=160, default='Untitled kitchen project')
    slug = models.SlugField(max_length=80, unique=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    estimated_price = models.FloatField(default=0)
    share_token = models.CharField(max_length=64, blank=True, null=True)
    share_mode = models.CharField(max_length=20, choices=ShareMode.choices, default=ShareMode.PRIVATE)
    current_version = models.ForeignKey('KitchenProjectVersion', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def ensure_share_token(self):
        if self.share_mode == self.ShareMode.VIEW_LINK and not self.share_token:
            self.share_token = uuid4().hex

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.title)[:60] or 'kitchen-project'
            self.slug = f"{base_slug}-{uuid4().hex[:8]}"

        self.ensure_share_token()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"KitchenProject({self.slug})"


class KitchenProjectVersion(models.Model):
    project = models.ForeignKey(KitchenProject, on_delete=models.CASCADE, related_name='versions')
    version_name = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='kitchen_project_versions')
    version_number = models.PositiveIntegerField()
    scene_snapshot = models.JSONField(default=dict, blank=True)
    price_snapshot = models.FloatField(default=0)
    validation_summary = models.JSONField(default=dict, blank=True)
    source_version = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='derived_versions')
    is_auto_snapshot = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version_number', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['project', 'version_number'], name='unique_kitchen_project_version_number'),
        ]

    def save(self, *args, **kwargs):
        if not self.version_name:
            self.version_name = f"Version {self.version_number}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"KitchenProjectVersion({self.project.slug}, v{self.version_number})"


class KitchenValidationRun(models.Model):
    class Status(models.TextChoices):
        PASSED = 'passed', 'Passed'
        FAILED = 'failed', 'Failed'

    project_version = models.ForeignKey(KitchenProjectVersion, on_delete=models.CASCADE, related_name='validation_runs')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FAILED)
    hard_issue_count = models.PositiveIntegerField(default=0)
    soft_issue_count = models.PositiveIntegerField(default=0)
    issues = models.JSONField(default=list, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-completed_at', '-started_at']

    def __str__(self):
        return f"KitchenValidationRun({self.project_version.project.slug}, {self.status})"


class KitchenCartBundle(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        SUPERSEDED = 'superseded', 'Superseded'
        CHECKED_OUT = 'checked_out', 'Checked out'

    project = models.ForeignKey(KitchenProject, on_delete=models.CASCADE, related_name='cart_bundles')
    project_version = models.ForeignKey(KitchenProjectVersion, on_delete=models.CASCADE, related_name='cart_bundles')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    bundle_total = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        return f"KitchenCartBundle({self.project.slug}, {self.status})"


class KitchenProjectDuplication(models.Model):
    class Reason(models.TextChoices):
        REP_ASSIST = 'rep_assist', 'Rep assist'
        CUSTOMER_COPY = 'customer_copy', 'Customer copy'
        VARIANT = 'variant', 'Variant'
        OTHER = 'other', 'Other'

    source_project = models.ForeignKey(KitchenProject, on_delete=models.CASCADE, related_name='duplication_sources')
    source_version = models.ForeignKey(KitchenProjectVersion, on_delete=models.SET_NULL, null=True, blank=True, related_name='duplication_sources')
    duplicated_project = models.ForeignKey(KitchenProject, on_delete=models.CASCADE, related_name='duplication_targets')
    duplicated_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='kitchen_project_duplications')
    reason = models.CharField(max_length=20, choices=Reason.choices, default=Reason.CUSTOMER_COPY)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"KitchenProjectDuplication({self.source_project.slug} -> {self.duplicated_project.slug})"
