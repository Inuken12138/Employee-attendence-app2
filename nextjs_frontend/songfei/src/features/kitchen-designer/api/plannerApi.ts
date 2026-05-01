/**
 * Wraps every kitchen planner endpoint used by the frontend.
 *
 * The planner feature creates, versions, validates, shares, and eventually adds
 * configured kitchen projects to the shopping bag. Keeping those requests here
 * lets the UI stay focused on editing and review flows rather than endpoint
 * details.
 */

import { apiJson } from '@/lib/api';

import type {
  PlannerAddToBagResponse,
  PlannerCatalogProduct,
  PlannerTaxonomyPath,
  PlannerDuplicateResponse,
  PlannerProject,
  PlannerProjectReviewResponse,
  PlannerProjectSaveResponse,
  PlannerShareLinkResponse,
  PlannerSharedProjectResponse,
  PlannerProjectSnapshot,
  PlannerProjectValidationResponse,
} from '../types/planner';

/** Loads planner catalog products and optionally narrows them by taxonomy path. */
export async function fetchPlannerCatalogProducts(
  filters: Partial<PlannerTaxonomyPath> = {},
): Promise<PlannerCatalogProduct[]> {
  const params = new URLSearchParams();

  if (filters.rootCategory) {
    params.set('root_category', filters.rootCategory);
  }

  if (filters.groupCategory) {
    params.set('group_category', filters.groupCategory);
  }

  if (filters.leafCategory) {
    params.set('leaf_category', filters.leafCategory);
  }

  const queryString = params.toString();

  return apiJson<PlannerCatalogProduct[]>(`/planner/catalog/products/${queryString ? `?${queryString}` : ''}`);
}

/** Loads one planner catalog product by numeric id. */
export async function fetchPlannerCatalogProduct(productId: number): Promise<PlannerCatalogProduct> {
  return apiJson<PlannerCatalogProduct>(`/planner/catalog/products/${productId}/`);
}

/** Returns the signed-in user's saved kitchen projects. */
export async function listPlannerProjects(): Promise<PlannerProject[]> {
  return apiJson<PlannerProject[]>('/planner/projects/');
}

/** Creates a brand-new planner project from the current room and product snapshot. */
export async function createPlannerProject(payload: {
  title: string;
  scene_snapshot: PlannerProjectSnapshot;
  estimated_price?: number;
  version_name?: string;
}): Promise<PlannerProject> {
  return apiJson<PlannerProject>('/planner/projects/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Fetches the latest saved state for a single planner project. */
export async function fetchPlannerProject(projectSlug: string): Promise<PlannerProject> {
  return apiJson<PlannerProject>(`/planner/projects/${projectSlug}/`);
}

/** Saves a new version entry under an existing planner project. */
export async function createPlannerProjectVersion(
  projectSlug: string,
  payload: {
    version_name?: string;
    scene_snapshot: PlannerProjectSnapshot;
    price_snapshot?: number;
    validation_summary?: Record<string, unknown>;
  },
): Promise<PlannerProjectSaveResponse> {
  return apiJson<PlannerProjectSaveResponse>(`/planner/projects/${projectSlug}/versions/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Runs backend validation rules against the current planner project. */
export async function validatePlannerProject(projectSlug: string): Promise<PlannerProjectValidationResponse> {
  return apiJson<PlannerProjectValidationResponse>(`/planner/projects/${projectSlug}/validate/`, {
    method: 'POST',
  });
}

/** Loads the review payload used by the planner review screen. */
export async function fetchPlannerProjectReview(projectSlug: string): Promise<PlannerProjectReviewResponse> {
  return apiJson<PlannerProjectReviewResponse>(`/planner/projects/${projectSlug}/review/`);
}

/** Converts a planner project into a bag/cart entry that can be checked out. */
export async function addPlannerProjectToBag(projectSlug: string): Promise<PlannerAddToBagResponse> {
  return apiJson<PlannerAddToBagResponse>(`/planner/projects/${projectSlug}/add-to-bag/`, {
    method: 'POST',
  });
}

/** Creates a share token that can be sent to another person for read-only review. */
export async function createPlannerShareLink(projectSlug: string): Promise<PlannerShareLinkResponse> {
  return apiJson<PlannerShareLinkResponse>(`/planner/projects/${projectSlug}/share-links/`, {
    method: 'POST',
  });
}

/** Reads a shared planner project using a public share token instead of auth. */
export async function fetchSharedPlannerProject(shareToken: string): Promise<PlannerSharedProjectResponse> {
  return apiJson<PlannerSharedProjectResponse>(`/planner/share/${shareToken}/`);
}

/** Clones an existing planner project so the user can branch from a saved design. */
export async function duplicatePlannerProject(
  projectSlug: string,
  payload: { title?: string; version_name?: string; reason?: string } = {},
): Promise<PlannerDuplicateResponse> {
  return apiJson<PlannerDuplicateResponse>(`/planner/projects/${projectSlug}/duplicate/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
