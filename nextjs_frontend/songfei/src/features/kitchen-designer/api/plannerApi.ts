import { apiJson } from '@/lib/api';

import type {
  PlannerAddToBagResponse,
  PlannerCatalogProduct,
  PlannerDuplicateResponse,
  PlannerProject,
  PlannerProjectReviewResponse,
  PlannerProjectSaveResponse,
  PlannerShareLinkResponse,
  PlannerSharedProjectResponse,
  PlannerProjectSnapshot,
  PlannerProjectValidationResponse,
} from '../types/planner';

export async function fetchPlannerCatalogProducts(): Promise<PlannerCatalogProduct[]> {
  return apiJson<PlannerCatalogProduct[]>('/planner/catalog/products/');
}

export async function fetchPlannerCatalogProduct(productId: number): Promise<PlannerCatalogProduct> {
  return apiJson<PlannerCatalogProduct>(`/planner/catalog/products/${productId}/`);
}

export async function listPlannerProjects(): Promise<PlannerProject[]> {
  return apiJson<PlannerProject[]>('/planner/projects/');
}

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

export async function fetchPlannerProject(projectSlug: string): Promise<PlannerProject> {
  return apiJson<PlannerProject>(`/planner/projects/${projectSlug}/`);
}

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

export async function validatePlannerProject(projectSlug: string): Promise<PlannerProjectValidationResponse> {
  return apiJson<PlannerProjectValidationResponse>(`/planner/projects/${projectSlug}/validate/`, {
    method: 'POST',
  });
}

export async function fetchPlannerProjectReview(projectSlug: string): Promise<PlannerProjectReviewResponse> {
  return apiJson<PlannerProjectReviewResponse>(`/planner/projects/${projectSlug}/review/`);
}

export async function addPlannerProjectToBag(projectSlug: string): Promise<PlannerAddToBagResponse> {
  return apiJson<PlannerAddToBagResponse>(`/planner/projects/${projectSlug}/add-to-bag/`, {
    method: 'POST',
  });
}

export async function createPlannerShareLink(projectSlug: string): Promise<PlannerShareLinkResponse> {
  return apiJson<PlannerShareLinkResponse>(`/planner/projects/${projectSlug}/share-links/`, {
    method: 'POST',
  });
}

export async function fetchSharedPlannerProject(shareToken: string): Promise<PlannerSharedProjectResponse> {
  return apiJson<PlannerSharedProjectResponse>(`/planner/share/${shareToken}/`);
}

export async function duplicatePlannerProject(
  projectSlug: string,
  payload: { title?: string; version_name?: string; reason?: string } = {},
): Promise<PlannerDuplicateResponse> {
  return apiJson<PlannerDuplicateResponse>(`/planner/projects/${projectSlug}/duplicate/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
