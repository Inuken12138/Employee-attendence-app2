"""Validation rules for planner product assets uploaded from ERP.

This service inspects a planner product profile before it can be staged or
published. It checks asset presence, format, size, taxonomy completeness, and
composite-schema correctness, then stores the result as a validation record.
"""

from pathlib import Path

from planner.composite_schema import validate_composite_schema_values
from planner.models import (
    KitchenDesignerAssetValidation,
    KitchenDesignerProductProfile,
    MAX_GLB_FILE_SIZE_BYTES,
)
from planner.taxonomy import planner_path_is_complete


def validate_designer_profile(profile: KitchenDesignerProductProfile, validated_by=None):
    """Create and persist an asset-validation record for one planner profile."""

    warnings = []
    errors = []
    detected_format = ''
    file_size_bytes = 0

    if not profile.glb_file:
        errors.append('Upload a .glb file before running planner asset validation.')
    else:
        file_name = profile.glb_file.name
        detected_format = Path(file_name).suffix.lower().lstrip('.')
        file_size_bytes = getattr(profile.glb_file, 'size', 0) or 0

        if detected_format != 'glb':
            errors.append('Only .glb assets are supported in the planner right now.')

        if file_size_bytes > MAX_GLB_FILE_SIZE_BYTES:
            warnings.append('GLB file is larger than 25MB and may hurt planner load performance.')

    if not profile.is_enabled:
        warnings.append('Planner product is not enabled yet; publish will remain blocked.')

    if not profile.planner_role:
        warnings.append('Select a planner role before publishing.')

    if not planner_path_is_complete(
        profile.planner_root_category,
        profile.planner_group_category,
        profile.planner_leaf_category,
    ):
        warnings.append('Pick a complete planner category path before publishing this product to the live planner catalog.')

    composite_errors = validate_composite_schema_values(
        interaction_schema=profile.interaction_schema,
        constraint_schema=profile.constraint_schema,
        compatibility_schema=profile.compatibility_schema,
    )
    for field_name, field_errors in composite_errors.items():
        for field_error in field_errors:
            errors.append(f'{field_name}: {field_error}')

    status = KitchenDesignerAssetValidation.Status.FAILED if errors else KitchenDesignerAssetValidation.Status.PASSED

    return KitchenDesignerAssetValidation.objects.create(
        designer_profile=profile,
        status=status,
        detected_format=detected_format,
        file_size_bytes=file_size_bytes,
        warnings=warnings,
        errors=errors,
        validated_by=validated_by,
    )
