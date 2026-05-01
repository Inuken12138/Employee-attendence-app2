/**
 * Pure helper functions for the kitchen designer.
 *
 * These utilities perform calculations, schema shaping, or taxonomy lookups without owning React rendering or network requests.
 */
import type { PlannerCompositeNodeKind } from '../types/planner';

export interface PlannerCompositeDraft {
  interaction_schema: Record<string, unknown>;
  constraint_schema: Record<string, unknown>;
  compatibility_schema: Record<string, unknown>;
}

/** Clones the draft so later edits do not mutate the original value. */
function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Returns the composite node kind for the current input. */
export function getCompositeNodeKind(interactionSchema: Record<string, unknown> | null | undefined): PlannerCompositeNodeKind {
  const nodeKind = interactionSchema?.node_kind;
  return nodeKind === 'assembly' ? 'assembly' : 'leaf';
}

/** Sets the composite node kind for the current workflow. */
export function setCompositeNodeKind(
  interactionSchema: Record<string, unknown> | null | undefined,
  nodeKind: PlannerCompositeNodeKind,
) {
  const nextSchema = interactionSchema && typeof interactionSchema === 'object' ? { ...interactionSchema } : {};
  const animations = Array.isArray(nextSchema.animations) ? nextSchema.animations : [];

  return {
    ...nextSchema,
    node_kind: nodeKind,
    animations,
  };
}

/** Builds the leaf composite draft used by this module. */
export function buildLeafCompositeDraft(): PlannerCompositeDraft {
  return cloneDraft({
    interaction_schema: {
      node_kind: 'leaf',
      animations: [],
    },
    constraint_schema: {
      slots: [],
    },
    compatibility_schema: {
      default_children: [],
      replacement_groups: [],
      cutout_rules: [],
    },
  });
}


/** Builds the assembly composite draft used by this module. */
export function buildAssemblyCompositeDraft(): PlannerCompositeDraft {
  return cloneDraft({
    interaction_schema: {
      node_kind: 'assembly',
      animations: [],
    },
    constraint_schema: {
      slots: [
        {
          slot_key: 'frame',
          label: 'Frame',
          required: true,
          allow_remove: false,
          cardinality: 'single',
          allowed_roles: ['base'],
        },
      ],
    },
    compatibility_schema: {
      default_children: [
        {
          slot_key: 'frame',
          product_code: 'FRAME-BASE-600',
        },
      ],
      replacement_groups: [],
      cutout_rules: [],
    },
  });
}

/** Builds the sink base composite draft used by this module. */
export function buildSinkBaseCompositeDraft(): PlannerCompositeDraft {
  return cloneDraft({
    interaction_schema: {
      node_kind: 'assembly',
      animations: [
        {
          part_key: 'door_left',
          trigger: 'open',
          type: 'hinge_y',
          open_degrees: 95,
          closed_degrees: 0,
          duration_ms: 220,
        },
      ],
    },
    constraint_schema: {
      slots: [
        {
          slot_key: 'frame',
          label: 'Frame',
          required: true,
          allow_remove: false,
          cardinality: 'single',
          allowed_roles: ['base'],
        },
        {
          slot_key: 'countertop',
          label: 'Countertop',
          required: true,
          allow_remove: true,
          cardinality: 'single',
          allowed_roles: ['benchtop'],
        },
        {
          slot_key: 'sink',
          label: 'Sink',
          required: false,
          allow_remove: true,
          cardinality: 'single',
          allowed_roles: ['appliance'],
        },
        {
          slot_key: 'faucet',
          label: 'Faucet',
          required: false,
          allow_remove: true,
          cardinality: 'single',
          allowed_roles: ['accessory'],
        },
        {
          slot_key: 'front',
          label: 'Front or door',
          required: false,
          allow_remove: true,
          cardinality: 'single',
          allowed_roles: ['panel'],
        },
        {
          slot_key: 'handle',
          label: 'Handle',
          required: false,
          allow_remove: true,
          cardinality: 'single',
          allowed_roles: ['accessory'],
        },
      ],
    },
    compatibility_schema: {
      default_children: [
        { slot_key: 'frame', product_code: 'FRAME-BASE-SINK-600' },
        { slot_key: 'countertop', product_code: 'COUNTERTOP-BLANK-600' },
        { slot_key: 'front', product_code: 'DOOR-FRONT-600-WHITE' },
        { slot_key: 'handle', product_code: 'HANDLE-BAR-BLACK-160' },
      ],
      replacement_groups: [
        {
          slot_key: 'countertop',
          allowed_product_codes: ['COUNTERTOP-BLANK-600', 'EKBACKEN-BLACK-600', 'EKBACKEN-RED-600'],
        },
        {
          slot_key: 'sink',
          allowed_product_codes: ['SINK-ROUND-450', 'SINK-SQUARE-450'],
        },
        {
          slot_key: 'faucet',
          allowed_product_codes: ['FAUCET-LEFT-BRUSHED', 'FAUCET-RIGHT-BRUSHED'],
        },
        {
          slot_key: 'front',
          allowed_product_codes: ['DOOR-FRONT-600-WHITE', 'DOOR-FRONT-600-OAK'],
        },
      ],
      cutout_rules: [
        {
          trigger_slot_key: 'sink',
          target_slot_key: 'countertop',
          match_product_codes: ['SINK-ROUND-450'],
          variant_product_code: 'COUNTERTOP-ROUND-CUTOUT-600',
        },
        {
          trigger_slot_key: 'sink',
          target_slot_key: 'countertop',
          match_product_codes: ['SINK-SQUARE-450'],
          variant_product_code: 'COUNTERTOP-SQUARE-CUTOUT-600',
        },
      ],
    },
  });
}