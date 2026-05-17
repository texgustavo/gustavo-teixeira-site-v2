// HeroShader.tsx — fragment shader fullscreen "Grid Run" (atzedent)
// Estratégia: canvas em position:fixed cobre 100% viewport SEMPRE.
// Hero section vazio 200vh apenas reserva range de scroll.
// JS calcula scrollProgress 0..1; controla shader + fade out quando termina.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { ScrollText } from './ScrollText';

import vertexShader from '../shaders/heroVertex.glsl?raw';
import fragmentShader from '../shaders/heroFragment.glsl?raw';

// ============ ShaderPlane: plano 2x2 + shader ============
function ShaderPlane({
  mouseDeltaRef,
  scrollRef,
}: {
  mouseDeltaRef: React.MutableRefObject<[number, number]>;
  scrollRef: React.MutableRefObject<number>;
}) {
  const materialRef = useRef<THREE.RawShaderMaterial>(null);
  const { size } = useThree();

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(size.width, size.height) },
      move: { value: new THREE.Vector2(0, 0) },
      wheel: { value: new THREE.Vector2(0, 0) },
    }),
    []
  );

  useEffect(() => {
    uniforms.resolution.value.set(size.width, size.height);
  }, [size, uniforms]);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    // Time lento só pra luz orbitar — não dirige o túnel
    uniforms.time.value = clock.getElapsedTime() * 0.08;
    uniforms.move.value.set(mouseDeltaRef.current[0], mouseDeltaRef.current[1]);
    // Multiplicador 22000 — quase original (20000), só pequena amplificação pro scroll ser perceptível.
    uniforms.wheel.value.set(0, scrollRef.current * 22000);
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <rawShaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        glslVersion={THREE.GLSL3}
      />
    </mesh>
  );
}

// ============ HeroShader ============
export default function HeroShader() {
  const sectionRef = useRef<HTMLElement>(null);
  const mouseDeltaRef = useRef<[number, number]>([0, 0]);
  const scrollRef = useRef<number>(0);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(true);

  // Drag pra rotar câmera
  useEffect(() => {
    let dragging = false;
    let lastX = 0, lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.closest('a')) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => { dragging = false; };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      mouseDeltaRef.current = [
        mouseDeltaRef.current[0] + (e.clientX - lastX),
        mouseDeltaRef.current[1] + (lastY - e.clientY),
      ];
      lastX = e.clientX;
      lastY = e.clientY;
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  // Scroll progress
  useEffect(() => {
    const update = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const sectionHeight = sectionRef.current.offsetHeight;
      const scrolled = -rect.top / (sectionHeight - window.innerHeight);
      const clamped = Math.max(0, Math.min(1, scrolled));
      scrollRef.current = clamped;
      setProgress(clamped);
      // Desativa canvas quando passou totalmente da hero (libera performance e cliques)
      setActive(rect.bottom > 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Opacidade do canvas + overlay baseada no progress
  // 0-70%: opacity 1 cheia
  // 70-100%: fade out gradual
  // >100%: opacity 0
  const overlayOpacity = progress < 0.7 ? 1 : Math.max(0, 1 - (progress - 0.7) / 0.3);
  const canvasOpacity = active ? overlayOpacity : 0;

  return (
    <>
      {/* Section vazia ocupa 200vh — só reserva range de scroll, não tem visual próprio */}
      <section ref={sectionRef} className="hero-shader-spacer" />

      {/* Canvas FIXED na viewport — cobre 100% sempre, independente de scroll/sticky */}
      <div
        className="hero-shader-fixed"
        style={{
          opacity: canvasOpacity,
          pointerEvents: active ? 'auto' : 'none',
        }}
      >
        <Canvas
          // key fixa força React a desmontar/remontar SEMPRE em hot reload — evita canvas duplicado de HMR
          key="hero-canvas"
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          dpr={1}
          // resize: { scroll: false } evita re-medir em scroll (que estava bagunçando size)
          resize={{ scroll: false, debounce: 0 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        >
          <ShaderPlane mouseDeltaRef={mouseDeltaRef} scrollRef={scrollRef} />
        </Canvas>

        <div className="hero-shader__overlay">
          {/*
            ScrollText: cada caractere se revela conforme o scroll progride.
            Eyebrow termina de revelar em 25% do scroll. Título começa em 5%, termina em 45%.
            Os dois se sobrepõem um pouco — fica mais cinemático.
          */}
          <ScrollText
            as="span"
            text="Creative Developer · NY"
            progress={progress}
            startAt={0}
            endAt={0.25}
            blurAmount={10}
            className="hero-shader__eyebrow"
          />
          <ScrollText
            as="h1"
            text="Gustavo Teixeira"
            progress={progress}
            startAt={0.05}
            endAt={0.45}
            blurAmount={16}
            className="hero-shader__title"
          />

          {/*
            Subtítulo dividido em 3 ScrollTexts pra preservar o estilo italic+accent do "premium".
            Começa em 0.35 (quando o nome tá ~75% revelado) e termina em 0.60.
            Antes do fade out global (0.70 → 1.0).
          */}
          <p className="hero-shader__sub">
            <ScrollText
              as="span"
              text="Experiências digitais "
              progress={progress}
              startAt={0.35}
              endAt={0.48}
              blurAmount={8}
            />
            <ScrollText
              as="span"
              text="premium"
              progress={progress}
              startAt={0.48}
              endAt={0.52}
              blurAmount={8}
              style={{ fontStyle: 'italic', color: 'var(--accent)' }}
            />
            <ScrollText
              as="span"
              text=" com motion e IA."
              progress={progress}
              startAt={0.52}
              endAt={0.60}
              blurAmount={8}
            />
          </p>
          <div className="hero-shader__hint">role pra entrar · arraste pra explorar</div>
        </div>
      </div>
    </>
  );
}
