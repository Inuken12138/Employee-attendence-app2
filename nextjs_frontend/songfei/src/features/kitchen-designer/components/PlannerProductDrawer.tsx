'use client';

/**
 * Reusable kitchen designer UI component.
 *
 * These components support the planner flow with review widgets, subheaders, drawers, and guided controls.
 */

import { useEffect, useMemo, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';

import { fetchPlannerCatalogProducts } from '../api/plannerApi';
import { formatPlannerBreadcrumb } from '../lib/plannerTaxonomy';
import { usePlannerStore } from '../state/plannerStore';
import type { PlannerCatalogProduct, PlannerTaxonomyPath } from '../types/planner';

interface PlannerProductDrawerProps {
  open: boolean;
  selectedPath: PlannerTaxonomyPath | null;
  onClose: () => void;
}

/** Sorts the base products into a stable display or processing order. */
function sortBaseProducts(products: PlannerCatalogProduct[]) {
  return [...products].sort((left, right) => {
    if (left.product_id === 'G01') {
      return -1;
    }

    if (right.product_id === 'G01') {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

/** Renders the planner product drawer component used by this module. */
export default function PlannerProductDrawer({ open, selectedPath, onClose }: PlannerProductDrawerProps) {
  const { showErrorPopup } = useErrorPopup();
  const addNodeFromProduct = usePlannerStore((state) => state.addNodeFromProduct);
  const [catalog, setCatalog] = useState<PlannerCatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open || !selectedPath) {
      return;
    }

    const loadCatalog = async () => {
      setLoading(true);
      try {
        const products = await fetchPlannerCatalogProducts(selectedPath);
        setCatalog(products);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load planner catalog.';
        showErrorPopup(message);
      } finally {
        setLoading(false);
      }
    };

    void loadCatalog();
  }, [open, selectedPath, showErrorPopup]);

  useEffect(() => {
    setQuery('');
  }, [selectedPath]);

  const products = useMemo(() => {
    const scopedProducts = sortBaseProducts(
      catalog.filter((product) => {
        if (!selectedPath) {
          return false;
        }

        return (
          product.planner_root_category === selectedPath.rootCategory &&
          product.planner_group_category === selectedPath.groupCategory &&
          product.planner_leaf_category === selectedPath.leafCategory
        );
      }),
    );
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
      return scopedProducts;
    }

    return scopedProducts.filter((product) => {
      return [product.name, product.product_id, product.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(trimmedQuery);
    });
  }, [catalog, query, selectedPath]);

  if (!open || !selectedPath) {
    return null;
  }

  const breadcrumb = formatPlannerBreadcrumb(selectedPath);

  return (
    <aside className="planner-product-drawer card">
      <div className="planner-product-drawer-header">
        <div>
          <div className="pill">Add an item</div>
          <div className="planner-product-breadcrumb">{breadcrumb}</div>
        </div>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Close
        </button>
      </div>

      <label className="form-field" style={{ marginTop: '0.8rem' }}>
        <span>Search</span>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search planner products" />
      </label>

      <div className="planner-product-drawer-meta">
        <span>{products.length} product{products.length === 1 ? '' : 's'}</span>
        <span>Published products assigned to this planner path appear here after ERP validation, staging, and publish.</span>
      </div>

      <div className="planner-product-list">
        {loading ? (
          <div className="muted">Loading cabinet products…</div>
        ) : products.length === 0 ? (
          <div className="muted">
            No published products are available for {breadcrumb} yet. Enable planner support in ERP, choose the matching planner role and planner category path, upload a `.glb`, run validation, move the product to staging, and publish it.
          </div>
        ) : (
          products.map((product) => (
            <button
              key={product.id}
              type="button"
              className="planner-product-card"
              onClick={() => addNodeFromProduct(product)}
            >
              <div className="planner-product-card-media">
                {product.image_url ? <img src={product.image_url} alt={product.name} /> : <span>{product.product_id}</span>}
              </div>
              <div className="planner-product-card-copy">
                <div className="planner-product-card-title-row">
                  <strong>{product.product_id}</strong>
                  {product.product_id === 'G01' && <span className="planner-product-badge">Featured</span>}
                </div>
                <div>{product.name}</div>
                <div className="muted">
                  {product.glb_file_url
                    ? 'Uses native GLB scale'
                    : `${product.width_mm || '—'}×${product.depth_mm || '—'}×${product.height_mm || '—'} mm`}
                </div>
                <div className="planner-product-card-footer">
                  <span>${product.price.toFixed(2)}</span>
                  <span>{product.glb_file_url ? '3D ready' : 'Box placeholder'}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}