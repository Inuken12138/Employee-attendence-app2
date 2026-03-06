import type { ThreeEvent } from '@react-three/fiber';

import type { PlannerNode } from '../types/planner';

const MM_TO_SCENE = 0.001;

export default function ProductNode({
  node,
  isSelected,
  onSelect,
}: {
  node: PlannerNode;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(node.nodeId);
  };

  return (
    <mesh
      castShadow
      receiveShadow
      position={[node.position.x * MM_TO_SCENE, node.position.y * MM_TO_SCENE, node.position.z * MM_TO_SCENE]}
      rotation={[0, node.rotationY, 0]}
      onClick={handleClick}
    >
      <boxGeometry args={[node.widthMm * MM_TO_SCENE, node.heightMm * MM_TO_SCENE, node.depthMm * MM_TO_SCENE]} />
      <meshStandardMaterial color={isSelected ? '#f2c46f' : '#6fd5c7'} roughness={0.55} metalness={0.08} />
    </mesh>
  );
}
