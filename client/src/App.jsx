
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import "./App.css";

function Ocean() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.5, 0]}
    >
      <planeGeometry args={[200, 200, 50, 50]} />
      <meshStandardMaterial
        color="#075985"
        roughness={0.3}
        metalness={0.3}
      />
    </mesh>
  );
}

function Ship() {
  return (
    <group position={[0, 0, 0]}>
      {/* Main ship hull */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[3, 0.45, 0.8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>

      {/* Upper deck */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.7, 0.35, 0.65]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>

      {/* Command bridge */}
      <mesh position={[0.25, 0.7, 0]}>
        <boxGeometry args={[0.7, 0.45, 0.5]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={1.2} />

      <directionalLight
        position={[5, 10, 5]}
        intensity={2}
      />

      <Ocean />
      <Ship />

      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}

export default function App() {
  return (
    <main className="app">
      <header className="topbar">
        <div className="logo">BATTLE<span> OCEAN</span></div>
        <div className="status">NAVAL COMBAT SYSTEM</div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">YOUR MISSION STARTS HERE</p>
          <h1>COMMAND THE<br />BATTLEFIELD.</h1>
          <p className="description">
            Choose your fleet, target enemy ships and
            dominate the ocean.
          </p>
          <button
            className="start-button"
            onClick={() => alert("Next: game mode selection")}
          >
            INITIALIZE MISSION
          </button>
        </div>

        <div className="scene">
          <Canvas camera={{ position: [5, 6, 8], fov: 45 }}>
            <Scene />
          </Canvas>
          <div className="scene-label">3D NAVAL PREVIEW</div>
        </div>
      </section>
    </main>
  );
}
