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

// ============ LabShader ============
// Sessão fullscreen de demonstração técnica — fragment shader raymarching
// adaptado de "Grid Run" do atzedent (shadertoy / codepen).
// Mesma mecânica do antigo HeroShader: 200vh spacer + canvas fixed + scroll progress manual.
export default function LabShader() {
  const sectionRef = useRef<HTMLElement>(null);
  const mouseDeltaRef = useRef<[number, number]>([0, 0]);
  const scrollRef = useRef<number>(0);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(true);

  // Drag pra rotar câmera — só registra handlers quando a sessão tá ATIVA na viewport.
  // Evita capturar clicks no resto do site + reduz overhead quando shader não tá visível.
  useEffect(() => {
    if (!active) return;

    let dragging = false;
    let lastX = 0, lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // Só ativa drag se clicou DENTRO do canvas fixed, ignorando links
      if (target.tagName === 'A' || target.closest('a')) return;
      if (!target.closest('.hero-shader-fixed')) return;
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
  }, [active]);

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
      // Canvas só ativo quando a sessão tá INTERSECTANDO a viewport
      // (antes era rect.bottom > 0, mas isso ficava true quando a sessão tava abaixo da viewport também)
      setActive(rect.top < window.innerHeight && rect.bottom > 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Curva de opacidade — fade-in suave na entrada + hold + fade-out na saída
  //   0    → 0.08 : fade-in
  //   0.08 → 0.78 : hold em opacity 1 (imersivo)
  //   0.78 → 1.00 : fade-out
  const FADE_IN_END = 0.08;
  const FADE_OUT_START = 0.78;
  const overlayOpacity =
    progress < FADE_IN_END
      ? progress / FADE_IN_END
      : progress < FADE_OUT_START
        ? 1
        : Math.max(0, 1 - (progress - FADE_OUT_START) / (1 - FADE_OUT_START));
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
          {/* Reframe: agora é sessão de demonstração técnica, não Hero */}
          <ScrollText
            as="span"
            text="Demo · GLSL"
            progress={progress}
            startAt={0}
            endAt={0.25}
            blurAmount={10}
            className="hero-shader__eyebrow"
          />
          <ScrollText
            as="h2"
            text="Fragment shader"
            progress={progress}
            startAt={0.05}
            endAt={0.45}
            blurAmount={16}
            className="hero-shader__title"
          />

          <p className="hero-shader__sub">
            <ScrollText
              as="span"
              text="Túnel infinito renderizado em "
              progress={progress}
              startAt={0.35}
              endAt={0.48}
              blurAmount={8}
            />
            <ScrollText
              as="span"
              text="tempo real"
              progress={progress}
              startAt={0.48}
              endAt={0.52}
              blurAmount={8}
              style={{ fontStyle: 'italic', color: 'var(--accent)' }}
            />
            <ScrollText
              as="span"
              text=" via WebGL — inspirado em atzedent."
              progress={progress}
              startAt={0.52}
              endAt={0.60}
              blurAmount={8}
            />
          </p>
          <div className="hero-shader__hint">role pra continuar · arraste no desktop</div>
        </div>
      </div>
    </>
  );
}
