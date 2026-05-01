"""Scene validation rules for kitchen project versions.

This module checks a saved room snapshot for geometry and business-rule issues:
missing planner metadata, products outside the room, unsupported placements,
missing benchtops, and collisions between placed items.
"""

from planner.models import KitchenDesignerProductProfile, KitchenValidationRun


def _make_issue(code, severity, message, node_id=None, focus=None, suggested_fixes=None):
    """Build a consistent issue payload for frontend review screens."""

    issue = {
        'code': code,
        'severity': severity,
        'message': message,
        'suggestedFixes': suggested_fixes or [],
    }
    if node_id:
        issue['nodeId'] = node_id
    if focus:
        issue['focus'] = focus
    return issue


def _get_item_bounds(item):
    """Convert one scene item into an axis-aligned bounding box in room space."""

    position = item.get('position') or {}
    width = max(float(item.get('widthMm') or 0), 0)
    depth = max(float(item.get('depthMm') or 0), 0)
    height = max(float(item.get('heightMm') or 0), 0)
    x = float(position.get('x') or 0)
    y = float(position.get('y') or 0)
    z = float(position.get('z') or 0)

    return {
        'min_x': x - width / 2,
        'max_x': x + width / 2,
        'min_y': y - height / 2,
        'max_y': y + height / 2,
        'min_z': z - depth / 2,
        'max_z': z + depth / 2,
    }


def _overlaps(bounds_a, bounds_b):
    """Return whether two axis-aligned bounding boxes overlap."""

    return (
        bounds_a['min_x'] < bounds_b['max_x']
        and bounds_a['max_x'] > bounds_b['min_x']
        and bounds_a['min_y'] < bounds_b['max_y']
        and bounds_a['max_y'] > bounds_b['min_y']
        and bounds_a['min_z'] < bounds_b['max_z']
        and bounds_a['max_z'] > bounds_b['min_z']
    )


