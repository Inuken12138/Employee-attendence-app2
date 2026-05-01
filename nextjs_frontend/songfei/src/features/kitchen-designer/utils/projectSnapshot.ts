/**
 * Kitchen designer utility helpers.
 *
 * The functions here transform planner data into reusable derived structures for saving, review, or synchronization flows.
 */
import { defaultPlannerRoom } from '../state/plannerStore';
import type { PlannerNode, PlannerProjectSnapshot, PlannerRoom } from '../types/planner';

const PLANNER_SNAPSHOT_SCHEMA_VERSION = 2;

/** Creates the empty planner snapshot used by this module. */
export function createEmptyPlannerSnapshot(projectId?: string | null): PlannerProjectSnapshot {
  return {
    schemaVersion: PLANNER_SNAPSHOT_SCHEMA_VERSION,
    room: { ...defaultPlannerRoom },
    items: [],
    metadata: {
      units: 'mm',
      projectId: projectId || null,
    },
  };
}

/** Builds the planner snapshot used by this module. */
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
    schemaVersion: PLANNER_SNAPSHOT_SCHEMA_VERSION,
    room: { ...room },
    items: nodes,
    metadata: {
      units: 'mm',
      projectId: projectId || null,
      savedAt: new Date().toISOString(),
    },
  };
}