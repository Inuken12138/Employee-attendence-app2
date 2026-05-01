/**
 * Babylon-based runtime helper for the kitchen designer.
 *
 * This file contains rendering or math glue that powers the richer interactive planner experience.
 */
import type { PlannerNode, PlannerRoom } from '../types/planner';

export const MM_TO_SCENE = 0.001;
export const SNAP_MM = 50;
export const WALL_SNAP_THRESHOLD_MM = 140;
export const OBJECT_SNAP_THRESHOLD_MM = 90;

const CARDINAL_ROTATIONS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2];
const CARDINAL_ROTATION_THRESHOLD = Math.PI / 36;

export interface CameraFrame {
  alpha: number;
  beta: number;
  radius: number;
  target: { x: number; y: number; z: number };
  minRadius: number;
  maxRadius: number;
}

export interface PlacementResolution {
  position: { x: number; y: number; z: number };
  rotationY: number;
  collides: boolean;
}

interface Bounds3d {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Clamps the  so it stays within allowed limits. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Returns the overlap for the current input. */
function getOverlap(minA: number, maxA: number, minB: number, maxB: number) {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

/** Helper used by this module to manage snap mm. */
export function snapMm(value: number) {
  return Math.round(value / SNAP_MM) * SNAP_MM;
}

/** Normalizes the rotation into the shape expected by this module. */
export function normalizeRotation(angle: number) {
  const fullTurn = Math.PI * 2;
  let next = angle % fullTurn;

  if (next < 0) {
    next += fullTurn;
  }

  return next;
}

/** Helper used by this module to manage snap rotation. */
export function snapRotation(angle: number) {
  const normalized = normalizeRotation(angle);
  let best = normalized;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of CARDINAL_ROTATIONS) {
    const distance = Math.abs(normalized - candidate);
    const wrappedDistance = Math.min(distance, Math.abs(distance - Math.PI * 2));

    if (wrappedDistance < bestDistance) {
      bestDistance = wrappedDistance;
      best = candidate === Math.PI * 2 ? 0 : candidate;
    }
  }

  return bestDistance <= CARDINAL_ROTATION_THRESHOLD ? best : normalized;
}

/** Returns whether wall mounted. */
export function isWallMounted(node: PlannerNode) {
  return Boolean(node.allowVerticalMovement) || node.plannerRole === 'wall';
}

/** Returns the camera frame for the current input. */
export function getCameraFrame(room?: PlannerRoom, compact = false): CameraFrame {
  /** Helper used by this module to manage width. */
  const width = (room?.widthMm ?? 4000) * MM_TO_SCENE;
  /** Helper used by this module to manage depth. */
  const depth = (room?.depthMm ?? 4000) * MM_TO_SCENE;
  /** Helper used by this module to manage height. */
  const height = (room?.heightMm ?? 2500) * MM_TO_SCENE;
  const footprint = Math.max(width, depth);
  const distance = compact ? footprint * 1.05 : footprint * 0.94;
  const position = {
    x: Math.max(width * 0.82, 2.6),
    y: Math.max(height * 0.88, compact ? 1.7 : 2.25),
    z: Math.max(depth * 0.96, distance),
  };
  const target = { x: 0, y: height * 0.38, z: 0 };
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    alpha: Math.atan2(dx, dz),
    beta: Math.acos(clamp(dy / radius, -1, 1)),
    radius,
    target,
    minRadius: Math.max(1.4, footprint * 0.42),
    maxRadius: Math.max(9, footprint * 3.1),
  };
}

/** Returns the rotated footprint for the current input. */
export function getRotatedFootprint(node: PlannerNode, rotationY: number) {
  const normalizedRotation = normalizeRotation(rotationY);
  const cos = Math.cos(normalizedRotation);
  const sin = Math.sin(normalizedRotation);

  return {
    halfX: (Math.abs(cos) * node.widthMm + Math.abs(sin) * node.depthMm) / 2,
    halfZ: (Math.abs(sin) * node.widthMm + Math.abs(cos) * node.depthMm) / 2,
  };
}

