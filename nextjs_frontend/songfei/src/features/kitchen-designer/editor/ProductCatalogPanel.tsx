'use client';

import { useEffect, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';

import { fetchPlannerCatalogProducts } from '../api/plannerApi';
import { usePlannerStore } from '../state/plannerStore';
import type { PlannerCatalogProduct } from '../types/planner';

export default function ProductCatalogPanel() {
  const { showErrorPopup } = useErrorPopup();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<PlannerCatalogProduct[]>([]);
  const setCatalog = usePlannerStore((state) => state.setCatalog);
  const addNodeFromProduct = usePlannerStore((state) => state.addNodeFromProduct);

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        const catalogProducts = await fetchPlannerCatalogProducts();
        setProducts(catalogProducts);
        setCatalog(catalogProducts);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load planner catalog.';
        showErrorPopup(message);
      } finally {
        setLoading(false);
      }
    };

    void loadProducts();
  }, [setCatalog, showErrorPopup]);

  return (
    <div className="card" style={{ padding: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <div className="pill">Published catalog</div>
          <h2 className="section-title" style={{ marginTop: '0.9rem', marginBottom: '0.3rem' }}>Planner-ready modules</h2>
        </div>
        <span className="muted">{products.length} items</span>
      </div>

      <div style={{ display: 'grid', gap: '0.8rem', marginTop: '1rem' }}>
        {loading ? (
          <div className="muted">Loading planner products…</div>
        ) : products.length === 0 ? (
          <div className="muted">No published planner products yet. Publish products from ERP designer settings first.</div>
        ) : (
          products.map((product) => (
            <button
              key={product.id}
              type="button"
              className="btn btn-outline"
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.95rem 1rem',
                borderRadius: 'var(--radius-md)',
              }}
              onClick={() => addNodeFromProduct(product)}
            >
              <span style={{ display: 'grid', textAlign: 'left' }}>
                <span style={{ fontWeight: 600 }}>{product.name}</span>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {product.planner_role || 'module'} · {product.width_mm || '—'} × {product.depth_mm || '—'} × {product.height_mm || '—'} mm
                </span>
              </span>
              <span style={{ color: 'var(--accent-1)' }}>${product.price.toFixed(2)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
