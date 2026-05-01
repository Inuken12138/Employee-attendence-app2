'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

import { useEffect, useState } from 'react';

import { formatMillimeters, parseMeasurementInput } from '../lib/measurementMath';
import type { PlannerWallSide } from '../types/planner';

interface MeasurementLabelProps {
  x: number;
  y: number;
  wall: PlannerWallSide;
  valueMm: number;
  editing: boolean;
  onStartEditing: (wall: PlannerWallSide) => void;
  onCommit: (wall: PlannerWallSide, nextMm: number) => void;
  onCancel: () => void;
}

/** Renders the measurement label component used by this module. */
export default function MeasurementLabel({
  x,
  y,
  wall,
  valueMm,
  editing,
  onStartEditing,
  onCommit,
  onCancel,
}: MeasurementLabelProps) {
  const [draftValue, setDraftValue] = useState(String(Math.round(valueMm)));

  useEffect(() => {
    if (!editing) {
      setDraftValue(String(Math.round(valueMm)));
    }
  }, [editing, valueMm]);

  /** Helper used by this module to manage commit. */
  const commit = () => {
    const parsedValue = parseMeasurementInput(draftValue);

    if (parsedValue === null) {
      return;
    }

    onCommit(wall, parsedValue);
  };

  return (
    <foreignObject x={x - 70} y={y - 24} width={140} height={48}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {editing ? (
          <input
            autoFocus
            className="planner-measurement-input"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit();
              }

              if (event.key === 'Escape') {
                onCancel();
              }
            }}
          />
        ) : (
          <button type="button" className="planner-measurement-pill" onClick={() => onStartEditing(wall)}>
            {formatMillimeters(valueMm)}
          </button>
        )}
      </div>
    </foreignObject>
  );
}