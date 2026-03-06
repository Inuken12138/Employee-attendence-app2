'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { buildLoginRedirectUrl, hasAuthToken } from '@/lib/auth';
import { addPlannerProjectToBag, fetchPlannerProjectReview } from '@/features/kitchen-designer/api/plannerApi';
import type { PlannerProjectReviewResponse } from '@/features/kitchen-designer/types/planner';

export default function KitchenDesignerProceedPage() {
  const params = useParams();
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const [review, setReview] = useState<PlannerProjectReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!projectId || projectId.startsWith('draft-')) {
      setLoading(false);
      return;
    }

    if (!hasAuthToken()) {
      router.push(buildLoginRedirectUrl(`/kitchen-designer/${projectId}/proceed`));
      return;
    }

    const loadReview = async () => {
      setLoading(true);
      try {
        const data = await fetchPlannerProjectReview(projectId);
        setReview(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load review summary.';
        showErrorPopup(message);
      } finally {
        setLoading(false);
      }
    };

    void loadReview();
  }, [projectId, router, showErrorPopup]);

  const handleAddToBag = async () => {
    if (!projectId) {
      return;
    }

    if (!hasAuthToken()) {
      router.push(buildLoginRedirectUrl(`/kitchen-designer/${projectId}/proceed`));
      return;
    }

    setAdding(true);
    try {
      await addPlannerProjectToBag(projectId);
      router.push('/cart');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add this kitchen design to the cart.';
      showErrorPopup(message);
    } finally {
      setAdding(false);
    }
  };

  if (!projectId || projectId.startsWith('draft-')) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        <p className="muted">Draft routes cannot proceed to bag yet. Save the project to your account first.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Loading proceed options…</div>;
  }

  if (!review) {
    return <div className="muted" style={{ padding: '2rem' }}>Proceed options are unavailable.</div>;
  }

  const canProceed = review.summary.can_proceed;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div>
        <div className="pill">Proceed</div>
        <h1 className="section-title" style={{ marginTop: '1rem' }}>{review.project.title}</h1>
      </div>

      <div className="card card-glass" style={{ padding: '1.2rem', display: 'grid', gap: '0.6rem' }}>
        <div style={{ fontWeight: 600 }}>Bag-ready summary</div>
        <div className="muted">Items: {review.summary.item_count} · Distinct products: {review.summary.distinct_product_count}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-1)' }}>${review.summary.estimated_total.toFixed(2)}</div>
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 className="section-title">BOM preview</h2>
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
          {review.summary.bom_lines.map((line) => (
            <div key={line.product.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{line.product.name}</div>
                <div className="muted">{line.product.product_id} · qty {line.quantity}</div>
              </div>
              <div>${line.line_total.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link className="btn btn-outline" href={`/kitchen-designer/${projectId}/review`}>
          Back to review
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => void handleAddToBag()} disabled={!canProceed || adding}>
          {adding ? 'Adding…' : 'Add to bag'}
        </button>
      </div>

      {!canProceed && (
        <p className="muted">
          Validation must pass before add-to-bag is available. Re-run review from the validation screen after fixing issues in the editor.
        </p>
      )}
    </div>
  );
}