/** Clamps the vertical position so it stays within allowed limits. */
export function clampVerticalPosition(node: PlannerNode, room: PlannerRoom, y: number) {
  return clamp(y, node.heightMm / 2, room.heightMm - node.heightMm / 2);
}

/** Clamps the position to room so it stays within allowed limits. */
export function clampPositionToRoom(
  node: PlannerNode,
  room: PlannerRoom,
  position: { x: number; y: number; z: number },
  rotationY: number,
) {
  const footprint = getRotatedFootprint(node, rotationY);

  return {
    x: clamp(position.x, -room.widthMm / 2 + footprint.halfX, room.widthMm / 2 - footprint.halfX),
    y: clampVerticalPosition(node, room, position.y),
    z: clamp(position.z, -room.depthMm / 2 + footprint.halfZ, room.depthMm / 2 - footprint.halfZ),
  };
}

/** Returns the node bounds for the current input. */
function getNodeBounds(node: PlannerNode, position: { x: number; y: number; z: number }, rotationY: number): Bounds3d {
  const footprint = getRotatedFootprint(node, rotationY);

  return {
    minX: position.x - footprint.halfX,
    maxX: position.x + footprint.halfX,
    minY: position.y - node.heightMm / 2,
    maxY: position.y + node.heightMm / 2,
    minZ: position.z - footprint.halfZ,
    maxZ: position.z + footprint.halfZ,
  };
}