def validate_project_version(project_version):
    """Run planner validation for one saved project version and persist the result.

    Validation produces both a machine-readable status and a list of actionable
    issues so the frontend can highlight exactly what the user needs to fix.
    """

    snapshot = project_version.scene_snapshot or {}
    room = snapshot.get('room') or {}
    items = snapshot.get('items') or []

    issues = []
    room_width = float(room.get('widthMm') or 0)
    room_depth = float(room.get('depthMm') or 0)
    room_height = float(room.get('heightMm') or 0)

    if room_width <= 0 or room_depth <= 0 or room_height <= 0:
        issues.append(
            _make_issue(
                'ROOM_DIMENSIONS_INVALID',
                'hard',
                'Room width, depth, and height must all be greater than zero.',
                suggested_fixes=['Update the room dimensions in the inspector before validating again.'],
            )
        )

    if not items:
        issues.append(
            _make_issue(
                'NO_ITEMS',
                'hard',
                'Add at least one planner product before continuing to review.',
                suggested_fixes=['Place a published planner product into the room.'],
            )
        )

    product_ids = [item.get('productId') for item in items if item.get('productId')]
    profile_map = {
        profile.product_id: profile
        for profile in KitchenDesignerProductProfile.objects.filter(product_id__in=product_ids).select_related('product')
    }
    benchtop_present = any((item.get('plannerRole') or '') == 'benchtop' for item in items)
    floor_tolerance_mm = 10
    wall_attachment_tolerance_mm = 60

    item_bounds = []
    for item in items:
        node_id = item.get('nodeId')
        position = item.get('position') or {}
        bounds = _get_item_bounds(item)
        item_bounds.append((item, bounds))
        focus = {
            'x': float(position.get('x') or 0),
            'y': float(position.get('y') or 0),
            'z': float(position.get('z') or 0),
        }
        profile = profile_map.get(item.get('productId'))
        planner_role = item.get('plannerRole') or (profile.planner_role if profile else '')

        if not item.get('productId'):
            issues.append(
                _make_issue(
                    'PRODUCT_REFERENCE_MISSING',
                    'hard',
                    'A placed item is missing its product reference.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Remove the broken item and place it again from the catalog.'],
                )
            )
        elif not profile:
            issues.append(
                _make_issue(
                    'PLANNER_PROFILE_MISSING',
                    'hard',
                    'A placed product no longer has planner profile metadata available.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Republish the product in ERP designer settings or replace it from the live planner catalog.'],
                )
            )

        if bounds['min_x'] < -room_width / 2 or bounds['max_x'] > room_width / 2:
            issues.append(
                _make_issue(
                    'ITEM_OUTSIDE_ROOM_WIDTH',
                    'hard',
                    'A product extends outside the room width boundary.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Move the product inward until it sits inside the room shell.'],
                )
            )

        if bounds['min_z'] < -room_depth / 2 or bounds['max_z'] > room_depth / 2:
            issues.append(
                _make_issue(
                    'ITEM_OUTSIDE_ROOM_DEPTH',
                    'hard',
                    'A product extends outside the room depth boundary.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Move the product inward until it sits inside the room shell.'],
                )
            )

        if bounds['min_y'] < 0 or bounds['max_y'] > room_height:
            issues.append(
                _make_issue(
                    'ITEM_OUTSIDE_ROOM_HEIGHT',
                    'hard',
                    'A product extends below the floor plane or above the ceiling height.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Adjust the room height or product placement before continuing.'],
                )
            )

        if not planner_role:
            issues.append(
                _make_issue(
                    'PLANNER_ROLE_MISSING',
                    'soft',
                    'A placed product is missing planner role metadata.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Republish the product with a planner role in ERP designer settings.'],
                )
            )

        if planner_role in {'base', 'tall', 'appliance'} and bounds['min_y'] > floor_tolerance_mm:
            issues.append(
                _make_issue(
                    'FLOOR_PRODUCT_NOT_ON_FLOOR',
                    'hard',
                    'A floor-mounted product is floating above the floor plane.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Lower the product until it sits on the floor.'],
                )
            )

        if profile and profile.requires_wall_attachment:
            touches_back_wall = abs(bounds['min_z'] + room_depth / 2) <= wall_attachment_tolerance_mm
            touches_left_wall = abs(bounds['min_x'] + room_width / 2) <= wall_attachment_tolerance_mm
            touches_right_wall = abs(bounds['max_x'] - room_width / 2) <= wall_attachment_tolerance_mm
            if not any([touches_back_wall, touches_left_wall, touches_right_wall]):
                issues.append(
                    _make_issue(
                        'WALL_ATTACHMENT_REQUIRED',
                        'hard',
                        'This product must be attached to a wall but is not positioned against a supported wall.',
                        node_id=node_id,
                        focus=focus,
                        suggested_fixes=['Move the product against the back wall or one of the side walls.'],
                    )
                )

        if profile and profile.requires_benchtop and not benchtop_present:
            issues.append(
                _make_issue(
                    'BENCHTOP_REQUIRED',
                    'hard',
                    'This product requires a benchtop selection before the design can proceed.',
                    node_id=node_id,
                    focus=focus,
                    suggested_fixes=['Add a benchtop product that spans the required cabinet run.'],
                )
            )

        if profile and not profile.glb_file and all([profile.width_mm, profile.depth_mm, profile.height_mm]):
            dimension_mismatch = any(
                [
                    abs(float(item.get('widthMm') or 0) - float(profile.width_mm)) > 1,
                    abs(float(item.get('depthMm') or 0) - float(profile.depth_mm)) > 1,
                    abs(float(item.get('heightMm') or 0) - float(profile.height_mm)) > 1,
                ]
            )
            if dimension_mismatch:
                issues.append(
                    _make_issue(
                        'DIMENSION_MISMATCH',
                        'soft',
                        'The placed item dimensions differ from the current published planner product profile.',
                        node_id=node_id,
                        focus=focus,
                        suggested_fixes=['Replace the product from the latest published catalog entry to refresh its geometry metadata.'],
                    )
                )

    for index, (item_a, bounds_a) in enumerate(item_bounds):
        for item_b, bounds_b in item_bounds[index + 1:]:
            if _overlaps(bounds_a, bounds_b):
                issues.append(
                    _make_issue(
                        'ITEM_COLLISION',
                        'hard',
                        'Two placed products overlap each other.',
                        node_id=item_a.get('nodeId'),
                        focus=item_a.get('position') or {'x': 0, 'y': 0, 'z': 0},
                        suggested_fixes=['Move one of the products so both objects no longer overlap.'],
                    )
                )

    hard_issue_count = sum(1 for issue in issues if issue['severity'] == 'hard')
    soft_issue_count = sum(1 for issue in issues if issue['severity'] == 'soft')
    status = KitchenValidationRun.Status.FAILED if hard_issue_count else KitchenValidationRun.Status.PASSED

    validation = KitchenValidationRun.objects.create(
        project_version=project_version,
        status=status,
        hard_issue_count=hard_issue_count,
        soft_issue_count=soft_issue_count,
        issues=issues,
    )

    project_version.validation_summary = {
        'status': status,
        'hardIssueCount': hard_issue_count,
        'softIssueCount': soft_issue_count,
        'issues': issues,
        'completedAt': validation.completed_at.isoformat(),
    }
    project_version.save(update_fields=['validation_summary'])

    project = project_version.project
    project.status = project.Status.VALID if status == KitchenValidationRun.Status.PASSED else project.Status.INVALID
    project.save(update_fields=['status', 'updated_at'])

    return validation
