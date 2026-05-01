'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

import type { PlannerStage } from '../types/planner';

const stageDefinitions: Array<{ stage: PlannerStage; label: string; caption: string }> = [
  {
    stage: 'define-space',
    label: 'Define your space',
    caption: 'Set room shape, wall lengths, and ceiling height.',
  },
  {
    stage: 'make-it-yours',
    label: 'Make it yours',
    caption: 'See the room as a live Babylon scene.',
  },
  {
    stage: 'make-it-happen',
    label: 'Make it happen',
    caption: 'Reserve the final review shell for outputs and next steps.',
  },
];

interface PlannerHeaderProps {
  stage: PlannerStage;
  onSelectStage: (stage: PlannerStage) => void;
  canSelectStage: (stage: PlannerStage) => boolean;
}

/** Renders the planner header component used by this module. */
export default function PlannerHeader({ stage, onSelectStage, canSelectStage }: PlannerHeaderProps) {
  const activeIndex = stageDefinitions.findIndex((item) => item.stage === stage);

  return (
    <div className="planner-stage-shell card card-glass">
      <div className="planner-stage-shell-copy">
        <div className="pill">Planner flow</div>
        <div className="planner-stage-shell-title">Room-first kitchen designer MVP</div>
        <div className="planner-stage-shell-subtitle">
          A staged room-definition flow now replaces the earlier cabinet-placement prototype so the page shell and room geometry are stable before catalog placement returns.
        </div>
      </div>
      <div className="planner-stage-tabs" role="tablist" aria-label="Kitchen designer stages">
        {stageDefinitions.map((item, index) => {
          const isActive = item.stage === stage;
          const isComplete = index < activeIndex;
          const selectable = canSelectStage(item.stage);

          return (
            <button
              key={item.stage}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`planner-stage-tab${isActive ? ' planner-stage-tab-active' : ''}${isComplete ? ' planner-stage-tab-complete' : ''}`}
              onClick={() => selectable && onSelectStage(item.stage)}
              disabled={!selectable}
            >
              <span className="planner-stage-tab-index">{index + 1}</span>
              <span className="planner-stage-tab-label">{item.label}</span>
              <span className="planner-stage-tab-caption">{item.caption}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}