/** Returns the wall snap candidate for the current input. */
export function getWallSnapCandidate(
  node: PlannerNode,
  room: PlannerRoom,
  position: { x: number; y: number; z: number },
  forceAttach = false,
) {
  const candidates = [
    {
      rotationY: 0,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, 0);
        return { x: position.x, y: position.y, z: -room.depthMm / 2 + footprint.halfZ };
      },
      distance: (target: { x: number; y: number; z: number }) => Math.abs(position.z - target.z),
    },
    {
      rotationY: Math.PI,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, Math.PI);
        return { x: position.x, y: position.y, z: room.depthMm / 2 - footprint.halfZ };
      },
      distance: (target: { x: number; y: number; z: number }) => Math.abs(position.z - target.z),
    },
    {
      rotationY: Math.PI / 2,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, Math.PI / 2);
        return { x: -room.widthMm / 2 + footprint.halfX, y: position.y, z: position.z };
      },
      distance: (target: { x: number; y: number; z: number }) => Math.abs(position.x - target.x),
    },
    {
      rotationY: Math.PI * 1.5,
      buildTarget: () => {
        const footprint = getRotatedFootprint(node, Math.PI * 1.5);
        return { x: room.widthMm / 2 - footprint.halfX, y: position.y, z: position.z };
      },
      distance: (target: { x: number; y: number; z: number }) => Math.abs(position.x - target.x),
    },
  ];

  let bestCandidate: { position: { x: number; y: number; z: number }; rotationY: number; distance: number } | null = null;

  for (const candidate of candidates) {
    const target = candidate.buildTarget();
    const distance = candidate.distance(target);

    if (!forceAttach && distance > WALL_SNAP_THRESHOLD_MM) {
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

/** Returns the object snap candidate for the current input. */
export function getObjectSnapCandidate(
  node: PlannerNode,
  nodes: PlannerNode[],
  position: { x: number; y: number; z: number },
  rotationY: number,
) {
  const footprint = getRotatedFootprint(node, rotationY);
  const selfBounds = getNodeBounds(node, position, rotationY);
  let bestCandidate: { position: { x: number; y: number; z: number }; distance: number } | null = null;

  for (const other of nodes) {
    if (other.nodeId === node.nodeId) {
      continue;
    }

    const otherFootprint = getRotatedFootprint(other, other.rotationY);
    const otherBounds = getNodeBounds(other, other.position, other.rotationY);
    const verticalOverlap = getOverlap(selfBounds.minY, selfBounds.maxY, otherBounds.minY, otherBounds.maxY);

    if (verticalOverlap <= 20) {
      continue;
    }

    const zOverlap = getOverlap(selfBounds.minZ, selfBounds.maxZ, otherBounds.minZ, otherBounds.maxZ);
    if (zOverlap > 80) {
      const candidates = [
        other.position.x - otherFootprint.halfX - footprint.halfX,
        other.position.x + otherFootprint.halfX + footprint.halfX,
      ];

      for (const candidateX of candidates) {
        const distance = Math.abs(position.x - candidateX);

        if (distance <= OBJECT_SNAP_THRESHOLD_MM && (!bestCandidate || distance < bestCandidate.distance)) {
          bestCandidate = {
            position: { x: candidateX, y: position.y, z: position.z },
            distance,
          };
        }
      }
    }

    const xOverlap = getOverlap(selfBounds.minX, selfBounds.maxX, otherBounds.minX, otherBounds.maxX);
    if (xOverlap > 80) {
      const candidates = [
        other.position.z - otherFootprint.halfZ - footprint.halfZ,
        other.position.z + otherFootprint.halfZ + footprint.halfZ,
      ];

      for (const candidateZ of candidates) {
        const distance = Math.abs(position.z - candidateZ);

        if (distance <= OBJECT_SNAP_THRESHOLD_MM && (!bestCandidate || distance < bestCandidate.distance)) {
          bestCandidate = {
            position: { x: position.x, y: position.y, z: candidateZ },
            distance,
          };
        }
      }
    }
  }

  return bestCandidate;
}

/** Helper used by this module to manage collides with nodes. */
export function collidesWithNodes(
  node: PlannerNode,
  nodes: PlannerNode[],
  position: { x: number; y: number; z: number },
  rotationY: number,
) {
  const bounds = getNodeBounds(node, position, rotationY);

  return nodes.some((other) => {
    if (other.nodeId === node.nodeId) {
      return false;
    }

    const otherBounds = getNodeBounds(other, other.position, other.rotationY);
    return (
      bounds.minX < otherBounds.maxX &&
      bounds.maxX > otherBounds.minX &&
      bounds.minY < otherBounds.maxY &&
      bounds.maxY > otherBounds.minY &&
      bounds.minZ < otherBounds.maxZ &&
      bounds.maxZ > otherBounds.minZ
    );
  });
}

/** Resolves the node placement from the available inputs. */
export function resolveNodePlacement(
  node: PlannerNode,
  nodes: PlannerNode[],
  room: PlannerRoom,
  position: { x: number; y: number; z: number },
  rotationY: number,
): PlacementResolution {
  const forceWallAttachment = isWallMounted(node);
  let nextRotation = snapRotation(rotationY);
  let nextPosition = clampPositionToRoom(
    node,
    room,
    {
      x: snapMm(position.x),
      y: position.y,
      z: snapMm(position.z),
    },
    nextRotation,
  );

  const wallSnapCandidate = getWallSnapCandidate(node, room, nextPosition, forceWallAttachment);
  if (wallSnapCandidate) {
    nextPosition = wallSnapCandidate.position;
    nextRotation = wallSnapCandidate.rotationY;
  }

  const objectSnapCandidate = getObjectSnapCandidate(node, nodes, nextPosition, nextRotation);
  if (objectSnapCandidate) {
    nextPosition = clampPositionToRoom(node, room, objectSnapCandidate.position, nextRotation);
  }

  nextPosition = clampPositionToRoom(node, room, nextPosition, nextRotation);

  return {
    position: nextPosition,
    rotationY: nextRotation,
    collides: collidesWithNodes(node, nodes, nextPosition, nextRotation),
  };
}