export default function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-4, 5, -3]} intensity={0.35} />
    </>
  );
}
