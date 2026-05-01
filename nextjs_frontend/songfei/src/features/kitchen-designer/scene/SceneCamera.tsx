/**
 * 3D scene component for the kitchen designer.
 *
 * These files turn planner state into visual geometry, camera behavior, and lighting inside the design canvas.
 */
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import type { PlannerRoom } from '../types/planner';

const MM_TO_SCENE = 0.001;

/** Returns the camera frame for the current input. */
function getCameraFrame(room?: PlannerRoom, compact = false) {
  /** Helper used by this module to manage width. */
  const width = (room?.widthMm ?? 4000) * MM_TO_SCENE;
  /** Helper used by this module to manage depth. */
  const depth = (room?.depthMm ?? 4000) * MM_TO_SCENE;
  /** Helper used by this module to manage height. */
  const height = (room?.heightMm ?? 2500) * MM_TO_SCENE;
  const footprint = Math.max(width, depth);
  const distance = compact ? footprint * 1.05 : footprint * 0.94;

  return {
    position: [
      Math.max(width * 0.82, 2.6),
      Math.max(height * 0.88, compact ? 1.7 : 2.25),
      Math.max(depth * 0.96, distance),
    ] as [number, number, number],
    target: [0, height * 0.38, 0] as [number, number, number],
    minDistance: Math.max(1.4, footprint * 0.42),
    maxDistance: Math.max(9, footprint * 3.1),
  };
}

/** Renders the scene camera component used by this module. */
export default function SceneCamera({ room, compact = false }: { room?: PlannerRoom; compact?: boolean }) {
  const cameraRef = useRef<PerspectiveCameraImpl | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const frame = useMemo(() => getCameraFrame(room, compact), [compact, room]);

  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(...frame.position);
      cameraRef.current.lookAt(...frame.target);
      cameraRef.current.updateProjectionMatrix();
    }

    if (controlsRef.current) {
      controlsRef.current.target.set(...frame.target);
      controlsRef.current.update();
    }
  }, [frame]);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={frame.position} fov={compact ? 40 : 36} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        maxPolarAngle={Math.PI / 2.03}
        minDistance={frame.minDistance}
        maxDistance={frame.maxDistance}
      />
    </>
  );
}
