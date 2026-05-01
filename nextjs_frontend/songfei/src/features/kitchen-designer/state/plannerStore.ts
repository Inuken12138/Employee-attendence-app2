/**
 * State container and mutation helpers for the kitchen designer.
 *
 * This module owns the editor state model so different planner panels and canvases can work against one shared source of truth.
 */
import { create } from 'zustand';

import { clampPositionToRoom } from '../babylon/plannerMath';
import { buildSinkBasePilotAssetPath } from '../lib/plannerPilotAssets';
import {
  buildPlannerRoom,
  updatePlannerHeight,
  updatePlannerWall,
} from '../lib/measurementMath';
import type {
  PlannerCatalogProduct,
  PlannerCompositeNodeKind,
  PlannerCompositeSchema,
  PlannerInteractionMode,
  PlannerNode,
  PlannerNodeCompositeItem,
  PlannerNodeCompositeSlot,
  PlannerNodeCompositeState,
  PlannerProjectSnapshot,
  PlannerRoom,
  PlannerStage,
  PlannerWallSide,
} from '../types/planner';

interface PlannerStoreState {
  projectId: string | null;
  stage: PlannerStage;
  roomShape: 'rectangle';
  room: PlannerRoom;
  catalog: PlannerCatalogProduct[];
  activeWall: PlannerWallSide | null;
  editingMeasurement: PlannerWallSide | null;
  selectedNodeId: string | null;
  interactionMode: PlannerInteractionMode;
  nodes: PlannerNode[];
  setProjectId: (projectId: string) => void;
  setStage: (stage: PlannerStage) => void;
  initializeRoomShape: (shape: 'rectangle') => void;
  setCatalog: (catalog: PlannerCatalogProduct[]) => void;
  updateRoom: (roomPatch: Partial<PlannerRoom>) => void;
  updateWallMeasurement: (wall: PlannerWallSide, nextMm: number) => void;
  updateRoomHeight: (nextMm: number) => void;
  setActiveWall: (wall: PlannerWallSide | null) => void;
  setEditingMeasurement: (wall: PlannerWallSide | null) => void;
  addNodeFromProduct: (product: PlannerCatalogProduct) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  setInteractionMode: (mode: PlannerInteractionMode) => void;
  updateNodeDimensions: (nodeId: string, dimensions: { widthMm: number; depthMm: number; heightMm: number }) => void;
  updateNodePosition: (nodeId: string, position: Partial<{ x: number; y: number; z: number }>) => void;
  updateNodeRotation: (nodeId: string, rotationY: number) => void;
  replaceCompositeSlotItems: (nodeId: string, slotKey: string, items: PlannerNodeCompositeItem[]) => void;
  clearCompositeSlot: (nodeId: string, slotKey: string) => void;
  nudgeSelectedNode: (axis: 'x' | 'z', delta: number) => void;
  hydrateFromSnapshot: (snapshot: PlannerProjectSnapshot) => void;
  resetProject: () => void;
}

export const defaultPlannerRoom: PlannerRoom = buildPlannerRoom();

/** Clamps the  so it stays within allowed limits. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Returns whether object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Helper used by this module to manage as number. */
function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Helper used by this module to manage as nullable string. */
function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Helper used by this module to manage as string array. */
function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/** Returns the provisional node dimensions for the current input. */
function getProvisionalNodeDimensions(product: PlannerCatalogProduct) {
  if (product.glb_file_url) {
    return {
      widthMm: 600,
      depthMm: 580,
      heightMm: 720,
    };
  }

  return {
    widthMm: product.width_mm || 600,
    depthMm: product.depth_mm || 580,
    heightMm: product.height_mm || 720,
  };
}

/** Returns whether assembly schema. */
function isAssemblySchema(schema: PlannerCompositeSchema | null | undefined) {
  return schema?.node_kind === 'assembly';
}

/** Normalizes the composite schema into the shape expected by this module. */
function normalizeCompositeSchema(schema: PlannerCompositeSchema | null | undefined): PlannerCompositeSchema {
  const nodeKind: PlannerCompositeNodeKind = schema?.node_kind === 'assembly' ? 'assembly' : 'leaf';

  return {
    enabled: nodeKind === 'assembly',
    node_kind: nodeKind,
    animations: Array.isArray(schema?.animations) ? schema.animations : [],
    slots: Array.isArray(schema?.slots) ? schema.slots : [],
    default_children: Array.isArray(schema?.default_children) ? schema.default_children : [],
    replacement_groups: Array.isArray(schema?.replacement_groups) ? schema.replacement_groups : [],
    cutout_rules: Array.isArray(schema?.cutout_rules) ? schema.cutout_rules : [],
  };
}

