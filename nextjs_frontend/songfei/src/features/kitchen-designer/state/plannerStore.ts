import { create } from 'zustand';

import {
  buildPlannerRoom,
  updatePlannerHeight,
  updatePlannerWall,
} from '../lib/measurementMath';
import type {
  PlannerCatalogProduct,
  PlannerInteractionMode,
  PlannerNode,
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
  updateNodePosition: (nodeId: string, position: Partial<{ x: number; y: number; z: number }>) => void;
  updateNodeRotation: (nodeId: string, rotationY: number) => void;
  nudgeSelectedNode: (axis: 'x' | 'z', delta: number) => void;
  hydrateFromSnapshot: (snapshot: PlannerProjectSnapshot) => void;
  resetProject: () => void;
}

export const defaultPlannerRoom: PlannerRoom = buildPlannerRoom();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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
      const widthMm = product.width_mm || 600;
      const depthMm = product.depth_mm || 580;
      const heightMm = product.height_mm || 720;
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
      const node: PlannerNode = {
        nodeId: `${product.product_id}-${state.nodes.length + 1}`,
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
    set({
      room: buildPlannerRoom(snapshot.room || defaultPlannerRoom),
      roomShape: 'rectangle',
      stage: 'define-space',
      activeWall: null,
      editingMeasurement: null,
      interactionMode: 'inspect',
      nodes: Array.isArray(snapshot.items) ? snapshot.items : [],
      selectedNodeId: null,
    }),
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
