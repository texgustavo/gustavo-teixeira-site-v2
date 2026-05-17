import { Canvas } from '@react-three/fiber';
import { Environment, Text3D, Center, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ============ Texto 3D "GUSTAVO" em chrome iridescente ============
function GustavoText() {
  const meshRef = useRef<THREE.Mesh>(null);

  // Rotação lenta contínua pro chrome brilhar em ângulos diferentes
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.3) * 0.15;
    }
  });

  return (
    <Center>
      <Text3D
        ref={meshRef}
        // Fonte JSON pública (Helvetiker Bold) — fonte default do Three.js
        // Pra usar Bricolage Grotesque depois: converter via https://gero3.github.io/facetype.js/
        font="https://threejs.org/examples/fonts/helvetiker_bold.typeface.json"
        size={1.8}
        height={0.4}              // profundidade da extrusão
        curveSegments={32}        // qualidade das curvas
        bevelEnabled
        bevelThickness={0.04}
        bevelSize={0.03}
        bevelOffset={0}
        bevelSegments={8}
      >
        GUSTAVO
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={1}
          roughness={0.05}
          iridescence={1}
          iridescenceIOR={2}
          iridescenceThicknessRange={[100, 400]}
          envMapIntensity={1.5}
        />
      </Text3D>
    </Center>
  );
}

// ============ Scene completa: Canvas + tudo dentro ============
export default function Hero3D() {
  return (
    <section
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        background: '#0d0d0d',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        {/* Background preto absoluto */}
        <color attach="background" args={['#0d0d0d']} />

        {/* Ambiente HDR — essencial pro chrome refletir algo */}
        <Environment preset="studio" />

        {/* Luz extra pra realce */}
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00ff88" />

        {/* O texto 3D */}
        <GustavoText />

        {/* Controles temporários pra você girar manualmente e ver de todos os ângulos.
            REMOVER quando estiver feliz com a cena. */}
        <OrbitControls enableZoom={false} enablePan={false} />

        {/* Post-processing: bloom + chromatic aberration suave */}
        <EffectComposer>
          <Bloom
            intensity={0.4}
            luminanceThreshold={0.5}
            luminanceSmoothing={0.9}
          />
          <ChromaticAberration
            offset={new THREE.Vector2(0.0008, 0.0008)}
            blendFunction={BlendFunction.NORMAL}
            radialModulation={false}
            modulationOffset={0}
          />
        </EffectComposer>
      </Canvas>

      {/* Eyebrow texto HTML sobre o canvas (z-index acima) */}
      <div className="hero-overlay">
        <span className="hero-eyebrow">Creative Developer · NY</span>
      </div>
    </section>
  );
}
