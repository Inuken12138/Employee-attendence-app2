import type { PlannerRoom, PlannerStage, PlannerWallSide } from '../types/planner';

export const ROOM_WALL_MIN_MM = 1500;
export const ROOM_WALL_MAX_MM = 10000;
export const ROOM_HEIGHT_MIN_MM = 2200;
export const ROOM_HEIGHT_MAX_MM = 4000;
export const DEFAULT_ROOM_WALL_MM = 4000;
export const DEFAULT_ROOM_HEIGHT_MM = 2500;

type RoomMeasurementInput = Partial<PlannerRoom>;

export interface FootprintPoint {
  x: number;
  y: number;
}

export interface RoomFootprint {
  points: [FootprintPoint, FootprintPoint, FootprintPoint, FootprintPoint];
  envelopeWidthMm: number;
  envelopeDepthMm: number;
  isFallback: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampWallMeasurement(value: number) {
  return Math.round(clamp(value, ROOM_WALL_MIN_MM, ROOM_WALL_MAX_MM));
}

export function clampHeightMeasurement(value: number) {
  return Math.round(clamp(value, ROOM_HEIGHT_MIN_MM, ROOM_HEIGHT_MAX_MM));
}

export function getWallMeasurement(room: PlannerRoom, wall: PlannerWallSide) {
  if (wall === 'top') {
    return room.topMm;
  }

  if (wall === 'right') {
    return room.rightMm;
  }

  if (wall === 'bottom') {
    return room.bottomMm;
  }

  return room.leftMm;
}

export function deriveRoomFootprint(room: Pick<PlannerRoom, 'topMm' | 'rightMm' | 'bottomMm' | 'leftMm'>): RoomFootprint {
  const topMm = clampWallMeasurement(room.topMm);
  const rightMm = clampWallMeasurement(room.rightMm);
  const bottomMm = clampWallMeasurement(room.bottomMm);
  const leftMm = clampWallMeasurement(room.leftMm);
  const delta = bottomMm - topMm;
  let offsetMm = 0;
  let depthMm = 0;
  let isFallback = false;

  if (Math.abs(delta) < 1e-6) {
    if (Math.abs(leftMm - rightMm) < 1e-6) {
      depthMm = leftMm;
    } else {
      isFallback = true;
      depthMm = Math.round((leftMm + rightMm) / 2);
    }
  } else {
    offsetMm = (rightMm * rightMm - leftMm * leftMm) / (2 * delta);
    const leftProjectionMm = offsetMm - delta / 2;
    const depthSquared = leftMm * leftMm - leftProjectionMm * leftProjectionMm;

    if (depthSquared <= 0) {
      isFallback = true;
      offsetMm = 0;
      depthMm = Math.round((leftMm + rightMm) / 2);
    } else {
      depthMm = Math.sqrt(depthSquared);
    }
  }

  depthMm = clampWallMeasurement(depthMm);

  const points: [FootprintPoint, FootprintPoint, FootprintPoint, FootprintPoint] = [
    { x: -topMm / 2, y: 0 },
    { x: topMm / 2, y: 0 },
    { x: offsetMm + bottomMm / 2, y: depthMm },
    { x: offsetMm - bottomMm / 2, y: depthMm },
  ];

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const centeredPoints = points.map((point) => ({
    x: point.x - (minX + maxX) / 2,
    y: point.y,
  })) as RoomFootprint['points'];

  return {
    points: centeredPoints,
    envelopeWidthMm: maxX - minX,
    envelopeDepthMm: depthMm,
    isFallback,
  };
}

export function buildPlannerRoom(input: RoomMeasurementInput = {}): PlannerRoom {
  const widthMm = input.widthMm ?? DEFAULT_ROOM_WALL_MM;
  const depthMm = input.depthMm ?? DEFAULT_ROOM_WALL_MM;
  const topMm = clampWallMeasurement(input.topMm ?? widthMm);
  const bottomMm = clampWallMeasurement(input.bottomMm ?? widthMm);
  const leftMm = clampWallMeasurement(input.leftMm ?? depthMm);
  const rightMm = clampWallMeasurement(input.rightMm ?? depthMm);
  const heightMm = clampHeightMeasurement(input.heightMm ?? DEFAULT_ROOM_HEIGHT_MM);
  const footprint = deriveRoomFootprint({ topMm, rightMm, bottomMm, leftMm });

  return {
    shape: 'rectangle',
    topMm,
    rightMm,
    bottomMm,
    leftMm,
    widthMm: Math.round(footprint.envelopeWidthMm),
    depthMm: Math.round(footprint.envelopeDepthMm),
    heightMm,
  };
}

export function updatePlannerWall(room: PlannerRoom, wall: PlannerWallSide, nextMm: number) {
  return buildPlannerRoom({
    ...room,
    topMm: wall === 'top' ? nextMm : room.topMm,
    rightMm: wall === 'right' ? nextMm : room.rightMm,
    bottomMm: wall === 'bottom' ? nextMm : room.bottomMm,
    leftMm: wall === 'left' ? nextMm : room.leftMm,
  });
}

export function updatePlannerHeight(room: PlannerRoom, nextMm: number) {
  return buildPlannerRoom({
    ...room,
    heightMm: nextMm,
  });
}

export function formatMillimeters(value: number) {
  return `${Math.round(value).toLocaleString()} mm`;
}

export function parseMeasurementInput(value: string) {
  const numericValue = Number.parseInt(value.replace(/[^\d-]/g, ''), 10);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
}

export function isPlannerRoomValid(room: PlannerRoom) {
  return [room.topMm, room.rightMm, room.bottomMm, room.leftMm].every(
    (measurement) => measurement >= ROOM_WALL_MIN_MM && measurement <= ROOM_WALL_MAX_MM,
  ) && room.heightMm >= ROOM_HEIGHT_MIN_MM && room.heightMm <= ROOM_HEIGHT_MAX_MM;
}

const stageOrder: PlannerStage[] = ['define-space', 'make-it-yours', 'make-it-happen'];

export function getPlannerStageIndex(stage: PlannerStage) {
  return stageOrder.indexOf(stage);
}

export function getNextPlannerStage(stage: PlannerStage): PlannerStage | null {
  const index = getPlannerStageIndex(stage);
  return stageOrder[index + 1] ?? null;
}

export function canNavigateToPlannerStage(currentStage: PlannerStage, targetStage: PlannerStage, room: PlannerRoom) {
  const currentIndex = getPlannerStageIndex(currentStage);
  const targetIndex = getPlannerStageIndex(targetStage);

  if (targetIndex <= currentIndex) {
    return true;
  }

  return isPlannerRoomValid(room);
}