import { usePlannerStore } from '../state/plannerStore';

const movementStepMm = 50;

export default function Toolbar() {
  const nudgeSelectedNode = usePlannerStore((state) => state.nudgeSelectedNode);

  return (
    <div className="card card-glass" style={{ padding: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
      <span className="pill">Prototype controls</span>
      <button type="button" className="btn btn-outline" onClick={() => nudgeSelectedNode('x', -movementStepMm)}>
        Move left
      </button>
      <button type="button" className="btn btn-outline" onClick={() => nudgeSelectedNode('x', movementStepMm)}>
        Move right
      </button>
      <button type="button" className="btn btn-outline" onClick={() => nudgeSelectedNode('z', -movementStepMm)}>
        Push back
      </button>
      <button type="button" className="btn btn-outline" onClick={() => nudgeSelectedNode('z', movementStepMm)}>
        Pull forward
      </button>
    </div>
  );
}
