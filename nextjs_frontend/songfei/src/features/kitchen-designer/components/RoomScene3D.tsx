'use client';

import { Canvas } from '@react-three/fiber';

import type { PlannerRoom } from '../types/planner';
import { usePlannerStore } from '../state/plannerStore';
import RoomShell from '../scene/RoomShell';
import SceneCamera from '../scene/SceneCamera';
import SceneLights from '../scene/SceneLights';
import ProductNode from '../scene/ProductNode';

interface RoomScene3DProps {
  room: PlannerRoom;
  compact?: boolean;
}

export default function RoomScene3D({ room, compact = false }: RoomScene3DProps) {
  const nodes = usePlannerStore((state) => state.nodes);
  const selectedNodeId = usePlannerStore((state) => state.selectedNodeId);
  const selectNode = usePlannerStore((state) => state.selectNode);

  return (
    <div className="planner-scene-shell" style={{ height: compact ? '320px' : 'clamp(680px, calc(100vh - 220px), 960px)' }}>
      <Canvas shadows dpr={[1, 1.75]} onPointerMissed={() => selectNode(null)}>
        <color attach="background" args={['#ebe7e1']} />
        <fog attach="fog" args={['#ebe7e1', 8, 18]} />
        <SceneCamera room={room} compact={compact} />
        <SceneLights />
        <RoomShell room={room} />
        {nodes.map((node) => (
          <ProductNode
            key={node.nodeId}
            node={node}
            room={room}
            isSelected={selectedNodeId === node.nodeId}
            onSelect={selectNode}
          />
        ))}
      </Canvas>
      <div className="planner-scene-overlay">
        <strong>3D room preview</strong>
        <span>{nodes.length === 0 ? 'The room shell updates from the same planner store that drives the 2D editor.' : `${nodes.length} placed planner item${nodes.length === 1 ? '' : 's'} in scene.`}</span>
      </div>
    </div>
  );
}