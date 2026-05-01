"""Helpers for normalizing and validating planner composite product schemas.

Composite schemas describe planner products that are more than a single mesh,
such as assemblies with slots, default children, replacement rules, or cutout
logic. The ERP editor stores those rules as JSON, and this module keeps the
shape predictable before the frontend consumes it.
"""

import json
from copy import deepcopy


ALLOWED_NODE_KINDS = {'leaf', 'assembly'}
ALLOWED_SLOT_CARDINALITIES = {'single', 'multiple'}


def _add_error(errors, field, message):
    """Append a validation error message under the given field bucket."""

    errors.setdefault(field, []).append(message)


def _coerce_object(value, errors, field_name):
    """Normalize JSON-like input into a dictionary.

    The ERP UI may send either a Python dict or a JSON string depending on the
    request encoding, so validation starts by converting both forms into a plain
    dictionary.
    """

    if value in (None, ''):
        return {}

    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            _add_error(errors, field_name, 'Must be valid JSON.')
            return {}

    if not isinstance(value, dict):
        _add_error(errors, field_name, 'Must be a JSON object.')
        return {}

    return deepcopy(value)


def _coerce_list(value):
    """Return a defensive copy when a value is already a list."""

    return deepcopy(value) if isinstance(value, list) else []


def build_composite_schema(*, interaction_schema=None, constraint_schema=None, compatibility_schema=None):
    """Merge the stored JSON fragments into one frontend-friendly schema object."""

    interaction = interaction_schema if isinstance(interaction_schema, dict) else {}
    constraint = constraint_schema if isinstance(constraint_schema, dict) else {}
    compatibility = compatibility_schema if isinstance(compatibility_schema, dict) else {}
    node_kind = interaction.get('node_kind')

    if node_kind not in ALLOWED_NODE_KINDS:
        node_kind = 'leaf'

    return {
        'enabled': node_kind == 'assembly',
        'node_kind': node_kind,
        'animations': _coerce_list(interaction.get('animations')),
        'slots': _coerce_list(constraint.get('slots')),
        'default_children': _coerce_list(compatibility.get('default_children')),
        'replacement_groups': _coerce_list(compatibility.get('replacement_groups')),
        'cutout_rules': _coerce_list(compatibility.get('cutout_rules')),
    }


def build_profile_composite_schema(profile):
    """Build the merged composite schema for a planner profile instance."""

    return build_composite_schema(
        interaction_schema=getattr(profile, 'interaction_schema', {}),
        constraint_schema=getattr(profile, 'constraint_schema', {}),
        compatibility_schema=getattr(profile, 'compatibility_schema', {}),
    )


