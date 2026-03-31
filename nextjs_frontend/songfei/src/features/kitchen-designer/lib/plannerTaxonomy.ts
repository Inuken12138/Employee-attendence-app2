export const PLANNER_ROOT_CATEGORIES = {
  cabinets: 'Cabinets',
  appliances: 'Appliances',
  dining: 'Dining',
  kitchen_extras: 'Kitchen extras',
} as const;

export const PLANNER_CABINET_GROUPS = {
  base_cabinets: {
    label: 'Base cabinets',
    leaves: {
      for_corner: 'For corner',
      for_sink: 'For sink',
      for_cooktop: 'For cooktop',
      for_cooktop_oven: 'For cooktop & oven',
      for_dishwasher: 'For dishwasher',
      for_washing_machine: 'For washing machine',
      for_fridge_freezer: 'For fridge & freezer',
      with_drawers: 'With drawers',
      with_door: 'With door',
      with_door_drawer: 'With door & drawer',
      with_pull_out: 'With pull-out',
      with_wire_basket: 'With wire basket',
      open_cupboards: 'Open cupboards',
      other: 'Other',
      filler_pieces_cover_panels: 'Filler pieces & cover panels',
    },
  },
  wall_cabinets: {
    label: 'Wall cabinets',
    leaves: {
      with_door: 'With door',
      with_glass_doors: 'With glass doors',
      horizontal_cupboards: 'Horizontal cupboards',
      for_corner: 'For corner',
      for_rangehood: 'For rangehood',
      for_microwave_oven: 'For microwave oven',
      for_dish_drainer: 'For dish drainer',
      top_cupboards: 'Top cupboards',
      open_cupboards: 'Open cupboards',
      other: 'Other',
      filler_pieces_cover_panels: 'Filler pieces & cover panels',
    },
  },
  high_cabinets: {
    label: 'High cabinets',
    leaves: {
      for_fridge_freezer: 'For fridge & freezer',
      for_oven: 'For oven',
      for_microwave_oven: 'For microwave oven',
      for_combi_oven: 'For combi oven',
      for_oven_microwave_oven: 'For oven & microwave oven',
      for_oven_combi_oven: 'For oven & combi oven',
      with_door_drawer: 'With door & drawer',
      with_door: 'With door',
      with_cleaning_interior: 'With cleaning interior',
      high_cupboards_with_pullout: 'High cupboards with pullout',
      filler_pieces_cover_panels: 'Filler pieces & cover panels',
    },
  },
} as const;

export type PlannerRootCategoryKey = keyof typeof PLANNER_ROOT_CATEGORIES;
export type PlannerCabinetGroupKey = keyof typeof PLANNER_CABINET_GROUPS;
export type PlannerCabinetLeafKey = {
  [Key in PlannerCabinetGroupKey]: keyof (typeof PLANNER_CABINET_GROUPS)[Key]['leaves'];
}[PlannerCabinetGroupKey];

export function getPlannerRootLabel(rootCategory?: string | null) {
  if (!rootCategory) {
    return '';
  }

  return PLANNER_ROOT_CATEGORIES[rootCategory as PlannerRootCategoryKey] ?? rootCategory;
}

export function getPlannerGroupLabel(groupCategory?: string | null) {
  if (!groupCategory) {
    return '';
  }

  return PLANNER_CABINET_GROUPS[groupCategory as PlannerCabinetGroupKey]?.label ?? groupCategory;
}

export function getPlannerLeafLabel(groupCategory?: string | null, leafCategory?: string | null) {
  if (!groupCategory || !leafCategory) {
    return '';
  }

  return (
    PLANNER_CABINET_GROUPS[groupCategory as PlannerCabinetGroupKey]?.leaves[
      leafCategory as keyof (typeof PLANNER_CABINET_GROUPS)[PlannerCabinetGroupKey]['leaves']
    ] ?? leafCategory
  );
}

export function formatPlannerBreadcrumb(path: {
  rootCategory?: string | null;
  groupCategory?: string | null;
  leafCategory?: string | null;
}) {
  return [
    getPlannerRootLabel(path.rootCategory),
    getPlannerGroupLabel(path.groupCategory),
    getPlannerLeafLabel(path.groupCategory, path.leafCategory),
  ]
    .filter(Boolean)
    .join(' / ');
}