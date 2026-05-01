/**
 * Pure helper functions for the kitchen designer.
 *
 * These utilities perform calculations, schema shaping, or taxonomy lookups without owning React rendering or network requests.
 */
export const PLANNER_PILOT_ASSET_BASE_PATH = '/planner-assets/pilots';
export const SINK_BASE_PILOT_ASSET_FAMILY = 'sink-base';

/** Builds the planner pilot asset path used by this module. */
export function buildPlannerPilotAssetPath(family: string, productCode: string | null | undefined) {
  if (typeof productCode !== 'string') {
    return null;
  }

  const normalizedProductCode = productCode.trim();

  if (!normalizedProductCode) {
    return null;
  }

  return `${PLANNER_PILOT_ASSET_BASE_PATH}/${family}/${normalizedProductCode}.glb`;
}

/** Builds the sink base pilot asset path used by this module. */
export function buildSinkBasePilotAssetPath(productCode: string | null | undefined) {
  return buildPlannerPilotAssetPath(SINK_BASE_PILOT_ASSET_FAMILY, productCode);
}