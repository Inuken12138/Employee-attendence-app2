PLANNER_ROOT_CATEGORIES = {
    'cabinets': 'Cabinets',
    'appliances': 'Appliances',
    'dining': 'Dining',
    'kitchen_extras': 'Kitchen extras',
}

PLANNER_CABINET_GROUPS = {
    'base_cabinets': {
        'label': 'Base cabinets',
        'leaves': {
            'for_corner': 'For corner',
            'for_sink': 'For sink',
            'for_cooktop': 'For cooktop',
            'for_cooktop_oven': 'For cooktop & oven',
            'for_dishwasher': 'For dishwasher',
            'for_washing_machine': 'For washing machine',
            'for_fridge_freezer': 'For fridge & freezer',
            'with_drawers': 'With drawers',
            'with_door': 'With door',
            'with_door_drawer': 'With door & drawer',
            'with_pull_out': 'With pull-out',
            'with_wire_basket': 'With wire basket',
            'open_cupboards': 'Open cupboards',
            'other': 'Other',
            'filler_pieces_cover_panels': 'Filler pieces & cover panels',
        },
    },
    'wall_cabinets': {
        'label': 'Wall cabinets',
        'leaves': {
            'with_door': 'With door',
            'with_glass_doors': 'With glass doors',
            'horizontal_cupboards': 'Horizontal cupboards',
            'for_corner': 'For corner',
            'for_rangehood': 'For rangehood',
            'for_microwave_oven': 'For microwave oven',
            'for_dish_drainer': 'For dish drainer',
            'top_cupboards': 'Top cupboards',
            'open_cupboards': 'Open cupboards',
            'other': 'Other',
            'filler_pieces_cover_panels': 'Filler pieces & cover panels',
        },
    },
    'high_cabinets': {
        'label': 'High cabinets',
        'leaves': {
            'for_fridge_freezer': 'For fridge & freezer',
            'for_oven': 'For oven',
            'for_microwave_oven': 'For microwave oven',
            'for_combi_oven': 'For combi oven',
            'for_oven_microwave_oven': 'For oven & microwave oven',
            'for_oven_combi_oven': 'For oven & combi oven',
            'with_door_drawer': 'With door & drawer',
            'with_door': 'With door',
            'with_cleaning_interior': 'With cleaning interior',
            'high_cupboards_with_pullout': 'High cupboards with pullout',
            'filler_pieces_cover_panels': 'Filler pieces & cover panels',
        },
    },
}


def get_planner_root_choices():
    return [(value, label) for value, label in PLANNER_ROOT_CATEGORIES.items()]


def get_planner_group_choices():
    return [(value, definition['label']) for value, definition in PLANNER_CABINET_GROUPS.items()]


def planner_path_is_valid(root_category: str, group_category: str, leaf_category: str) -> bool:
    if not root_category and not group_category and not leaf_category:
        return True

    if root_category not in PLANNER_ROOT_CATEGORIES:
        return False

    if root_category != 'cabinets':
        return not group_category and not leaf_category

    if group_category not in PLANNER_CABINET_GROUPS:
        return False

    return leaf_category in PLANNER_CABINET_GROUPS[group_category]['leaves']


def planner_path_is_complete(root_category: str, group_category: str, leaf_category: str) -> bool:
    if root_category == 'cabinets':
        return planner_path_is_valid(root_category, group_category, leaf_category) and bool(group_category and leaf_category)

    return bool(root_category) and planner_path_is_valid(root_category, group_category, leaf_category)