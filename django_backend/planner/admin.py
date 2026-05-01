"""Admin configuration for planner models.

These registrations make planner metadata and customer project records visible
inside Django admin for debugging, content operations, and support workflows.
"""

from django.contrib import admin

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


@admin.register(KitchenDesignerProductProfile)
class KitchenDesignerProductProfileAdmin(admin.ModelAdmin):
    """Surface ERP-side planner product settings in Django admin."""

    list_display = ('product', 'is_enabled', 'catalog_state', 'planner_role', 'updated_at')
    list_filter = ('is_enabled', 'catalog_state', 'planner_role')
    search_fields = ('product__name', 'product__product_id')


@admin.register(KitchenDesignerAssetValidation)
class KitchenDesignerAssetValidationAdmin(admin.ModelAdmin):
    """Show historical validation runs for uploaded planner assets."""

    list_display = ('designer_profile', 'status', 'detected_format', 'validated_at')
    list_filter = ('status', 'detected_format')
    search_fields = ('designer_profile__product__name', 'designer_profile__product__product_id')


@admin.register(KitchenProductionAsset)
class KitchenProductionAssetAdmin(admin.ModelAdmin):
    """Manage manufacturing-side files linked to a planner product."""

    list_display = ('label', 'designer_profile', 'asset_type', 'is_active', 'updated_at')
    list_filter = ('asset_type', 'is_active')
    search_fields = ('label', 'designer_profile__product__name', 'designer_profile__product__product_id')


@admin.register(KitchenProject)
class KitchenProjectAdmin(admin.ModelAdmin):
    """Inspect customer planner projects and their sharing state."""

    list_display = ('title', 'owner', 'status', 'share_mode', 'updated_at')
    list_filter = ('status', 'share_mode')
    search_fields = ('title', 'slug', 'owner__username')


@admin.register(KitchenProjectVersion)
class KitchenProjectVersionAdmin(admin.ModelAdmin):
    """Inspect saved snapshots of a kitchen project over time."""

    list_display = ('project', 'version_number', 'version_name', 'created_by', 'created_at')
    list_filter = ('is_auto_snapshot',)
    search_fields = ('project__title', 'project__slug', 'version_name', 'created_by__username')


@admin.register(KitchenValidationRun)
class KitchenValidationRunAdmin(admin.ModelAdmin):
    """Inspect hard and soft validation results for saved versions."""

    list_display = ('project_version', 'status', 'hard_issue_count', 'soft_issue_count', 'completed_at')
    list_filter = ('status',)
    search_fields = ('project_version__project__title', 'project_version__project__slug')


@admin.register(KitchenCartBundle)
class KitchenCartBundleAdmin(admin.ModelAdmin):
    """Show planner-to-cart bundle records created during add-to-bag."""

    list_display = ('project', 'project_version', 'status', 'bundle_total', 'updated_at')
    list_filter = ('status',)
    search_fields = ('project__title', 'project__slug')


@admin.register(KitchenProjectDuplication)
class KitchenProjectDuplicationAdmin(admin.ModelAdmin):
    """Track why and by whom a project was duplicated."""

    list_display = ('source_project', 'duplicated_project', 'duplicated_by', 'reason', 'created_at')
    list_filter = ('reason',)
    search_fields = ('source_project__slug', 'duplicated_project__slug', 'duplicated_by__username')
