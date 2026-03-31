'use client';

import {
  PLANNER_CABINET_GROUPS,
  PLANNER_ROOT_CATEGORIES,
  type PlannerCabinetGroupKey,
} from '../lib/plannerTaxonomy';
import type { PlannerTaxonomyPath } from '../types/planner';

interface MakeItYoursToolbarProps {
  menuOpen: boolean;
  selectedPath: PlannerTaxonomyPath | null;
  onToggleCabinets: () => void;
  onChoosePath: (path: PlannerTaxonomyPath) => void;
}

const toolbarItems = [
  { key: 'cabinets', label: PLANNER_ROOT_CATEGORIES.cabinets, icon: 'CB', interactive: true },
  { key: 'appliances', label: PLANNER_ROOT_CATEGORIES.appliances, icon: 'AP', interactive: false },
  { key: 'dining', label: PLANNER_ROOT_CATEGORIES.dining, icon: 'DI', interactive: false },
  { key: 'kitchen_extras', label: PLANNER_ROOT_CATEGORIES.kitchen_extras, icon: 'KE', interactive: false },
  { key: 'search', label: 'Search', icon: 'SR', interactive: false },
  { key: 'create-image', label: 'Create image', icon: 'CI', interactive: false },
  { key: 'view-images', label: 'View images', icon: 'VI', interactive: false },
] as const;

export default function MakeItYoursToolbar({
  menuOpen,
  selectedPath,
  onToggleCabinets,
  onChoosePath,
}: MakeItYoursToolbarProps) {
  return (
    <div className="planner-catalog-shell card card-glass">
      <div className="planner-catalog-toolbar">
        {toolbarItems.map((item) => {
          const active = item.key === 'cabinets' && menuOpen;

          return item.interactive ? (
            <button
              key={item.key}
              type="button"
              className={`planner-catalog-action${active ? ' planner-catalog-action-active' : ''}`}
              onClick={onToggleCabinets}
            >
              <span className="planner-catalog-action-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ) : (
            <button key={item.key} type="button" className="planner-catalog-action" disabled>
              <span className="planner-catalog-action-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {menuOpen && (
        <div className="planner-catalog-megamenu">
          {Object.entries(PLANNER_CABINET_GROUPS).map(([groupKey, group]) => (
            <div key={groupKey} className="planner-catalog-column">
              <div className="planner-catalog-column-title">{group.label}</div>
              <div className="planner-catalog-column-items">
                {Object.entries(group.leaves).map(([leafKey, leafLabel]) => {
                  const selected =
                    selectedPath?.rootCategory === 'cabinets' &&
                    selectedPath.groupCategory === groupKey &&
                    selectedPath.leafCategory === leafKey;

                  return (
                    <button
                      key={leafKey}
                      type="button"
                      className={`planner-catalog-leaf planner-catalog-leaf-button${selected ? ' planner-catalog-leaf-selected' : ''}`}
                      onClick={() =>
                        onChoosePath({
                          rootCategory: 'cabinets',
                          groupCategory: groupKey as PlannerCabinetGroupKey,
                          leafCategory: leafKey,
                        })
                      }
                    >
                      {leafLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}