/** Resolves the composite catalog product from the available inputs. */
function resolveCompositeCatalogProduct(
  child: { product_code?: string; product_id?: number },
  catalog: PlannerCatalogProduct[],
) {
  if (typeof child.product_id === 'number') {
    const byId = catalog.find((product) => product.id === child.product_id);
    if (byId) {
      return byId;
    }
  }

  if (typeof child.product_code === 'string' && child.product_code.trim().length > 0) {
    return catalog.find((product) => product.product_id === child.product_code) || null;
  }

  return null;
}

/** Builds the composite item id used by this module. */
function buildCompositeItemId(
  parentNodeId: string,
  slotKey: string,
  productCode: string | null,
  productId: number | null,
  index: number,
) {
  return `${parentNodeId}:${slotKey}:${productCode || productId || index + 1}`;
}

/** Builds the composite item from default child used by this module. */
function buildCompositeItemFromDefaultChild({
  parentNodeId,
  slot,
  child,
  catalog,
  index,
}: {
  parentNodeId: string;
  slot: PlannerNodeCompositeSlot;
  child: PlannerCompositeSchema['default_children'][number];
  catalog: PlannerCatalogProduct[];
  index: number;
}): PlannerNodeCompositeItem {
  const matchedProduct = resolveCompositeCatalogProduct(child, catalog);
  const productId = child.product_id ?? matchedProduct?.id ?? null;
  const productCode = child.product_code ?? matchedProduct?.product_id ?? null;

  return {
    itemId: buildCompositeItemId(parentNodeId, slot.slotKey, productCode, productId, index),
    slotKey: slot.slotKey,
    productId,
    productCode,
    label: matchedProduct?.name || productCode || slot.label,
    plannerRole: matchedProduct?.planner_role || null,
    glbFileUrl: matchedProduct?.glb_file_url || null,
    assetPath: buildSinkBasePilotAssetPath(productCode),
    imageUrl: matchedProduct?.image_url || null,
    widthMm: matchedProduct?.width_mm ?? null,
    depthMm: matchedProduct?.depth_mm ?? null,
    heightMm: matchedProduct?.height_mm ?? null,
    price: matchedProduct?.price ?? null,
    quantity: 1,
    source: 'default',
    isRemoved: false,
  };
}

/** Builds the composite slots from schema used by this module. */
function buildCompositeSlotsFromSchema(
  schema: PlannerCompositeSchema,
  parentNodeId: string,
  catalog: PlannerCatalogProduct[],
): PlannerNodeCompositeSlot[] {
  return schema.slots.map((slot) => {
    const cardinality = slot.cardinality === 'multiple' ? 'multiple' : 'single';
    const baseSlot: PlannerNodeCompositeSlot = {
      slotKey: slot.slot_key,
      label: slot.label,
      required: Boolean(slot.required),
      allowRemove: Boolean(slot.allow_remove),
      cardinality,
      allowedRoles: Array.isArray(slot.allowed_roles) ? slot.allowed_roles : [],
      items: [],
    };

    const defaultChildren = schema.default_children.filter((child) => child.slot_key === slot.slot_key);
    const seededChildren = cardinality === 'multiple' ? defaultChildren : defaultChildren.slice(0, 1);

    baseSlot.items = seededChildren.map((child, index) =>
      buildCompositeItemFromDefaultChild({
        parentNodeId,
        slot: baseSlot,
        child,
        catalog,
        index,
      }),
    );

    return baseSlot;
  });
}

