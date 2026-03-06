import { defaultPlannerRoom } from '../state/plannerStore';
import type { PlannerNode, PlannerProjectSnapshot, PlannerRoom } from '../types/planner';

export function createEmptyPlannerSnapshot(projectId?: string | null): PlannerProjectSnapshot {
  return {
    schemaVersion: 1,
    room: { ...defaultPlannerRoom },
    items: [],
    metadata: {
      units: 'mm',
      projectId: projectId || null,
    },
  };
}

export function buildPlannerSnapshot({
  projectId,
  room,
  nodes,
}: {
  projectId?: string | null;
  room: PlannerRoom;
  nodes: PlannerNode[];
}): PlannerProjectSnapshot {
  return {
    schemaVersion: 1,
    room,
    items: nodes,
    metadata: {
      units: 'mm',
      projectId: projectId || null,
      savedAt: new Date().toISOString(),
    },
  };
}