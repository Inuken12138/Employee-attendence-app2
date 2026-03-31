'use client';

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