'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

import { formatMillimeters } from '../lib/measurementMath';
import type { PlannerRoom, PlannerStage } from '../types/planner';
import PlannerPriceSummary from './PlannerPriceSummary';

interface PlannerSubheaderProps {
  stage: PlannerStage;
  room: PlannerRoom;
  estimatedTotal: number;
  canContinue: boolean;
  onContinue: () => void;
  onOpenShapePicker: () => void;
  onHeightChange: (nextMm: number) => void;
}

/** Renders the planner subheader component used by this module. */
export default function PlannerSubheader({
  stage,
  room,
  estimatedTotal,
  canContinue,
  onContinue,
  onOpenShapePicker,
  onHeightChange,
}: PlannerSubheaderProps) {
  const isDefineStage = stage === 'define-space';
  const isRoomStage = stage === 'make-it-yours';

  return (
    <div className="planner-subheader card card-glass">
      <div className="planner-subheader-main">
        <div className="planner-subheader-lineup">
          {isDefineStage && (
            <button type="button" className="planner-chip planner-chip-active" onClick={onOpenShapePicker}>
              Room shape · Rectangular room
            </button>
          )}
          {isDefineStage && <span className="planner-chip">Define space</span>}
          {isDefineStage && <span className="planner-chip">Elements</span>}
          {isDefineStage && <span className="planner-chip">Openings</span>}
          {isDefineStage && <span className="planner-chip">Search</span>}
          {isRoomStage && <span className="planner-chip planner-chip-active">3D room preview</span>}
          {isRoomStage && <span className="planner-chip">Camera orbit enabled</span>}
          {stage === 'make-it-happen' && <span className="planner-chip planner-chip-active">Review shell placeholder</span>}
        </div>
        <div className="planner-subheader-meta">
          <label className="planner-height-field">
            <span>Ceiling height</span>
            <input
              className="input"
              type="number"
              min={2200}
              max={4000}
              step={50}
              value={room.heightMm}
              onChange={(event) => onHeightChange(Number.parseInt(event.target.value || '0', 10))}
            />
          </label>
          <div className="planner-room-summary">
            <span>{formatMillimeters(room.widthMm)} wide</span>
            <span>{formatMillimeters(room.depthMm)} deep</span>
          </div>
        </div>
      </div>
      {stage !== 'make-it-happen' ? (
        <div className="planner-subheader-actions">
          <PlannerPriceSummary amount={estimatedTotal} />
          <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!canContinue}>
            Continue
          </button>
        </div>
      ) : (
        <div className="planner-subheader-note">
          Cabinet elevations, BOM review, and proceed actions will plug into this shell next. The structure is in place so later content can land without redesign.
        </div>
      )}
    </div>
  );
}