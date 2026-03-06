import { create } from 'zustand';

import type { PlannerCatalogProduct, PlannerNode, PlannerProjectSnapshot, PlannerRoom } from '../types/planner';

interface PlannerStoreState {
  projectId: string | null;
  room: PlannerRoom;
  catalog: PlannerCatalogProduct[];
  selectedNodeId: string | null;
  nodes: PlannerNode[];
  setProjectId: (projectId: string) => void;
  setCatalog: (catalog: PlannerCatalogProduct[]) => void;
  updateRoom: (roomPatch: Partial<PlannerRoom>) => void;
  addNodeFromProduct: (product: PlannerCatalogProduct) => void;
  selectNode: (nodeId: string | null) => void;
  nudgeSelectedNode: (axis: 'x' | 'z', delta: number) => void;
  hydrateFromSnapshot: (snapshot: PlannerProjectSnapshot) => void;
  resetProject: () => void;
}

export const defaultPlannerRoom: PlannerRoom = {
  widthMm: 4200,
  depthMm: 3400,
  heightMm: 2400,
};

export const usePlannerStore = create<PlannerStoreState>((set) => ({
  projectId: null,
  room: defaultPlannerRoom,
  catalog: [],
  selectedNodeId: null,
  nodes: [],
  setProjectId: (projectId) => set({ projectId }),
  setCatalog: (catalog) => set({ catalog }),
  updateRoom: (roomPatch) =>
    set((state) => ({
      room: {
        ...state.room,
        ...roomPatch,
      },
    })),
  addNodeFromProduct: (product) =>
    set((state) => {
      const duplicateCount = state.nodes.filter((node) => node.productId === product.id).length;
      const widthMm = product.width_mm || 600;
      const depthMm = product.depth_mm || 580;
      const heightMm = product.height_mm || 720;
      const spacing = 120;
      const x = -state.room.widthMm / 2 + widthMm / 2 + duplicateCount * (widthMm + spacing);
      const z = state.room.depthMm / 2 - depthMm / 2 - 50;
      const node: PlannerNode = {
        nodeId: `${product.product_id}-${state.nodes.length + 1}`,
        productId: product.id,
        label: product.name,
        plannerRole: product.planner_role,
        widthMm,
        depthMm,
        heightMm,
        position: { x, y: heightMm / 2, z },
        rotationY: 0,
        price: product.price,
      };

      return {
        nodes: [...state.nodes, node],
        selectedNodeId: node.nodeId,
      };
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
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
      room: snapshot.room || defaultPlannerRoom,
      nodes: Array.isArray(snapshot.items) ? snapshot.items : [],
      selectedNodeId: null,
    }),
  resetProject: () =>
    set({
      room: defaultPlannerRoom,
      nodes: [],
      selectedNodeId: null,
    }),
}));
