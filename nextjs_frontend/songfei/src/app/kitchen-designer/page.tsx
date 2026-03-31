'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';

import { createPlannerProject, listPlannerProjects } from '@/features/kitchen-designer/api/plannerApi';
import type { PlannerProject } from '@/features/kitchen-designer/types/planner';
import { createEmptyPlannerSnapshot } from '@/features/kitchen-designer/utils/projectSnapshot';

export default function KitchenDesignerLandingPage() {
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const [projects, setProjects] = useState<PlannerProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const isAuthenticated = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return Boolean(window.localStorage.getItem('token'));
  }, []);

  const loadProjects = useCallback(async () => {
    if (!isAuthenticated) {
      setProjects([]);
      return;
    }

    setLoadingProjects(true);
    try {
      const data = await listPlannerProjects();
      setProjects(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load saved projects.';
      showErrorPopup(message);
    } finally {
      setLoadingProjects(false);
    }
  }, [isAuthenticated, showErrorPopup]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleStart = async () => {
    if (!isAuthenticated) {
      const projectId = `draft-${Date.now()}`;
      router.push(`/kitchen-designer/${projectId}`);
      return;
    }

    setCreatingProject(true);
    try {
      const now = new Date();
      const project = await createPlannerProject({
        title: `Kitchen Project ${now.toLocaleDateString()}`,
        scene_snapshot: createEmptyPlannerSnapshot(),
        version_name: 'Initial version',
      });
      router.push(`/kitchen-designer/${project.slug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create a new kitchen project.';
      showErrorPopup(message);
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <section className="hero">
        <div>
          <div className="kicker">Kitchen designer prototype</div>
          <h1 className="hero-title">Define the room first. Lock the shell. Bring cabinets in after that.</h1>
          <p className="hero-copy">
            The current vertical slice implements the room-definition journey: 2D floor-plan editing, live millimeter controls, a Three.js room preview, and the final review shell that later planner outputs will use.
          </p>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => void handleStart()} disabled={creatingProject}>
              {creatingProject ? 'Opening project…' : isAuthenticated ? 'Start a saved project' : 'Start a draft design'}
            </button>
            <Link className="btn btn-outline" href="/erp/products">
              Open ERP products
            </Link>
            {!isAuthenticated && (
              <Link className="btn btn-outline" href="/login?redirect=%2Fkitchen-designer">
                Sign in to save projects
              </Link>
            )}
          </div>
        </div>

        <div className="card card-glass" style={{ padding: '1.8rem' }}>
          <div className="pill">Current vertical slice</div>
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1.2rem' }}>
            {[
              'Stage header: Define your space → Make it yours → Make it happen',
              'SVG-based wall editing with exact millimeter entry',
              'React Three Fiber room preview driven by the same store',
              'Placeholder review shell ready for future elevations and proceed actions',
            ].map((item) => (
              <div key={item} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent-2)' }}>✦</span>
                <span className="muted">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div className="pill">Project persistence</div>
            <h2 className="section-title" style={{ marginTop: '0.9rem' }}>Saved kitchen projects</h2>
          </div>
          {isAuthenticated ? (
            <span className="muted">{projects.length} saved</span>
          ) : (
            <Link className="btn btn-outline" href="/login?redirect=%2Fkitchen-designer">
              Sign in to unlock syncing
            </Link>
          )}
        </div>

        {!isAuthenticated ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Draft mode works without an account, but saved project history, versioning, and resume flows require sign-in.
          </p>
        ) : loadingProjects ? (
          <p className="muted" style={{ marginTop: '1rem' }}>Loading saved projects…</p>
        ) : projects.length === 0 ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            No synced projects yet. Start a saved project to create the first editable kitchen workspace.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem', marginTop: '1rem' }}>
            {projects.map((project) => (
              <Link
                key={project.slug}
                href={`/kitchen-designer/${project.slug}`}
                className="card"
                style={{
                  padding: '1rem 1.1rem',
                  textDecoration: 'none',
                  color: 'inherit',
                  border: '1px solid var(--edge)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{project.title}</div>
                    <div className="muted" style={{ marginTop: '0.35rem' }}>
                      {project.status} · version {project.latest_version_number} · updated {new Date(project.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ color: 'var(--accent-1)', fontWeight: 600 }}>${project.estimated_price.toFixed(2)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
