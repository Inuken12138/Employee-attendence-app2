/**
 * 3D scene component for the kitchen designer.
 *
 * These files turn planner state into visual geometry, camera behavior, and lighting inside the design canvas.
 */
export default function SceneLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#ddd5c8', 1.15]} />
      <ambientLight intensity={0.45} color="#f7f4ee" />
      <directionalLight
        position={[5.5, 7.5, 4.5]}
        intensity={1.9}
        color="#fff8ee"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00008}
      />
      <directionalLight position={[-4.5, 4.5, -2.5]} intensity={0.48} color="#dfe9f6" />
    </>
  );
}
