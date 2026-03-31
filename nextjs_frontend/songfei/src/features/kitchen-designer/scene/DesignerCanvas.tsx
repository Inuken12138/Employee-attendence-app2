'use client';

import { Canvas } from '@react-three/fiber';

import { usePlannerStore } from '../state/plannerStore';
import ProductNode from './ProductNode';
import RoomShell from './RoomShell';
import SceneCamera from './SceneCamera';
import SceneLights from './SceneLights';

export default function DesignerCanvas() {
  const room = usePlannerStore((state) => state.room);
  const nodes = usePlannerStore((state) => state.nodes);
  const selectedNodeId = usePlannerStore((state) => state.selectedNodeId);
  const selectNode = usePlannerStore((state) => state.selectNode);

  return (
    <div
      style={{
        minHeight: '620px',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--edge)',
        background: 'radial-gradient(circle at top, rgba(159, 168, 255, 0.12), transparent 45%), #0a0d12',
      }}
    >
      <Canvas shadows onPointerMissed={() => selectNode(null)}>
        <color attach="background" args={['#090b10']} />
        <fog attach="fog" args={['#090b10', 6, 14]} />
        <SceneCamera />
        <SceneLights />
        <RoomShell room={room} />
        {nodes.map((node) => (
          <ProductNode
            key={node.nodeId}
            node={node}
            room={room}
            isSelected={selectedNodeId === node.nodeId}
            onSelect={(nodeId) => selectNode(nodeId)}
          />
        ))}
      </Canvas>
    </div>
  );
}