/** Normalizes the composite item into the shape expected by this module. */
function normalizeCompositeItem(
  itemLike: unknown,
  fallbackSlot: PlannerNodeCompositeSlot,
  parentNodeId: string,
  catalog: PlannerCatalogProduct[],
  index: number,
): PlannerNodeCompositeItem {
  const item = isObject(itemLike) ? itemLike : {};
  const productId = typeof item.productId === 'number' ? item.productId : null;
  const productCode = asNullableString(item.productCode);
  const matchedProduct = resolveCompositeCatalogProduct(
    {
      product_code: productCode || undefined,
      product_id: productId || undefined,
    },
    catalog,
  );

  return {
    itemId:
      asNullableString(item.itemId) ||
      buildCompositeItemId(parentNodeId, fallbackSlot.slotKey, productCode, productId, index),
    slotKey: asNullableString(item.slotKey) || fallbackSlot.slotKey,
    productId: productId ?? matchedProduct?.id ?? null,
    productCode: productCode ?? matchedProduct?.product_id ?? null,
    label: asNullableString(item.label) || matchedProduct?.name || productCode || fallbackSlot.label,
    plannerRole: asNullableString(item.plannerRole) || matchedProduct?.planner_role || null,
    glbFileUrl: asNullableString(item.glbFileUrl) || matchedProduct?.glb_file_url || null,
    assetPath:
      asNullableString(item.assetPath) ||
      buildSinkBasePilotAssetPath(productCode ?? matchedProduct?.product_id ?? null),
    imageUrl: asNullableString(item.imageUrl) || matchedProduct?.image_url || null,
    widthMm: typeof item.widthMm === 'number' ? item.widthMm : matchedProduct?.width_mm ?? null,
    depthMm: typeof item.depthMm === 'number' ? item.depthMm : matchedProduct?.depth_mm ?? null,
    heightMm: typeof item.heightMm === 'number' ? item.heightMm : matchedProduct?.height_mm ?? null,
    price: typeof item.price === 'number' ? item.price : matchedProduct?.price ?? null,
    quantity: Math.max(1, Math.round(asNumber(item.quantity, 1))),
    source: item.source === 'user' ? 'user' : 'default',
    isRemoved: Boolean(item.isRemoved),
  };
}

/** Normalizes the composite state into the shape expected by this module. */
function normalizeCompositeState(
  compositeLike: unknown,
  parentNodeId: string,
  catalog: PlannerCatalogProduct[],
): PlannerNodeCompositeState | null {
  if (!isObject(compositeLike)) {
    return null;
  }

  const schema = normalizeCompositeSchema(
    isObject(compositeLike.schema) ? (compositeLike.schema as unknown as PlannerCompositeSchema) : undefined,
  );

  if (!isAssemblySchema(schema)) {
    return null;
  }

  const baseSlots = buildCompositeSlotsFromSchema(schema, parentNodeId, catalog);
  const persistedSlots = Array.isArray(compositeLike.slots) ? compositeLike.slots : [];
  const mergedSlots = baseSlots.map((slot) => {
    const persistedSlot = persistedSlots.find(
      (candidate) => isObject(candidate) && (candidate.slotKey === slot.slotKey || candidate.slot_key === slot.slotKey),
    );

    if (!isObject(persistedSlot)) {
      return slot;
    }

    const persistedItems = Array.isArray(persistedSlot.items) ? persistedSlot.items : [];

    return {
      slotKey: slot.slotKey,
      label: asNullableString(persistedSlot.label) || slot.label,
      required: typeof persistedSlot.required === 'boolean' ? persistedSlot.required : slot.required,
      allowRemove: typeof persistedSlot.allowRemove === 'boolean' ? persistedSlot.allowRemove : slot.allowRemove,
      cardinality: persistedSlot.cardinality === 'multiple' ? 'multiple' : slot.cardinality,
      allowedRoles: asStringArray(persistedSlot.allowedRoles).length > 0 ? asStringArray(persistedSlot.allowedRoles) : slot.allowedRoles,
      items:
        persistedItems.length > 0
          ? persistedItems.map((item, index) => normalizeCompositeItem(item, slot, parentNodeId, catalog, index))
          : slot.items,
    } satisfies PlannerNodeCompositeSlot;
  });

  return {
    schema,
    slots: mergedSlots,
  };
}

/** Builds the node composite state used by this module. */
function buildNodeCompositeState(
  product: PlannerCatalogProduct,
  parentNodeId: string,
  catalog: PlannerCatalogProduct[],
) {
  const schema = normalizeCompositeSchema(product.composite_schema);

  if (!isAssemblySchema(schema)) {
    return null;
  }

  return {
    schema,
    slots: buildCompositeSlotsFromSchema(schema, parentNodeId, catalog),
  } satisfies PlannerNodeCompositeState;
}

