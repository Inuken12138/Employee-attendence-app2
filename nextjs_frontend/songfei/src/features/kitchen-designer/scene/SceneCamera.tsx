import { OrbitControls, PerspectiveCamera } from '@react-three/drei';

export default function SceneCamera() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[3.8, 2.8, 4.6]} fov={42} />
      <OrbitControls enableDamping maxPolarAngle={Math.PI / 2.05} minDistance={1.8} maxDistance={10} />
    </>
  );
}
