'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

import { useEffect, useMemo, useRef } from 'react';

import {
  deriveRoomFootprint,
  formatMillimeters,
  getWallMeasurement,
} from '../lib/measurementMath';
import type { PlannerRoom, PlannerWallSide } from '../types/planner';
import MeasurementLabel from './MeasurementLabel';

interface FloorPlanEditor2DProps {
  room: PlannerRoom;
  activeWall: PlannerWallSide | null;
  editingMeasurement: PlannerWallSide | null;
  onActiveWallChange: (wall: PlannerWallSide | null) => void;
  onEditingMeasurementChange: (wall: PlannerWallSide | null) => void;
  onWallChange: (wall: PlannerWallSide, nextMm: number) => void;
}

type SvgPoint = { x: number; y: number };

const viewBoxWidth = 860;
const viewBoxHeight = 560;
const viewBoxPadding = 110;

/** Helper used by this module to manage normalise. */
function normalise(point: SvgPoint) {
  const length = Math.sqrt(point.x * point.x + point.y * point.y) || 1;
  return {
    x: point.x / length,
    y: point.y / length,
  };
}

/** Helper used by this module to manage midpoint. */
function midpoint(a: SvgPoint, b: SvgPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/** Renders the floor plan editor2 d component used by this module. */
export default function FloorPlanEditor2D({
  room,
  activeWall,
  editingMeasurement,
  onActiveWallChange,
  onEditingMeasurementChange,
  onWallChange,
}: FloorPlanEditor2DProps) {
  const dragStateRef = useRef<{
    wall: PlannerWallSide;
    startClientX: number;
    startClientY: number;
    startMeasurementMm: number;
    pxPerMm: number;
  } | null>(null);

  const footprint = useMemo(
    () => deriveRoomFootprint(room),
    [room],
  );

  const scale = useMemo(() => {
    const widthScale = (viewBoxWidth - viewBoxPadding * 2) / Math.max(footprint.envelopeWidthMm, 1);
    const heightScale = (viewBoxHeight - viewBoxPadding * 2) / Math.max(footprint.envelopeDepthMm, 1);
    return Math.min(widthScale, heightScale);
  }, [footprint.envelopeDepthMm, footprint.envelopeWidthMm]);

  const transformedPoints = useMemo(() => {
    const topMargin = (viewBoxHeight - footprint.envelopeDepthMm * scale) / 2;

    return footprint.points.map((point) => ({
      x: viewBoxWidth / 2 + point.x * scale,
      y: topMargin + point.y * scale,
    })) as [SvgPoint, SvgPoint, SvgPoint, SvgPoint];
  }, [footprint.envelopeDepthMm, footprint.points, scale]);

  const walls = useMemo(() => {
    const [topLeft, topRight, bottomRight, bottomLeft] = transformedPoints;
    const definitions: Array<{ wall: PlannerWallSide; from: SvgPoint; to: SvgPoint }> = [
      { wall: 'top', from: topLeft, to: topRight },
      { wall: 'right', from: topRight, to: bottomRight },
      { wall: 'bottom', from: bottomRight, to: bottomLeft },
      { wall: 'left', from: bottomLeft, to: topLeft },
    ];

    return definitions.map((definition) => {
      const edgeVector = {
        x: definition.to.x - definition.from.x,
        y: definition.to.y - definition.from.y,
      };
      const outwardNormal = normalise({ x: edgeVector.y, y: -edgeVector.x });
      const labelAnchor = midpoint(definition.from, definition.to);

      return {
        ...definition,
        labelX: labelAnchor.x + outwardNormal.x * 40,
        labelY: labelAnchor.y + outwardNormal.y * 40,
        guideX: labelAnchor.x + outwardNormal.x * 20,
        guideY: labelAnchor.y + outwardNormal.y * 20,
      };
    });
  }, [transformedPoints]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const horizontalDrag = dragState.wall === 'top' || dragState.wall === 'bottom';
      const deltaPx = horizontalDrag
        ? event.clientX - dragState.startClientX
        : dragState.startClientY - event.clientY;
      const deltaMm = deltaPx / dragState.pxPerMm;
      onWallChange(dragState.wall, dragState.startMeasurementMm + deltaMm);
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      onActiveWallChange(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onActiveWallChange, onWallChange]);

  const polygonPoints = transformedPoints.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="planner-floorplan card">
      <div className="planner-floorplan-header">
        <div>
          <div className="pill">2D floor plan</div>
          <h2 className="section-title" style={{ marginTop: '0.85rem', marginBottom: '0.35rem' }}>Direct room definition</h2>
          <div className="muted">
            Drag a wall on its primary axis or click a measurement to enter the exact millimeter value.
          </div>
        </div>
        <div className="planner-floorplan-stats">
          <span>{formatMillimeters(room.widthMm)} envelope width</span>
          <span>{formatMillimeters(room.depthMm)} envelope depth</span>
          {footprint.isFallback && <span>Preview envelope normalized to keep the room drawable.</span>}
        </div>
      </div>
      <svg className="planner-floorplan-svg" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} role="img" aria-label="Room floor plan editor">
        <defs>
          <linearGradient id="plannerFloorFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(111, 213, 199, 0.34)" />
            <stop offset="100%" stopColor="rgba(159, 168, 255, 0.16)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="rgba(10, 13, 18, 0.72)" rx="28" />
        <polygon points={polygonPoints} fill="url(#plannerFloorFill)" stroke="rgba(242, 196, 111, 0.85)" strokeWidth="4" />
        {walls.map((wall) => (
          <g key={wall.wall}>
            <line
              x1={wall.from.x}
              y1={wall.from.y}
              x2={wall.guideX}
              y2={wall.guideY}
              stroke="rgba(245, 242, 234, 0.18)"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
            <line
              x1={wall.from.x}
              y1={wall.from.y}
              x2={wall.to.x}
              y2={wall.to.y}
              stroke={activeWall === wall.wall ? 'rgba(111, 213, 199, 0.95)' : 'transparent'}
              strokeWidth="8"
              strokeLinecap="round"
            />
            <line
              x1={wall.from.x}
              y1={wall.from.y}
              x2={wall.to.x}
              y2={wall.to.y}
              stroke="transparent"
              strokeWidth="28"
              strokeLinecap="round"
              onPointerDown={(event) => {
                dragStateRef.current = {
                  wall: wall.wall,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startMeasurementMm: getWallMeasurement(room, wall.wall),
                  pxPerMm: scale,
                };
                onActiveWallChange(wall.wall);
              }}
            />
            <MeasurementLabel
              x={wall.labelX}
              y={wall.labelY}
              wall={wall.wall}
              valueMm={getWallMeasurement(room, wall.wall)}
              editing={editingMeasurement === wall.wall}
              onStartEditing={onEditingMeasurementChange}
              onCommit={(side, nextMm) => {
                onWallChange(side, nextMm);
                onEditingMeasurementChange(null);
              }}
              onCancel={() => onEditingMeasurementChange(null)}
            />
          </g>
        ))}
      </svg>
      <div className="planner-floorplan-hint">
        Top and bottom walls resize horizontally. Left and right walls resize vertically. The 3D scene uses the resulting room envelope so stage transitions stay stable.
      </div>
    </div>
  );
}