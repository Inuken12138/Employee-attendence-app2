'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { hasAuthToken } from '@/lib/auth';

import {
  canNavigateToPlannerStage,
  getNextPlannerStage,
  isPlannerRoomValid,
} from '../lib/measurementMath';
import { formatPlannerBreadcrumb } from '../lib/plannerTaxonomy';
import { createPlannerProjectVersion, createPlannerShareLink, fetchPlannerProject } from '../api/plannerApi';
import { usePlannerStore } from '../state/plannerStore';
import type { PlannerProject, PlannerTaxonomyPath } from '../types/planner';
import { buildPlannerSnapshot } from '../utils/projectSnapshot';
import FloorPlanEditor2D from '../components/FloorPlanEditor2D';
import MakeItYoursToolbar from '../components/MakeItYoursToolbar';
import PlannerHeader from '../components/PlannerHeader';
import PlannerProductDrawer from '../components/PlannerProductDrawer';
import PlannerReviewShell from '../components/PlannerReviewShell';
import PlannerSubheader from '../components/PlannerSubheader';
import RoomScene3D from '../components/RoomScene3D';
import RoomShapePicker from '../components/RoomShapePicker';

export default function DesignerShell({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const setProjectId = usePlannerStore((state) => state.setProjectId);
  const stage = usePlannerStore((state) => state.stage);
  const setStage = usePlannerStore((state) => state.setStage);
  const initializeRoomShape = usePlannerStore((state) => state.initializeRoomShape);
  const hydrateFromSnapshot = usePlannerStore((state) => state.hydrateFromSnapshot);
  const resetProject = usePlannerStore((state) => state.resetProject);
  const room = usePlannerStore((state) => state.room);
  const activeWall = usePlannerStore((state) => state.activeWall);
  const editingMeasurement = usePlannerStore((state) => state.editingMeasurement);
  const setActiveWall = usePlannerStore((state) => state.setActiveWall);
  const setEditingMeasurement = usePlannerStore((state) => state.setEditingMeasurement);
  const updateWallMeasurement = usePlannerStore((state) => state.updateWallMeasurement);
  const updateRoomHeight = usePlannerStore((state) => state.updateRoomHeight);
  const nodes = usePlannerStore((state) => state.nodes);
  const [project, setProject] = useState<PlannerProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [sharingProject, setSharingProject] = useState(false);
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  const [cabinetMenuOpen, setCabinetMenuOpen] = useState(false);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [activeCatalogPath, setActiveCatalogPath] = useState<PlannerTaxonomyPath | null>(null);

  const isPersistedProject = !projectId.startsWith('draft-');
  const isAuthenticated = hasAuthToken();
  const total = nodes.reduce((sum, node) => sum + node.price, 0);
  const canContinue = isPlannerRoomValid(room);
  const selectedCatalogBreadcrumb = activeCatalogPath
    ? formatPlannerBreadcrumb(activeCatalogPath)
    : 'Cabinets / Choose a cabinet type';

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

  const handleStageSelection = (nextStage: typeof stage) => {
    if (!canNavigateToPlannerStage(stage, nextStage, room)) {
      showErrorPopup('Complete the room dimensions before moving forward in the planner flow.');
      return;
    }

    setStage(nextStage);
  };

  const handleContinue = () => {
    const nextStage = getNextPlannerStage(stage);

    if (!nextStage) {
      return;
    }

    handleStageSelection(nextStage);
  };

  const renderStageContent = () => {
    if (stage === 'define-space') {
      return (
        <div className="planner-stage-layout">
          <FloorPlanEditor2D
            room={room}
            activeWall={activeWall}
            editingMeasurement={editingMeasurement}
            onActiveWallChange={setActiveWall}
            onEditingMeasurementChange={setEditingMeasurement}
            onWallChange={updateWallMeasurement}
          />
          <div className="planner-stage-sidebar">
            <div className="card card-glass">
              <div className="pill">Room snapshot</div>
              <div className="planner-sidebar-copy">
                The room starts from a four-wall shell with exact millimeter editing. The 3D view will reuse this same store without a translation step.
              </div>
              <div className="planner-room-dimension-list">
                <span>Top wall: {room.topMm} mm</span>
                <span>Right wall: {room.rightMm} mm</span>
                <span>Bottom wall: {room.bottomMm} mm</span>
                <span>Left wall: {room.leftMm} mm</span>
                <span>Ceiling: {room.heightMm} mm</span>
              </div>
            </div>
            <div className="card">
              <div className="planner-sidebar-title">What this slice covers</div>
              <div className="planner-sidebar-copy">
                2D floor-plan editing, stage navigation, and a persistent planner shell are now implemented. Doors, windows, cabinet placement, and rule validation stay in the next layer.
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (stage === 'make-it-yours') {
      return (
        <>
          <MakeItYoursToolbar
            menuOpen={cabinetMenuOpen}
            selectedPath={activeCatalogPath}
            onToggleCabinets={() => setCabinetMenuOpen((current) => !current)}
            onChoosePath={(path) => {
              setActiveCatalogPath(path);
              setCabinetMenuOpen(false);
              setProductDrawerOpen(true);
            }}
          />
          <div className={`planner-stage-layout planner-stage-layout-room${productDrawerOpen ? ' planner-stage-layout-room-with-drawer' : ''}`}>
            <PlannerProductDrawer
              open={productDrawerOpen}
              selectedPath={activeCatalogPath}
              onClose={() => setProductDrawerOpen(false)}
            />
            <RoomScene3D room={room} />
            <div className="planner-stage-sidebar">
              <div className="card card-glass">
                <div className="pill">Placement controls</div>
                <div className="planner-sidebar-title">Cabinet placement is back in the room stage</div>
                <div className="planner-sidebar-copy">
                  Start with <strong>Cabinets</strong>, then choose a real planner path such as <strong>Base cabinets / With door</strong> or <strong>Base cabinets / For corner</strong>. Published planner products appear in the left drawer for the selected path and can be inserted into the scene.
                </div>
              </div>
              <div className="card">
                <div className="planner-room-dimension-list">
                  <span>Selected path: {selectedCatalogBreadcrumb}</span>
                  <span>Envelope width: {room.widthMm} mm</span>
                  <span>Envelope depth: {room.depthMm} mm</span>
                  <span>Ceiling height: {room.heightMm} mm</span>
                  <span>Snap grid: 50 mm</span>
                  <span>Wall snap threshold: 140 mm</span>
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }

    return (
      <PlannerReviewShell
        projectId={projectId}
        room={room}
        estimatedTotal={total}
        isPersistedProject={isPersistedProject}
      />
    );
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
      <PlannerHeader
        stage={stage}
        onSelectStage={handleStageSelection}
        canSelectStage={(targetStage) => canNavigateToPlannerStage(stage, targetStage, room)}
      />
      <PlannerSubheader
        stage={stage}
        room={room}
        estimatedTotal={total}
        canContinue={canContinue && getNextPlannerStage(stage) !== null}
        onContinue={handleContinue}
        onOpenShapePicker={() => setShapePickerOpen(true)}
        onHeightChange={updateRoomHeight}
      />
      {renderStageContent()}
      <RoomShapePicker
        open={shapePickerOpen}
        onClose={() => setShapePickerOpen(false)}
        onSelectRectangle={() => {
          initializeRoomShape('rectangle');
          setShapePickerOpen(false);
          setStatusMessage('Rectangular room initialized with the default 4000 mm × 4000 mm × 2500 mm seed.');
        }}
      />
    </div>
  );
}
