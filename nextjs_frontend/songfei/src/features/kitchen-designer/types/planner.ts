/**
 * TypeScript types for the kitchen designer feature.
 *
 * New developers can read this file to understand the shape of planner rooms, nodes, projects, review payloads, and related API data.
 */
export interface PlannerCatalogProduct {
  id: number;
  product_id: string;
  name: string;
  slug: string;
  price: number;
  description: string;
  colour?: string;
  material?: string;
  image_url: string | null;
  planner_profile_id: number;
  planner_role: string;
  planner_root_category: string;
  planner_group_category: string;
  planner_leaf_category: string;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  allow_vertical_movement: boolean;
  glb_file_url: string | null;
  composite_schema: PlannerCompositeSchema;
}

export type PlannerCompositeNodeKind = 'leaf' | 'assembly';
export type PlannerCompositeSlotCardinality = 'single' | 'multiple';

export interface PlannerCompositeAnimation {
  part_key: string;
  trigger: string;
  type: string;
  open_degrees?: number;
  closed_degrees?: number;
  duration_ms?: number;
}

export interface PlannerCompositeSlot {
  slot_key: string;
  label: string;
  required?: boolean;
  allow_remove?: boolean;
  cardinality?: PlannerCompositeSlotCardinality;
  allowed_roles?: string[];
}

export interface PlannerCompositeDefaultChild {
  slot_key: string;
  product_code?: string;
  product_id?: number;
}

export interface PlannerCompositeReplacementGroup {
  slot_key: string;
  allowed_product_codes?: string[];
  allowed_product_ids?: number[];
}

export interface PlannerCompositeCutoutRule {
  trigger_slot_key: string;
  target_slot_key: string;
  match_product_codes?: string[];
  match_product_ids?: number[];
  variant_product_code?: string;
  variant_product_id?: number;
}

export interface PlannerCompositeSchema {
  enabled: boolean;
  node_kind: PlannerCompositeNodeKind;
  animations: PlannerCompositeAnimation[];
  slots: PlannerCompositeSlot[];
  default_children: PlannerCompositeDefaultChild[];
  replacement_groups: PlannerCompositeReplacementGroup[];
  cutout_rules: PlannerCompositeCutoutRule[];
}

export interface PlannerNodeCompositeItem {
  itemId: string;
  slotKey: string;
  productId: number | null;
  productCode: string | null;
  label: string;
  plannerRole: string | null;
  glbFileUrl: string | null;
  assetPath: string | null;
  imageUrl: string | null;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  price: number | null;
  quantity: number;
  source: 'default' | 'user';
  isRemoved: boolean;
}

export interface PlannerNodeCompositeSlot {
  slotKey: string;
  label: string;
  required: boolean;
  allowRemove: boolean;
  cardinality: PlannerCompositeSlotCardinality;
  allowedRoles: string[];
  items: PlannerNodeCompositeItem[];
}

export interface PlannerNodeCompositeState {
  schema: PlannerCompositeSchema;
  slots: PlannerNodeCompositeSlot[];
}

export interface PlannerTaxonomyPath {
  rootCategory: string;
  groupCategory: string;
  leafCategory: string;
}

export interface PlannerNode {
  nodeId: string;
  productId: number;
  productCode: string;
  slug: string;
  label: string;
  plannerRole: string;
  glbFileUrl: string | null;
  imageUrl: string | null;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  allowVerticalMovement?: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotationY: number;
  price: number;
  nodeKind: PlannerCompositeNodeKind;
  composite: PlannerNodeCompositeState | null;
}

export type PlannerStage = 'define-space' | 'make-it-yours' | 'make-it-happen';

export type PlannerWallSide = 'top' | 'right' | 'bottom' | 'left';

export type PlannerInteractionMode = 'inspect' | 'move' | 'rotate' | 'vertical';

export interface PlannerRoom {
  shape: 'rectangle';
  topMm: number;
  rightMm: number;
  bottomMm: number;
  leftMm: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export interface PlannerProjectSnapshot {
  schemaVersion: number;
  room: PlannerRoom;
  items: PlannerNode[];
  metadata?: {
    units: 'mm';
    projectId?: string | null;
    savedAt?: string;
  };
}

export interface PlannerProjectVersion {
  id: number;
  version_name: string;
  version_number: number;
  scene_snapshot: PlannerProjectSnapshot;
  price_snapshot: number;
  validation_summary: Record<string, unknown>;
  source_version: number | null;
  is_auto_snapshot: boolean;
  created_by: number | null;
  created_by_username?: string;
  created_at: string;
}

export interface PlannerProject {
  id: number;
  title: string;
  slug: string;
  status: string;
  estimated_price: number;
  share_mode: string;
  share_token: string | null;
  owner: number;
  owner_username: string;
  current_version: PlannerProjectVersion | null;
  version_count: number;
  latest_version_number: number;
  created_at: string;
  updated_at: string;
}

export interface PlannerProjectSaveResponse {
  project: PlannerProject;
  version: PlannerProjectVersion;
}

export interface PlannerValidationIssue {
  code: string;
  severity: 'hard' | 'soft';
  nodeId?: string;
  message: string;
  suggestedFixes: string[];
  focus?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface PlannerValidationRun {
  id: number;
  status: 'passed' | 'failed';
  hard_issue_count: number;
  soft_issue_count: number;
  issues: PlannerValidationIssue[];
  started_at: string;
  completed_at: string;
}

export interface PlannerBomLine {
  product: {
    id: number;
    product_id: string;
    name: string;
    slug: string;
  };
  quantity: number;
  unit_price: number;
  line_total: number;
  source_node_ids: string[];
}

export interface PlannerProjectValidationResponse {
  project: PlannerProject;
  current_version: PlannerProjectVersion;
  validation: PlannerValidationRun;
}

export interface PlannerProjectReviewResponse {
  project: PlannerProject;
  current_version: PlannerProjectVersion;
  latest_validation: PlannerValidationRun | null;
  summary: {
    item_count: number;
    distinct_product_count: number;
    estimated_total: number;
    can_proceed: boolean;
    bom_lines: PlannerBomLine[];
  };
}

export interface PlannerAddToBagResponse {
  bundle: {
    id: number;
    project: number;
    project_slug: string;
    project_version: number;
    status: string;
    bundle_total: number;
    created_at: string;
    updated_at: string;
  };
  cart: import('@/features/commerce/types/cart').Cart;
  locked_item_ids: number[];
}

export interface PlannerSharedProjectResponse {
  project: PlannerProject;
  current_version: PlannerProjectVersion | null;
  latest_validation: PlannerValidationRun | null;
}

export interface PlannerShareLinkResponse {
  project: PlannerProject;
  share_token: string;
  share_path: string;
}

export interface PlannerDuplicateResponse {
  project: PlannerProject;
  version: PlannerProjectVersion;
  duplication: {
    id: number;
    reason: string;
    created_at: string;
  };
}
