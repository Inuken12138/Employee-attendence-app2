'use client';

interface RoomShapePickerProps {
  open: boolean;
  onClose: () => void;
  onSelectRectangle: () => void;
}

export default function RoomShapePicker({ open, onClose, onSelectRectangle }: RoomShapePickerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="planner-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="planner-modal card" role="dialog" aria-modal="true" aria-label="Room shape picker" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          <div className="pill">Room shape</div>
          <h2 className="section-title" style={{ margin: 0 }}>Choose the base room footprint</h2>
          <p className="muted" style={{ margin: 0 }}>
            The first slice supports a single shape with editable wall lengths and a live 3D room preview.
          </p>
        </div>
        <button type="button" className="planner-shape-option" onClick={onSelectRectangle}>
          <span className="planner-shape-option-preview" aria-hidden="true">
            <span className="planner-shape-option-rect" />
          </span>
          <span className="planner-shape-option-copy">
            <strong>Rectangular room</strong>
            <span>Start from a four-wall footprint and refine each side from the 2D editor.</span>
          </span>
        </button>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}