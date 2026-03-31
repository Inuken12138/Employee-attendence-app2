import { Edges, Html, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Plane, Vector3 } from 'three';

import { usePlannerStore } from '../state/plannerStore';
import type { PlannerNode, PlannerRoom } from '../types/planner';

const MM_TO_SCENE = 0.001;
const SNAP_MM = 50;
const WALL_SNAP_THRESHOLD_MM = 140;
const floorPlane = new Plane(new Vector3(0, 1, 0), 0);

function supportsPointerCapture(target: EventTarget | null): target is EventTarget & {
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
} {
  if (!target) {
    return false;
  }

  return 'setPointerCapture' in target && 'releasePointerCapture' in target;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number) {
  return Math.round(value / SNAP_MM) * SNAP_MM;
}

function normalizeRotation(angle: number) {
  const fullTurn = Math.PI * 2;
  let next = angle % fullTurn;

  if (next < 0) {
    next += fullTurn;
  }

  return next;
}

function getRotatedFootprint(node: PlannerNode, rotationY: number) {
  const normalizedRotation = normalizeRotation(rotationY);
  const cos = Math.cos(normalizedRotation);
  const sin = Math.sin(normalizedRotation);

  return {
    halfX: (Math.abs(cos) * node.widthMm + Math.abs(sin) * node.depthMm) / 2,
    halfZ: (Math.abs(sin) * node.widthMm + Math.abs(cos) * node.depthMm) / 2,
  };
}

function clampPositionToRoom(node: PlannerNode, room: PlannerRoom, position: { x: number; z: number }, rotationY: number) {
  const footprint = getRotatedFootprint(node, rotationY);

  return {
    x: clamp(position.x, -room.widthMm / 2 + footprint.halfX, room.widthMm / 2 - footprint.halfX),
    z: clamp(position.z, -room.depthMm / 2 + footprint.halfZ, room.depthMm / 2 - footprint.halfZ),
  };
}

function getWallSnapCandidate(node: PlannerNode, room: PlannerRoom, position: { x: number; z: number }) {
  const candidates = [
    {
      distance: (target: { x: number; z: number }) => Math.abs(position.z - target.z),
      rotationY: 0,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, 0);
        return { x: position.x, z: -room.depthMm / 2 + footprint.halfZ };
      },
    },
    {
      distance: (target: { x: number; z: number }) => Math.abs(position.z - target.z),
      rotationY: Math.PI,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, Math.PI);
        return { x: position.x, z: room.depthMm / 2 - footprint.halfZ };
      },
    },
    {
      distance: (target: { x: number; z: number }) => Math.abs(position.x - target.x),
      rotationY: Math.PI / 2,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, Math.PI / 2);
        return { x: -room.widthMm / 2 + footprint.halfX, z: position.z };
      },
    },
    {
      distance: (target: { x: number; z: number }) => Math.abs(position.x - target.x),
      rotationY: Math.PI * 1.5,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, Math.PI * 1.5);
        return { x: room.widthMm / 2 - footprint.halfX, z: position.z };
      },
    },
  ];

  let bestCandidate: { position: { x: number; z: number }; rotationY: number; distance: number } | null = null;

  for (const candidate of candidates) {
    const target = candidate.buildTarget();
    const distance = candidate.distance(target);

    if (distance > WALL_SNAP_THRESHOLD_MM) {
      continue;
    }

    const clampedTarget = clampPositionToRoom(node, room, target, candidate.rotationY);

    if (!bestCandidate || distance < bestCandidate.distance) {
      bestCandidate = {
        position: clampedTarget,
        rotationY: candidate.rotationY,
        distance,
      };
    }
  }

  return bestCandidate;
}

function SceneModel({ node }: { node: PlannerNode }) {
  const gltf = useGLTF(node.glbFileUrl || '');

  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const transform = useMemo(() => {
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const widthScale = node.widthMm * MM_TO_SCENE / Math.max(size.x, 0.0001);
    const heightScale = node.heightMm * MM_TO_SCENE / Math.max(size.y, 0.0001);
    const depthScale = node.depthMm * MM_TO_SCENE / Math.max(size.z, 0.0001);

    return {
      center,
      scale: [widthScale, heightScale, depthScale] as [number, number, number],
    };
  }, [node.depthMm, node.heightMm, node.widthMm, scene]);

  return (
    <primitive
      object={scene}
      scale={transform.scale}
      position={[
        -transform.center.x * transform.scale[0],
        -transform.center.y * transform.scale[1],
        -transform.center.z * transform.scale[2],
      ]}
    />
  );
}

