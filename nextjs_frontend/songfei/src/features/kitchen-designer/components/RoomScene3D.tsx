'use client';

import type { PlannerRoom } from '../types/planner';
import { usePlannerStore } from '../state/plannerStore';
import BabylonPlannerGame from '../babylon/BabylonPlannerGame';

interface RoomScene3DProps {
  room: PlannerRoom;
  compact?: boolean;
}

export default function RoomScene3D({ room, compact = false }: RoomScene3DProps) {
  const nodes = usePlannerStore((state) => state.nodes);

  return (
    <div className="planner-scene-shell" style={{ height: compact ? '320px' : 'clamp(680px, calc(100vh - 220px), 960px)' }}>
      <BabylonPlannerGame room={room} compact={compact} />
      <div className="planner-scene-overlay">
        <strong>3D room preview</strong>
        <span>{nodes.length === 0 ? 'The room shell updates from the same planner store that drives the 2D editor.' : `${nodes.length} placed planner item${nodes.length === 1 ? '' : 's'} in scene.`}</span>
      </div>
    </div>
  );
}