def validate_composite_schema_values(*, interaction_schema=None, constraint_schema=None, compatibility_schema=None):
    """Validate the composite-schema JSON fragments and return field errors.

    The function does not raise. Instead, it returns a DRF-friendly dictionary
    keyed by field name so serializers can feed the errors straight back to the
    editor UI.
    """

    errors = {}
    interaction = _coerce_object(interaction_schema, errors, 'interaction_schema')
    constraint = _coerce_object(constraint_schema, errors, 'constraint_schema')
    compatibility = _coerce_object(compatibility_schema, errors, 'compatibility_schema')

    node_kind = interaction.get('node_kind', 'leaf')
    if node_kind not in ALLOWED_NODE_KINDS:
        _add_error(errors, 'interaction_schema', 'Field `node_kind` must be either `leaf` or `assembly`.')
        node_kind = 'leaf'

    animations = interaction.get('animations', [])
    if animations and not isinstance(animations, list):
        _add_error(errors, 'interaction_schema', 'Field `animations` must be a list.')
        animations = []

    for index, animation in enumerate(animations):
        if not isinstance(animation, dict):
            _add_error(errors, 'interaction_schema', f'Animation #{index + 1} must be an object.')
            continue
        if not animation.get('part_key'):
            _add_error(errors, 'interaction_schema', f'Animation #{index + 1} is missing `part_key`.')
        if not animation.get('trigger'):
            _add_error(errors, 'interaction_schema', f'Animation #{index + 1} is missing `trigger`.')
        if not animation.get('type'):
            _add_error(errors, 'interaction_schema', f'Animation #{index + 1} is missing `type`.')

    slots = constraint.get('slots', [])
    if slots and not isinstance(slots, list):
        _add_error(errors, 'constraint_schema', 'Field `slots` must be a list.')
        slots = []

    slot_keys = set()
    for index, slot in enumerate(slots):
        if not isinstance(slot, dict):
            _add_error(errors, 'constraint_schema', f'Slot #{index + 1} must be an object.')
            continue

        slot_key = slot.get('slot_key')
        label = slot.get('label')
        if not slot_key:
            _add_error(errors, 'constraint_schema', f'Slot #{index + 1} is missing `slot_key`.')
        elif slot_key in slot_keys:
            _add_error(errors, 'constraint_schema', f'Slot key `{slot_key}` is duplicated.')
        else:
            slot_keys.add(slot_key)

        if not label:
            _add_error(errors, 'constraint_schema', f'Slot #{index + 1} is missing `label`.')

        cardinality = slot.get('cardinality', 'single')
        if cardinality not in ALLOWED_SLOT_CARDINALITIES:
            _add_error(
                errors,
                'constraint_schema',
                f'Slot `{slot_key or index + 1}` has invalid `cardinality`. Use `single` or `multiple`.',
            )

    default_children = compatibility.get('default_children', [])
    replacement_groups = compatibility.get('replacement_groups', [])
    cutout_rules = compatibility.get('cutout_rules', [])

    if default_children and not isinstance(default_children, list):
        _add_error(errors, 'compatibility_schema', 'Field `default_children` must be a list.')
        default_children = []
    if replacement_groups and not isinstance(replacement_groups, list):
        _add_error(errors, 'compatibility_schema', 'Field `replacement_groups` must be a list.')
        replacement_groups = []
    if cutout_rules and not isinstance(cutout_rules, list):
        _add_error(errors, 'compatibility_schema', 'Field `cutout_rules` must be a list.')
        cutout_rules = []

    for index, child in enumerate(default_children):
        if not isinstance(child, dict):
            _add_error(errors, 'compatibility_schema', f'Default child #{index + 1} must be an object.')
            continue
        if not child.get('slot_key'):
            _add_error(errors, 'compatibility_schema', f'Default child #{index + 1} is missing `slot_key`.')
        elif child['slot_key'] not in slot_keys:
            _add_error(errors, 'compatibility_schema', f'Default child #{index + 1} references unknown slot `{child["slot_key"]}`.')
        if not child.get('product_code') and not child.get('product_id'):
            _add_error(errors, 'compatibility_schema', f'Default child #{index + 1} must include `product_code` or `product_id`.')

    for index, group in enumerate(replacement_groups):
        if not isinstance(group, dict):
            _add_error(errors, 'compatibility_schema', f'Replacement group #{index + 1} must be an object.')
            continue
        slot_key = group.get('slot_key')
        if not slot_key:
            _add_error(errors, 'compatibility_schema', f'Replacement group #{index + 1} is missing `slot_key`.')
        elif slot_key not in slot_keys:
            _add_error(errors, 'compatibility_schema', f'Replacement group #{index + 1} references unknown slot `{slot_key}`.')
        allowed_codes = group.get('allowed_product_codes')
        allowed_ids = group.get('allowed_product_ids')
        if not isinstance(allowed_codes, list) and not isinstance(allowed_ids, list):
            _add_error(
                errors,
                'compatibility_schema',
                f'Replacement group `{slot_key or index + 1}` must provide `allowed_product_codes` or `allowed_product_ids`.',
            )

    for index, rule in enumerate(cutout_rules):
        if not isinstance(rule, dict):
            _add_error(errors, 'compatibility_schema', f'Cutout rule #{index + 1} must be an object.')
            continue
        trigger_slot_key = rule.get('trigger_slot_key')
        target_slot_key = rule.get('target_slot_key')
        if not trigger_slot_key:
            _add_error(errors, 'compatibility_schema', f'Cutout rule #{index + 1} is missing `trigger_slot_key`.')
        elif trigger_slot_key not in slot_keys:
            _add_error(errors, 'compatibility_schema', f'Cutout rule #{index + 1} references unknown trigger slot `{trigger_slot_key}`.')
        if not target_slot_key:
            _add_error(errors, 'compatibility_schema', f'Cutout rule #{index + 1} is missing `target_slot_key`.')
        elif target_slot_key not in slot_keys:
            _add_error(errors, 'compatibility_schema', f'Cutout rule #{index + 1} references unknown target slot `{target_slot_key}`.')
        if not rule.get('variant_product_code') and not rule.get('variant_product_id'):
            _add_error(errors, 'compatibility_schema', f'Cutout rule #{index + 1} must include `variant_product_code` or `variant_product_id`.')

    if node_kind == 'assembly' and not slots:
        _add_error(errors, 'constraint_schema', 'Assembly templates must define at least one slot in `slots`.')

    if node_kind == 'leaf' and (slots or default_children or replacement_groups or cutout_rules):
        _add_error(errors, 'compatibility_schema', 'Leaf products cannot define slots, default children, replacement groups, or cutout rules.')

    return errors
