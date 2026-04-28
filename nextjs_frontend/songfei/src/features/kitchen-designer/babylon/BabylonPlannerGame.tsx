'use client';

import { useEffect, useRef } from 'react';

import { usePlannerStore } from '../state/plannerStore';
import type { PlannerRoom } from '../types/planner';
import { createPlannerRuntime } from './createPlannerRuntime';

interface BabylonPlannerGameProps {
  room: PlannerRoom;
  compact?: boolean;
}

export default function BabylonPlannerGame({ room, compact = false }: BabylonPlannerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<Awaited<ReturnType<typeof createPlannerRuntime>> | null>(null);
  const nodes = usePlannerStore((state) => state.nodes);
  const selectedNodeId = usePlannerStore((state) => state.selectedNodeId);
  const interactionMode = usePlannerStore((state) => state.interactionMode);
  const selectNode = usePlannerStore((state) => state.selectNode);
  const removeNode = usePlannerStore((state) => state.removeNode);
  const setInteractionMode = usePlannerStore((state) => state.setInteractionMode);
  const updateNodePosition = usePlannerStore((state) => state.updateNodePosition);
  const updateNodeRotation = usePlannerStore((state) => state.updateNodeRotation);
  const latestStateRef = useRef({ room, nodes, selectedNodeId, interactionMode });

  latestStateRef.current = { room, nodes, selectedNodeId, interactionMode };

  useEffect(() => {
    let disposed = false;

    async function setupRuntime() {
      if (!canvasRef.current) {
        return;
      }

      const runtime = await createPlannerRuntime({
        canvas: canvasRef.current,
        compact,
        callbacks: {
          onSelectNode: selectNode,
          onDeleteNode: removeNode,
          onSetInteractionMode: setInteractionMode,
          onUpdateNodePosition: updateNodePosition,
          onUpdateNodeRotation: updateNodeRotation,
        },
      });

      if (disposed) {
        runtime.dispose();
        return;
      }

      runtimeRef.current = runtime;
      runtime.sync(latestStateRef.current);
    }

    void setupRuntime();

    return () => {
      disposed = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [compact, removeNode, selectNode, setInteractionMode, updateNodePosition, updateNodeRotation]);

  useEffect(() => {
    runtimeRef.current?.sync({ room, nodes, selectedNodeId, interactionMode });
  }, [interactionMode, nodes, room, selectedNodeId]);

  return <canvas ref={canvasRef} className="planner-scene-canvas" aria-label="Kitchen planner 3D scene" />;
}