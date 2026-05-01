'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

interface PlannerPriceSummaryProps {
  amount: number;
  placement?: 'compact' | 'sidebar';
}

/** Renders the planner price summary component used by this module. */
export default function PlannerPriceSummary({ amount, placement = 'compact' }: PlannerPriceSummaryProps) {
  const compact = placement === 'compact';

  return (
    <div
      className={compact ? 'planner-price planner-price-compact' : 'planner-price planner-price-sidebar'}
      style={compact ? undefined : { width: '100%' }}
    >
      <div className="planner-price-label">Estimated total</div>
      <div className="planner-price-value">${amount.toFixed(2)}</div>
      <div className="planner-price-note">
        Room setup is live now. Product-driven pricing will increase once planner modules land in the next slice.
      </div>
    </div>
  );
}