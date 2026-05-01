/**
 * 3D scene component for the kitchen designer.
 *
 * These files turn planner state into visual geometry, camera behavior, and lighting inside the design canvas.
 */
import type { PlannerRoom } from '../types/planner';

const MM_TO_SCENE = 0.001;
const WALL_THICKNESS = 0.045;
const BASEBOARD_HEIGHT = 0.08;
const BASEBOARD_DEPTH = 0.02;

/** Renders the room shell component used by this module. */
export default function RoomShell({ room }: { room: PlannerRoom }) {
  const width = room.widthMm * MM_TO_SCENE;
  const depth = room.depthMm * MM_TO_SCENE;
  const height = room.heightMm * MM_TO_SCENE;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#ece8df" roughness={0.98} metalness={0} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#ead2ab" roughness={0.8} metalness={0.02} />
      </mesh>

      <mesh position={[0, height / 2, -depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, height, WALL_THICKNESS]} />
        <meshStandardMaterial color="#d8d8d6" roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, height, depth]} />
        <meshStandardMaterial color="#cfd0d2" roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, height, depth]} />
        <meshStandardMaterial color="#e2e1df" roughness={0.96} metalness={0} />
      </mesh>

      <mesh position={[0, BASEBOARD_HEIGHT / 2, -depth / 2 + BASEBOARD_DEPTH / 2]}>
        <boxGeometry args={[width - 0.04, BASEBOARD_HEIGHT, BASEBOARD_DEPTH]} />
        <meshStandardMaterial color="#f6f3ef" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[-width / 2 + BASEBOARD_DEPTH / 2, BASEBOARD_HEIGHT / 2, 0]}>
        <boxGeometry args={[BASEBOARD_DEPTH, BASEBOARD_HEIGHT, depth - 0.04]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[width / 2 - BASEBOARD_DEPTH / 2, BASEBOARD_HEIGHT / 2, 0]}>
        <boxGeometry args={[BASEBOARD_DEPTH, BASEBOARD_HEIGHT, depth - 0.04]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}
