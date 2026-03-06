'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { buildLoginRedirectUrl, hasAuthToken } from '@/lib/auth';
import { validatePlannerProject } from '@/features/kitchen-designer/api/plannerApi';
import type { PlannerProjectValidationResponse } from '@/features/kitchen-designer/types/planner';

export default function KitchenDesignerReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const [result, setResult] = useState<PlannerProjectValidationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || projectId.startsWith('draft-')) {
      setLoading(false);
      return;
    }

    if (!hasAuthToken()) {
      router.push(buildLoginRedirectUrl(`/kitchen-designer/${projectId}/review`));
      return;
    }

    const runValidation = async () => {
      setLoading(true);
      try {
        const data = await validatePlannerProject(projectId);
        setResult(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to validate this kitchen project.';
        showErrorPopup(message);
      } finally {
        setLoading(false);
      }
    };

    void runValidation();
  }, [projectId, router, showErrorPopup]);

  if (!projectId || projectId.startsWith('draft-')) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="pill">Review requires a saved project</div>
        <p className="muted" style={{ marginTop: '1rem' }}>
          Draft-only routes can still edit the scene, but validation persistence starts after the project is synced to your account.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <Link className="btn btn-outline" href="/kitchen-designer">
            Back to kitchen designer home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Running validation…</div>;
  }

  if (!result) {
    return <div className="muted" style={{ padding: '2rem' }}>Validation data is unavailable.</div>;
  }

  const validation = result.validation;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div className="pill">Validation review</div>
          <h1 className="section-title" style={{ marginTop: '1rem' }}>{result.project.title}</h1>
        </div>
        <Link className="btn btn-outline" href={`/kitchen-designer/${projectId}`}>
          Back to editor
        </Link>
      </div>

      <div className="card card-glass" style={{ padding: '1.2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <span className="pill">Status: {validation.status}</span>
        <span className="pill">Hard issues: {validation.hard_issue_count}</span>
        <span className="pill">Soft issues: {validation.soft_issue_count}</span>
      </div>

      {validation.issues.length === 0 ? (
        <div className="card" style={{ padding: '1.5rem' }}>
          <p className="muted">No issues found. This project can proceed to add-to-bag.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {validation.issues.map((issue) => (
            <div key={`${issue.code}-${issue.nodeId || 'project'}`} className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600 }}>{issue.code}</div>
                <span className="pill">{issue.severity}</span>
              </div>
              <p className="muted" style={{ marginTop: '0.6rem' }}>{issue.message}</p>
              {issue.suggestedFixes.length > 0 && (
                <ul style={{ marginTop: '0.75rem', paddingLeft: '1.2rem' }}>
                  {issue.suggestedFixes.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link className="btn btn-outline" href={`/kitchen-designer/${projectId}`}>
          Fix in editor
        </Link>
        {validation.status === 'passed' && (
          <Link className="btn btn-primary" href={`/kitchen-designer/${projectId}/proceed`}>
            Proceed to bag options
          </Link>
        )}
      </div>
    </div>
  );
}
