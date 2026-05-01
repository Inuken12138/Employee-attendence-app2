'use client';

/**
 * Defines the Next.js page module for the /kitchen-designer/share/[token] route.
 *
 * This file wires the route into the App Router tree and hosts the page-level UI or hands control to a feature-owned screen component.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { buildLoginRedirectUrl, hasAuthToken } from '@/lib/auth';
import { duplicatePlannerProject, fetchSharedPlannerProject } from '@/features/kitchen-designer/api/plannerApi';
import type { PlannerSharedProjectResponse } from '@/features/kitchen-designer/types/planner';

/** Renders the shared kitchen project page. */
export default function SharedKitchenProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [sharedProject, setSharedProject] = useState<PlannerSharedProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const loadSharedProject = async () => {
      setLoading(true);
      try {
        const data = await fetchSharedPlannerProject(token);
        setSharedProject(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load the shared project.';
        showErrorPopup(message);
      } finally {
        setLoading(false);
      }
    };

    void loadSharedProject();
  }, [showErrorPopup, token]);

  /** Handles the duplicate interaction for this component. */
  const handleDuplicate = async () => {
    if (!sharedProject) {
      return;
    }

    if (!hasAuthToken()) {
      router.push(buildLoginRedirectUrl(`/kitchen-designer/share/${token}`));
      return;
    }

    setDuplicating(true);
    try {
      const response = await duplicatePlannerProject(sharedProject.project.slug, {
        title: `${sharedProject.project.title} copy`,
        reason: 'customer_copy',
      });
      router.push(`/kitchen-designer/${response.project.slug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to duplicate this shared project.';
      showErrorPopup(message);
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return <div className="muted" style={{ padding: '2rem' }}>Loading shared project…</div>;
  }

  if (!sharedProject) {
    return <div className="muted" style={{ padding: '2rem' }}>Shared project not found.</div>;
  }

  const itemCount = sharedProject.current_version?.scene_snapshot.items.length || 0;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div>
        <div className="pill">Shared kitchen project</div>
        <h1 className="section-title" style={{ marginTop: '1rem' }}>{sharedProject.project.title}</h1>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Read-only share view. Duplicate it into your own account to keep editing.
        </p>
      </div>

      <div className="card card-glass" style={{ padding: '1.2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <span className="pill">Owner: {sharedProject.project.owner_username}</span>
        <span className="pill">Version: {sharedProject.project.latest_version_number}</span>
        <span className="pill">Items: {itemCount}</span>
        <span className="pill">Status: {sharedProject.latest_validation?.status || 'not validated yet'}</span>
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 className="section-title">Snapshot summary</h2>
        <div className="muted" style={{ marginTop: '0.8rem' }}>
          Room {sharedProject.current_version?.scene_snapshot.room.widthMm || 0} × {sharedProject.current_version?.scene_snapshot.room.depthMm || 0} × {sharedProject.current_version?.scene_snapshot.room.heightMm || 0} mm
        </div>
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
          {(sharedProject.current_version?.scene_snapshot.items || []).map((item) => (
            <div key={item.nodeId} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>{item.label}</div>
              <div className="muted">{item.plannerRole || 'module'} · ${item.price.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => void handleDuplicate()} disabled={duplicating}>
          {duplicating ? 'Duplicating…' : 'Duplicate into my account'}
        </button>
        <Link className="btn btn-outline" href="/kitchen-designer">
          Open designer home
        </Link>
      </div>
    </div>
  );
}