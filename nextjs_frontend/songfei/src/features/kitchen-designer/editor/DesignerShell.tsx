'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { hasAuthToken } from '@/lib/auth';

import { createPlannerProjectVersion, createPlannerShareLink, fetchPlannerProject } from '../api/plannerApi';
import { usePlannerStore } from '../state/plannerStore';
import type { PlannerProject } from '../types/planner';
import { buildPlannerSnapshot } from '../utils/projectSnapshot';
import DesignerCanvas from '../scene/DesignerCanvas';
import InspectorPanel from './InspectorPanel';
import PriceBar from './PriceBar';
import ProductCatalogPanel from './ProductCatalogPanel';
import Toolbar from './Toolbar';

export default function DesignerShell({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const setProjectId = usePlannerStore((state) => state.setProjectId);
  const hydrateFromSnapshot = usePlannerStore((state) => state.hydrateFromSnapshot);
  const resetProject = usePlannerStore((state) => state.resetProject);
  const room = usePlannerStore((state) => state.room);
  const nodes = usePlannerStore((state) => state.nodes);
  const [project, setProject] = useState<PlannerProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [sharingProject, setSharingProject] = useState(false);

  const isPersistedProject = !projectId.startsWith('draft-');
  const isAuthenticated = hasAuthToken();
  const total = nodes.reduce((sum, node) => sum + node.price, 0);

  useEffect(() => {
    setProjectId(projectId);
  }, [projectId, setProjectId]);

  useEffect(() => {
    if (!isPersistedProject) {
      setProject(null);
      setStatusMessage('Local draft mode is active. Sign in from the designer home page to sync versions.');
      resetProject();
    }
  }, [isPersistedProject, resetProject]);

  const loadProject = useCallback(async () => {
    if (!isPersistedProject) {
      return;
    }

    setLoadingProject(true);
    try {
      const data = await fetchPlannerProject(projectId);
      setProject(data);
      if (data.current_version?.scene_snapshot) {
        hydrateFromSnapshot(data.current_version.scene_snapshot);
      }
      setStatusMessage(`Loaded ${data.title}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load the saved project.';
      showErrorPopup(message);
    } finally {
      setLoadingProject(false);
    }
  }, [hydrateFromSnapshot, isPersistedProject, projectId, showErrorPopup]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const handleSaveProject = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(`/kitchen-designer/${projectId}`)}`);
      return;
    }

    if (!isPersistedProject) {
      showErrorPopup('Start a saved project from the kitchen designer home page to create synced versions.');
      return;
    }

    setSavingProject(true);
    try {
      const payload = buildPlannerSnapshot({ projectId, room, nodes });
      const response = await createPlannerProjectVersion(projectId, {
        version_name: `Saved ${new Date().toLocaleString()}`,
        scene_snapshot: payload,
        price_snapshot: total,
      });
      setProject(response.project);
      setStatusMessage(`Saved version ${response.version.version_number}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save a project version.';
      showErrorPopup(message);
    } finally {
      setSavingProject(false);
    }
  };

  const handleCreateShareLink = async () => {
    if (!isPersistedProject) {
      showErrorPopup('Only saved projects can generate share links.');
      return;
    }

    setSharingProject(true);
    try {
      const response = await createPlannerShareLink(projectId);
      setSharePath(response.share_path);
      setStatusMessage('Share link is ready.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate a share link.';
      showErrorPopup(message);
    } finally {
      setSharingProject(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="card card-glass" style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div className="pill">Project sync</div>
          <div style={{ marginTop: '0.6rem', fontWeight: 600 }}>
            {isPersistedProject ? project?.title || 'Saved kitchen project' : 'Local draft workspace'}
          </div>
          <div className="muted" style={{ marginTop: '0.35rem' }}>
            {loadingProject
              ? 'Loading saved project…'
              : statusMessage || (project ? `Version ${project.latest_version_number} · ${project.status}` : 'Drafts stay in-browser until you create a saved project.')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {isPersistedProject && (
            <Link className="btn btn-outline" href={`/kitchen-designer/${projectId}/review`}>
              Continue to review
            </Link>
          )}
          {isPersistedProject && (
            <button type="button" className="btn btn-outline" onClick={() => void handleCreateShareLink()} disabled={sharingProject || loadingProject}>
              {sharingProject ? 'Generating link…' : 'Create share link'}
            </button>
          )}
          <Link className="btn btn-outline" href="/kitchen-designer">
            All projects
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => void handleSaveProject()} disabled={savingProject || loadingProject}>
            {savingProject ? 'Saving…' : isPersistedProject ? 'Save version' : 'Save to account'}
          </button>
        </div>
      </div>
      {sharePath && (
        <div className="card" style={{ padding: '1rem 1.2rem' }}>
          <div className="pill">Share link</div>
          <div style={{ marginTop: '0.75rem', wordBreak: 'break-all' }}>
            {typeof window === 'undefined' ? sharePath : `${window.location.origin}${sharePath}`}
          </div>
        </div>
      )}
      <PriceBar />
      <Toolbar />
      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr) 320px', gap: '1.25rem', alignItems: 'start' }}>
        <ProductCatalogPanel />
        <DesignerCanvas />
        <InspectorPanel />
      </div>
    </div>
  );
}
