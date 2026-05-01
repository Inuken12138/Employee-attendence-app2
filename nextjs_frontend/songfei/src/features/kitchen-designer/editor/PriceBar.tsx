'use client';

/**
 * Editor-side kitchen designer component.
 *
 * Files in this folder render the planner workspace controls that let users inspect, edit, and price a room design.
 */

import { usePlannerStore } from '../state/plannerStore';

/** Renders the price bar component used by this module. */
export default function PriceBar() {
  const nodes = usePlannerStore((state) => state.nodes);
  const total = nodes.reduce((sum, node) => sum + node.price, 0);

  return (
    <div
      className="card card-glass"
      style={{
        padding: '1rem 1.2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div className="pill">Live estimate</div>
        <div style={{ marginTop: '0.5rem', color: 'var(--ink-2)' }}>
          Prototype total based on currently placed published planner products.
        </div>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-1)' }}>${total.toFixed(2)}</div>
    </div>
  );
}