export default function ProductNode({
  node,
  room,
  isSelected,
  onSelect,
}: {
  node: PlannerNode;
  room: PlannerRoom;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const interactionMode = usePlannerStore((state) => state.interactionMode);
  const setInteractionMode = usePlannerStore((state) => state.setInteractionMode);
  const updateNodePosition = usePlannerStore((state) => state.updateNodePosition);
  const updateNodeRotation = usePlannerStore((state) => state.updateNodeRotation);
  const dragStateRef = useRef<{
    mode: 'move' | 'rotate';
    offsetX: number;
    offsetZ: number;
    startClientX: number;
    startRotationY: number;
  } | null>(null);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(node.nodeId);
  };

  useEffect(() => {
    if (!isSelected) {
      dragStateRef.current = null;
    }
  }, [isSelected]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!isSelected) {
      return;
    }

    if (interactionMode === 'move') {
      const hitPoint = new Vector3();
      const planeHit = event.ray.intersectPlane(floorPlane, hitPoint);

      if (!planeHit) {
        return;
      }

      dragStateRef.current = {
        mode: 'move',
        offsetX: node.position.x - hitPoint.x / MM_TO_SCENE,
        offsetZ: node.position.z - hitPoint.z / MM_TO_SCENE,
        startClientX: event.clientX,
        startRotationY: node.rotationY,
      };
      event.stopPropagation();
      if (supportsPointerCapture(event.target)) {
        event.target.setPointerCapture(event.pointerId);
      }
      return;
    }

    if (interactionMode === 'rotate') {
      dragStateRef.current = {
        mode: 'rotate',
        offsetX: 0,
        offsetZ: 0,
        startClientX: event.clientX,
        startRotationY: node.rotationY,
      };
      event.stopPropagation();
      if (supportsPointerCapture(event.target)) {
        event.target.setPointerCapture(event.pointerId);
      }
    }
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragStateRef.current || !isSelected) {
      return;
    }

    if (dragStateRef.current.mode === 'move') {
      const hitPoint = new Vector3();
      const planeHit = event.ray.intersectPlane(floorPlane, hitPoint);

      if (!planeHit) {
        return;
      }

      const nextPosition = clampPositionToRoom(
        node,
        room,
        {
          x: snap(hitPoint.x / MM_TO_SCENE + dragStateRef.current.offsetX),
          z: snap(hitPoint.z / MM_TO_SCENE + dragStateRef.current.offsetZ),
        },
        node.rotationY,
      );
      const wallSnapCandidate = getWallSnapCandidate(node, room, nextPosition);

      if (wallSnapCandidate) {
        updateNodePosition(node.nodeId, wallSnapCandidate.position);
        updateNodeRotation(node.nodeId, wallSnapCandidate.rotationY);
        return;
      }

      updateNodePosition(node.nodeId, nextPosition);
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startClientX;
    const nextRotation = normalizeRotation(dragStateRef.current.startRotationY + deltaX * 0.01);
    updateNodeRotation(node.nodeId, nextRotation);
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!dragStateRef.current) {
      return;
    }

    dragStateRef.current = null;
    event.stopPropagation();
    if (supportsPointerCapture(event.target)) {
      event.target.releasePointerCapture(event.pointerId);
    }
  };

  const rotationDegrees = Math.round((normalizeRotation(node.rotationY) * 180) / Math.PI);

  return (
    <group
      position={[node.position.x * MM_TO_SCENE, node.position.y * MM_TO_SCENE, node.position.z * MM_TO_SCENE]}
      rotation={[0, node.rotationY, 0]}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {node.glbFileUrl ? (
        <SceneModel node={node} />
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[node.widthMm * MM_TO_SCENE, node.heightMm * MM_TO_SCENE, node.depthMm * MM_TO_SCENE]} />
          <meshStandardMaterial color={isSelected ? '#f2c46f' : '#d7dfe4'} roughness={0.55} metalness={0.04} />
        </mesh>
      )}

      <mesh visible={false}>
        <boxGeometry args={[node.widthMm * MM_TO_SCENE, node.heightMm * MM_TO_SCENE, node.depthMm * MM_TO_SCENE]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {isSelected && (
        <mesh>
          <boxGeometry args={[node.widthMm * MM_TO_SCENE, node.heightMm * MM_TO_SCENE, node.depthMm * MM_TO_SCENE]} />
          <meshBasicMaterial transparent opacity={0} />
          <Edges color="#58caff" lineWidth={2} />
        </mesh>
      )}

      {isSelected && (
        <Html position={[0, node.heightMm * MM_TO_SCENE / 2 + 0.12, 0]} center>
          <div className="planner-node-actions">
            <button
              type="button"
              className={`planner-node-action${interactionMode === 'move' ? ' planner-node-action-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setInteractionMode(interactionMode === 'move' ? 'inspect' : 'move');
              }}
              aria-label="Move cabinet"
            >
              <span className="planner-node-action-icon">+</span>
            </button>
            <button
              type="button"
              className={`planner-node-action${interactionMode === 'rotate' ? ' planner-node-action-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setInteractionMode(interactionMode === 'rotate' ? 'inspect' : 'rotate');
              }}
              aria-label="Rotate cabinet"
            >
              <span className="planner-node-action-icon">R</span>
            </button>
          </div>
        </Html>
      )}

      {isSelected && interactionMode === 'rotate' && (
        <Html position={[0, -node.heightMm * MM_TO_SCENE / 2 + 0.14, 0]} center>
          <div className="planner-rotation-indicator">
            <div
              className="planner-rotation-ring"
              style={{
                background: `conic-gradient(#58caff 0deg ${rotationDegrees}deg, rgba(88, 202, 255, 0.18) ${rotationDegrees}deg 360deg)`,
              }}
            >
              <div className="planner-rotation-ring-inner">{rotationDegrees}°</div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