/** Normalizes the planner node snapshot into the shape expected by this module. */
function normalizePlannerNodeSnapshot(
  nodeLike: unknown,
  catalog: PlannerCatalogProduct[],
  index: number,
): PlannerNode | null {
  if (!isObject(nodeLike)) {
    return null;
  }

  const position = isObject(nodeLike.position) ? nodeLike.position : {};
  const nodeId = asNullableString(nodeLike.nodeId) || `snapshot-node-${index + 1}`;
  const composite = normalizeCompositeState(nodeLike.composite, nodeId, catalog);

  return {
    nodeId,
    productId: asNumber(nodeLike.productId, 0),
    productCode: asNullableString(nodeLike.productCode) || `UNKNOWN-${index + 1}`,
    slug: asNullableString(nodeLike.slug) || '',
    label: asNullableString(nodeLike.label) || 'Planner item',
    plannerRole: asNullableString(nodeLike.plannerRole) || 'base',
    glbFileUrl: asNullableString(nodeLike.glbFileUrl),
    imageUrl: asNullableString(nodeLike.imageUrl),
    widthMm: Math.max(1, Math.round(asNumber(nodeLike.widthMm, 600))),
    depthMm: Math.max(1, Math.round(asNumber(nodeLike.depthMm, 580))),
    heightMm: Math.max(1, Math.round(asNumber(nodeLike.heightMm, 720))),
    allowVerticalMovement: Boolean(nodeLike.allowVerticalMovement),
    position: {
      x: asNumber(position.x, 0),
      y: asNumber(position.y, 0),
      z: asNumber(position.z, 0),
    },
    rotationY: asNumber(nodeLike.rotationY, 0),
    price: asNumber(nodeLike.price, 0),
    nodeKind: composite ? 'assembly' : 'leaf',
    composite,
  };
}

/** Returns the initial node center y for the current input. */
function getInitialNodeCenterY({
  allowVerticalMovement,
  plannerRole,
  roomHeightMm,
  nodeHeightMm,
}: {
  allowVerticalMovement: boolean;
  plannerRole: string;
  roomHeightMm: number;
  nodeHeightMm: number;
}) {
  if (!allowVerticalMovement && plannerRole !== 'wall') {
    return nodeHeightMm / 2;
  }

  const desiredBottomMm = Math.max(1350, Math.round(roomHeightMm * 0.56));
  const centeredY = desiredBottomMm + nodeHeightMm / 2;

  return clamp(centeredY, nodeHeightMm / 2, roomHeightMm - nodeHeightMm / 2);
}

