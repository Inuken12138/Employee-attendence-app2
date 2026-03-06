'use client';

import { usePlannerStore } from '../state/plannerStore';

export default function InspectorPanel() {
  const room = usePlannerStore((state) => state.room);
  const selectedNodeId = usePlannerStore((state) => state.selectedNodeId);
  const selectedNode = usePlannerStore((state) => state.nodes.find((node) => node.nodeId === selectedNodeId) || null);
  const updateRoom = usePlannerStore((state) => state.updateRoom);

  return (
    <div className="card" style={{ padding: '1.2rem', display: 'grid', gap: '1rem' }}>
      <div>
        <div className="pill">Inspector</div>
        <h2 className="section-title" style={{ marginTop: '0.9rem' }}>Room + selection</h2>
      </div>

      <div className="grid-3">
        <label className="form-field">
          <span>Room width (mm)</span>
          <input className="input" value={room.widthMm} onChange={(event) => updateRoom({ widthMm: Number(event.target.value) || 0 })} />
        </label>
        <label className="form-field">
          <span>Room depth (mm)</span>
          <input className="input" value={room.depthMm} onChange={(event) => updateRoom({ depthMm: Number(event.target.value) || 0 })} />
        </label>
        <label className="form-field">
          <span>Ceiling height (mm)</span>
          <input className="input" value={room.heightMm} onChange={(event) => updateRoom({ heightMm: Number(event.target.value) || 0 })} />
        </label>
      </div>

      {!selectedNode ? (
        <div className="muted">Select a cabinet block in the scene to inspect it.</div>
      ) : (
        <div style={{ border: '1px solid var(--edge)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
          <div style={{ fontWeight: 600 }}>{selectedNode.label}</div>
          <div className="muted" style={{ marginTop: '0.45rem' }}>
            {selectedNode.plannerRole} · {selectedNode.widthMm} × {selectedNode.depthMm} × {selectedNode.heightMm} mm
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '0.9rem' }}>
            <div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>X</div>
              <div>{Math.round(selectedNode.position.x)} mm</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Y</div>
              <div>{Math.round(selectedNode.position.y)} mm</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Z</div>
              <div>{Math.round(selectedNode.position.z)} mm</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
