'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

import Link from 'next/link';

import { formatMillimeters } from '../lib/measurementMath';
import type { PlannerRoom } from '../types/planner';
import PlannerPriceSummary from './PlannerPriceSummary';
import RoomScene3D from './RoomScene3D';

interface PlannerReviewShellProps {
  projectId: string;
  room: PlannerRoom;
  estimatedTotal: number;
  isPersistedProject: boolean;
}

/** Renders the planner review shell component used by this module. */
export default function PlannerReviewShell({
  projectId,
  room,
  estimatedTotal,
  isPersistedProject,
}: PlannerReviewShellProps) {
  return (
    <div className="planner-review-grid">
      <div className="planner-review-main card">
        <div>
          <div className="pill">Make it happen</div>
          <h2 className="section-title" style={{ marginTop: '0.8rem', marginBottom: '0.35rem' }}>Future review surface</h2>
          <div className="muted">
            This stage now holds the room preview, measurement summary, and the layout slots that cabinet elevations and proceed actions will occupy later.
          </div>
        </div>
        <RoomScene3D room={room} compact />
      </div>

      <div className="planner-review-placeholders">
        {[
          'Front elevation placeholder',
          'Side elevation placeholder',
          'Top-view placeholder',
        ].map((label) => (
          <div key={label} className="planner-placeholder-card card card-glass">
            <div className="planner-placeholder-frame" />
            <strong>{label}</strong>
            <span className="muted">Reserved for cabinet imagery and measured review outputs.</span>
          </div>
        ))}
      </div>

      <aside className="planner-review-sidebar">
        <div className="card">
          <PlannerPriceSummary amount={estimatedTotal} placement="sidebar" />
          <div className="planner-room-dimension-list">
            <span>Top wall: {formatMillimeters(room.topMm)}</span>
            <span>Right wall: {formatMillimeters(room.rightMm)}</span>
            <span>Bottom wall: {formatMillimeters(room.bottomMm)}</span>
            <span>Left wall: {formatMillimeters(room.leftMm)}</span>
            <span>Ceiling: {formatMillimeters(room.heightMm)}</span>
          </div>
        </div>

        <div className="card card-glass" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ fontWeight: 600 }}>Next-step placeholders</div>
          <p className="muted" style={{ margin: 0 }}>
            Validation, BOM review, store help, and add-to-bag become meaningful after cabinet placement exists. This shell keeps the space ready now.
          </p>
          {isPersistedProject ? (
            <Link className="btn btn-outline" href={`/kitchen-designer/${projectId}/review`}>
              Open saved validation route
            </Link>
          ) : (
            <button type="button" className="btn btn-outline" disabled>
              Save project to unlock validation routes
            </button>
          )}
          <button type="button" className="btn btn-outline" disabled>
            Appointment flow placeholder
          </button>
          <button type="button" className="btn btn-primary" disabled>
            Add-to-bag placeholder
          </button>
        </div>
      </aside>
    </div>
  );
}