export const usePlannerStore = create<PlannerStoreState>((set) => ({
  projectId: null,
  stage: 'define-space',
  roomShape: 'rectangle',
  room: defaultPlannerRoom,
  catalog: [],
  activeWall: null,
  editingMeasurement: null,
  selectedNodeId: null,
  interactionMode: 'inspect',
  nodes: [],
  setProjectId: (projectId) => set({ projectId }),
  setStage: (stage) => set({ stage }),
  initializeRoomShape: (shape) =>
    set({
      roomShape: shape,
      room: buildPlannerRoom(),
      activeWall: null,
      editingMeasurement: null,
      interactionMode: 'inspect',
    }),
  setCatalog: (catalog) => set({ catalog }),
  updateRoom: (roomPatch) =>
    set((state) => ({
      room: buildPlannerRoom({
        ...state.room,
        ...roomPatch,
      }),
    })),
  updateWallMeasurement: (wall, nextMm) =>
    set((state) => ({
      room: updatePlannerWall(state.room, wall, nextMm),
    })),
  updateRoomHeight: (nextMm) =>
    set((state) => ({
      room: updatePlannerHeight(state.room, nextMm),
    })),
  setActiveWall: (wall) => set({ activeWall: wall }),
  setEditingMeasurement: (wall) => set({ editingMeasurement: wall }),
  addNodeFromProduct: (product) =>
    set((state) => {
      const duplicateCount = state.nodes.filter((node) => node.productId === product.id).length;
      const { widthMm, depthMm, heightMm } = getProvisionalNodeDimensions(product);
      const allowVerticalMovement = Boolean(product.allow_vertical_movement);
      const spacing = 120;
      const maxX = state.room.widthMm / 2 - widthMm / 2;
      const minX = -maxX;
      const x = clamp(
        -state.room.widthMm / 2 + widthMm / 2 + duplicateCount * (widthMm + spacing),
        minX,
        maxX,
      );
      const z = -state.room.depthMm / 2 + depthMm / 2;
      const nodeId = `${product.product_id}-${state.nodes.length + 1}`;
      const composite = buildNodeCompositeState(product, nodeId, state.catalog);
      const node: PlannerNode = {
        nodeId,
        productId: product.id,
        productCode: product.product_id,
        slug: product.slug,
        label: product.name,
        plannerRole: product.planner_role,
        glbFileUrl: product.glb_file_url,
        imageUrl: product.image_url,
        widthMm,
        depthMm,
        heightMm,
        allowVerticalMovement,
        position: {
          x,
          y: getInitialNodeCenterY({
            allowVerticalMovement,
            plannerRole: product.planner_role,
            roomHeightMm: state.room.heightMm,
            nodeHeightMm: heightMm,
          }),
          z,
        },
        rotationY: 0,
        price: product.price,
        nodeKind: composite ? 'assembly' : 'leaf',
        composite,
      };

      return {
        nodes: [...state.nodes, node],
        selectedNodeId: node.nodeId,
        interactionMode: 'inspect',
      };
    }),
  removeNode: (nodeId) =>
    set((state) => {
      const removingSelectedNode = state.selectedNodeId === nodeId;

      return {
        nodes: state.nodes.filter((node) => node.nodeId !== nodeId),
        selectedNodeId: removingSelectedNode ? null : state.selectedNodeId,
        interactionMode: removingSelectedNode ? 'inspect' : state.interactionMode,
      };
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, interactionMode: 'inspect' }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  updateNodeDimensions: (nodeId, dimensions) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.nodeId !== nodeId) {
          return node;
        }

        const resizedNode: PlannerNode = {
          ...node,
          widthMm: Math.max(Math.round(dimensions.widthMm), 1),
          depthMm: Math.max(Math.round(dimensions.depthMm), 1),
          heightMm: Math.max(Math.round(dimensions.heightMm), 1),
        };
        const nextPosition = clampPositionToRoom(
          resizedNode,
          state.room,
          {
            ...node.position,
            y: getInitialNodeCenterY({
              allowVerticalMovement: Boolean(node.allowVerticalMovement),
              plannerRole: node.plannerRole,
              roomHeightMm: state.room.heightMm,
              nodeHeightMm: resizedNode.heightMm,
            }),
          },
          node.rotationY,
        );

        if (!node.allowVerticalMovement && node.plannerRole !== 'wall') {
          nextPosition.y = resizedNode.heightMm / 2;
        }

        return {
          ...resizedNode,
          position: nextPosition,
        };
      }),
    })),
  replaceCompositeSlotItems: (nodeId, slotKey, items) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.nodeId !== nodeId || !node.composite) {
          return node;
        }

        return {
          ...node,
          composite: {
            ...node.composite,
            slots: node.composite.slots.map((slot) =>
              slot.slotKey === slotKey
                ? {
                    ...slot,
                    items,
                  }
                : slot,
            ),
          },
        };
      }),
    })),
  clearCompositeSlot: (nodeId, slotKey) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.nodeId !== nodeId || !node.composite) {
          return node;
        }

        return {
          ...node,
          composite: {
            ...node.composite,
            slots: node.composite.slots.map((slot) =>
              slot.slotKey === slotKey
                ? {
                    ...slot,
                    items: [],
                  }
                : slot,
            ),
          },
        };
      }),
    })),
  updateNodePosition: (nodeId, position) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.nodeId === nodeId
          ? {
              ...node,
              position: {
                ...node.position,
                ...position,
              },
            }
          : node,
      ),
    })),
  updateNodeRotation: (nodeId, rotationY) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.nodeId === nodeId
          ? {
              ...node,
              rotationY,
            }
          : node,
      ),
    })),
  nudgeSelectedNode: (axis, delta) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.nodeId === state.selectedNodeId
          ? {
              ...node,
              position: {
                ...node.position,
                [axis]: node.position[axis] + delta,
              },
            }
          : node,
      ),
    })),
  hydrateFromSnapshot: (snapshot) =>
    set((state) => ({
      room: buildPlannerRoom(snapshot.room || defaultPlannerRoom),
      roomShape: 'rectangle',
      stage: 'define-space',
      activeWall: null,
      editingMeasurement: null,
      interactionMode: 'inspect',
      nodes: Array.isArray(snapshot.items)
        ? snapshot.items
            .map((item, index) => normalizePlannerNodeSnapshot(item, state.catalog, index))
            .filter((item): item is PlannerNode => Boolean(item))
        : [],
      selectedNodeId: null,
    })),
  resetProject: () =>
    set({
      stage: 'define-space',
      roomShape: 'rectangle',
      room: defaultPlannerRoom,
      activeWall: null,
      editingMeasurement: null,
      interactionMode: 'inspect',
      nodes: [],
      selectedNodeId: null,
    }),
}));
