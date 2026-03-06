import type { PlannerRoom } from '../types/planner';

const MM_TO_SCENE = 0.001;

export default function RoomShell({ room }: { room: PlannerRoom }) {
  const width = room.widthMm * MM_TO_SCENE;
  const depth = room.depthMm * MM_TO_SCENE;
  const height = room.heightMm * MM_TO_SCENE;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#171a24" roughness={0.92} metalness={0.08} />
      </mesh>

      <mesh position={[0, height / 2, -depth / 2]}>
        <boxGeometry args={[width, height, 0.04]} />
        <meshStandardMaterial color="#202433" transparent opacity={0.9} />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[0.04, height, depth]} />
        <meshStandardMaterial color="#1b2030" transparent opacity={0.7} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[0.04, height, depth]} />
        <meshStandardMaterial color="#1b2030" transparent opacity={0.7} />
      </mesh>
      <gridHelper args={[Math.max(width, depth), 20, '#2b354c', '#1f2637']} position={[0, 0.002, 0]} />
    </group>
  );
}
