"""Planner-specific API routes.

These endpoints are mounted under ``/api/planner/`` and cover three main jobs:
ERP-side planner product setup, customer project persistence, and shared/public
review flows for kitchen designs.
"""

from django.urls import path

from planner.views import (
    PlannerCatalogProductDetailView,
    PlannerCatalogProductListView,
    PlannerProjectAddToBagView,
    PlannerProjectDuplicateView,
    PlannerProductAssetValidateView,
    PlannerProductCatalogStateView,
    PlannerProjectDetailView,
    PlannerProjectListCreateView,
    PlannerProjectReviewView,
    PlannerProjectShareLinkView,
    PlannerProjectValidationView,
    PlannerProjectVersionListCreateView,
    PlannerProductProductionAssetListCreateView,
    PlannerProductProfileDetailView,
    PlannerProductionAssetDetailView,
    PlannerSharedProjectView,
)


urlpatterns = [
    path('catalog/products/', PlannerCatalogProductListView.as_view(), name='planner-catalog-products'),
    path('catalog/products/<int:product_id>/', PlannerCatalogProductDetailView.as_view(), name='planner-catalog-product-detail'),
    path('projects/', PlannerProjectListCreateView.as_view(), name='planner-projects'),
    path('projects/<slug:project_slug>/', PlannerProjectDetailView.as_view(), name='planner-project-detail'),
    path('projects/<slug:project_slug>/versions/', PlannerProjectVersionListCreateView.as_view(), name='planner-project-versions'),
    path('projects/<slug:project_slug>/validate/', PlannerProjectValidationView.as_view(), name='planner-project-validate'),
    path('projects/<slug:project_slug>/review/', PlannerProjectReviewView.as_view(), name='planner-project-review'),
    path('projects/<slug:project_slug>/add-to-bag/', PlannerProjectAddToBagView.as_view(), name='planner-project-add-to-bag'),
    path('projects/<slug:project_slug>/duplicate/', PlannerProjectDuplicateView.as_view(), name='planner-project-duplicate'),
    path('projects/<slug:project_slug>/share-links/', PlannerProjectShareLinkView.as_view(), name='planner-project-share-links'),
    path('share/<str:share_token>/', PlannerSharedProjectView.as_view(), name='planner-shared-project'),
    path('erp/products/<int:product_id>/profile/', PlannerProductProfileDetailView.as_view(), name='planner-product-profile'),
    path('erp/products/<int:product_id>/asset-validate/', PlannerProductAssetValidateView.as_view(), name='planner-product-asset-validate'),
    path('erp/products/<int:product_id>/<str:action>/', PlannerProductCatalogStateView.as_view(), name='planner-product-catalog-action'),
    path('erp/products/<int:product_id>/production-assets/', PlannerProductProductionAssetListCreateView.as_view(), name='planner-product-production-assets'),
    path('erp/production-assets/<int:asset_id>/', PlannerProductionAssetDetailView.as_view(), name='planner-production-asset-detail'),
]
