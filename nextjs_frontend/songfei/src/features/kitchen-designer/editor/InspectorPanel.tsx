'use client';

/**
 * Editor-side kitchen designer component.
 *
 * Files in this folder render the planner workspace controls that let users inspect, edit, and price a room design.
 */

import { usePlannerStore } from '../state/plannerStore';

/** Renders the inspector panel component used by this module. */
export default function InspectorPanel() {
  const room = usePlannerStore((state) => state.room);
  const selectedNodeId = usePlannerStore((state) => state.selectedNodeId);
  const selectedNode = usePlannerStore((state) => state.nodes.find((node) => node.nodeId === selectedNodeId) || null);
  const updateRoom = usePlannerStore((state) => state.updateRoom);
  const assemblySlots = selectedNode?.composite?.slots || [];
  const configuredSlots = assemblySlots.filter((slot) => slot.items.some((item) => !item.isRemoved)).length;

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
            {selectedNode.nodeKind === 'assembly' ? 'assembly template' : selectedNode.plannerRole} · {selectedNode.widthMm} × {selectedNode.depthMm} × {selectedNode.heightMm} mm
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
          {selectedNode.nodeKind === 'assembly' && selectedNode.composite && (
            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
              <div className="muted">
                {configuredSlots} of {assemblySlots.length} slots currently populated in the saved assembly state.
              </div>
              <div style={{ display: 'grid', gap: '0.55rem' }}>
                {assemblySlots.map((slot) => {
                  const activeItems = slot.items.filter((item) => !item.isRemoved);

                  return (
                    <div key={slot.slotKey} style={{ border: '1px solid var(--edge)', borderRadius: '0.85rem', padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <strong>{slot.label}</strong>
                        <span className="muted">{slot.slotKey}</span>
                      </div>
                      <div className="muted" style={{ marginTop: '0.35rem' }}>
                        {activeItems.length > 0
                          ? activeItems.map((item) => item.productCode || item.label).join(', ')
                          : 'Empty'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
