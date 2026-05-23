// Preloader.tsx — block transition (skill: gustavo-block-transition)
// Dois cards (loader + hero-stand-in) se empurrando como esteira; hero-panel
// expande fullscreen + fade-out revelando o VideoScrubSection por baixo.
// Ready signal = fonts.ready + window.load + 372 frames pré-carregados.

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const TITLE_1 = 'Gustavo Teixeira';
const TITLE_2 = 'Creative Developer · NY';

const FRAME_COUNT = 372;
const framePath = (i: number) =>
  `/frames/f_${String(i + 1).padStart(4, '0')}.webp`;

interface PreloaderProps {
  onComplete?: () => void;
}

export default function Preloader({ onComplete }: PreloaderProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const heroPanelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const specimenRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const backdrop = backdropRef.current;
    const loader = loaderRef.current;
    const hero = heroPanelRef.current;
    const title = titleRef.current;
    const specimen = specimenRef.current;
    const counter = counterRef.current;
    const numEl = numRef.current;
    if (!backdrop || !loader || !hero || !title || !specimen || !counter || !numEl) return;

    // Reduced motion → pula direto pro site
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCompleteRef.current?.();
      return;
    }

    let killed = false;
    const ctx = gsap.context(() => {
      // ENTRADA — título + counter fade-in sincronizado
      gsap.to([title, counter], {
        opacity: 1,
        duration: 0.7,
        ease: 'power2.out',
        delay: 0.1,
        startAt: { opacity: 0 },
      });

      // === Sinais de "site pronto" ===
      // 1. Fonts ready
      const fonts = document.fonts?.ready ?? Promise.resolve();
      // 2. window load
      const loadEvt =
        document.readyState === 'complete'
          ? Promise.resolve()
          : new Promise<void>((r) =>
              window.addEventListener('load', () => r(), { once: true })
            );
      // 3. Frames do hero pré-carregados
      const framesReady = new Promise<void>((resolve) => {
        let loaded = 0;
        const loadOne = (i: number): Promise<void> =>
          new Promise((res) => {
            const img = new Image();
            img.decoding = 'async';
            const done = () => {
              loaded++;
              res();
            };
            img.onload = done;
            img.onerror = done;
            img.src = framePath(i);
          });
        (async () => {
          const BATCH = 24;
          for (let start = 0; start < FRAME_COUNT; start += BATCH) {
            if (killed) return;
            const end = Math.min(start + BATCH, FRAME_COUNT);
            const promises: Promise<void>[] = [];
            for (let i = start; i < end; i++) promises.push(loadOne(i));
            await Promise.all(promises);
          }
          resolve();
        })();
      });

      // === Counter 0→90 (creep) → 100 (snap) ===
      const counterObj = { v: 0 };
      const render = () => {
        if (numEl) numEl.textContent = String(Math.min(99, Math.floor(counterObj.v)));
      };
      const creep = gsap.to(counterObj, {
        v: 90,
        duration: 2.6,
        ease: 'power2.out',
        onUpdate: render,
      });

      let started = false;
      function go() {
        if (started || killed) return;
        started = true;
        creep.kill();
        gsap.to(counterObj, {
          v: 100,
          duration: 0.55,
          ease: 'power2.inOut',
          onUpdate: render,
          onComplete: () => {
            if (numEl) numEl.textContent = '100';
            runSequence();
          },
        });
      }

      function runSequence() {
        if (!loader || !hero || !title || !specimen || !counter) return;
        const W = window.innerWidth;
        const H = window.innerHeight;
        // Moldura maior → card de ~64% do viewport. Estado 6 (expand pra
        // fullscreen) ganha mais drama porque tem mais espaço pra "abrir".
        const FX = Math.max(64, Math.round(W * 0.18));
        const FY = Math.max(56, Math.round(H * 0.18));
        const GAP = Math.max(24, Math.round(W * 0.03));
        const R = Math.max(20, Math.round(W * 0.014));
        const innerW = W - 2 * FX;
        const innerH = H - 2 * FY;
        const SHIFT = FX - W - GAP; // shift sincronizado pros dois cards

        const tl = gsap.timeline({
          onComplete: () => {
            onCompleteRef.current?.();
          },
        });

        // Estado 2: title sobe e some via mask (overflow:hidden na wrap)
        tl.to(title, { yPercent: -130, duration: 0.65, ease: 'expo.in' }, 0);
        tl.to(
          counter,
          { opacity: 0, yPercent: 30, duration: 0.45, ease: 'power2.in' },
          0.05
        );

        // Estado 3: TITLE_2 revela top→bottom via clip-path
        tl.to(
          specimen,
          {
            clipPath: 'inset(0 0 0% 0)',
            duration: 0.75,
            ease: 'power3.out',
          },
          0.55
        );

        // Estado 4: loader vira card inset (moldura escura aparece)
        tl.to(
          loader,
          {
            top: FY,
            left: FX,
            width: innerW,
            height: innerH,
            borderRadius: R,
            duration: 0.9,
            ease: 'power3.inOut',
          },
          1.7
        );
        tl.to(
          hero,
          {
            top: FY,
            left: W + GAP,
            width: innerW,
            height: innerH,
            borderRadius: R,
            duration: 0.9,
            ease: 'power3.inOut',
          },
          1.7
        );

        // Estado 5: PUSH — ambos cards animam left sincronizado
        tl.to(
          loader,
          { left: FX + SHIFT, duration: 1.25, ease: 'expo.inOut' },
          2.7
        );
        tl.to(
          hero,
          { left: W + GAP + SHIFT, duration: 1.25, ease: 'expo.inOut' },
          2.7
        );

        // Estado 6: hero card expande pra fullscreen + fade-out revelando hero real
        tl.to(
          hero,
          {
            top: 0,
            left: 0,
            width: W,
            height: H,
            borderRadius: 0,
            duration: 0.95,
            ease: 'expo.inOut',
          },
          3.7
        );
        tl.to(
          hero,
          {
            opacity: 0,
            duration: 0.7,
            ease: 'power2.in',
          },
          4.2
        );
        // Backdrop preto fade-out junto com o hero card → revela VideoScrubSection
        tl.to(
          backdrop,
          {
            opacity: 0,
            duration: 0.7,
            ease: 'power2.in',
          },
          4.2
        );
      }

      Promise.all([fonts, loadEvt, framesReady]).then(go);
      const safety = window.setTimeout(go, 8000); // safety net — nunca trava
      return () => window.clearTimeout(safety);
    }, loader);

    return () => {
      killed = true;
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div id="bt-backdrop" ref={backdropRef} aria-hidden="true" />
      <div id="bt-loader-panel" className="bt-card" ref={loaderRef} aria-hidden="true">
        <div className="bt-title-wrap">
          <div className="bt-loader-title" ref={titleRef}>{TITLE_1}</div>
        </div>
        <div className="bt-specimen-wrap">
          <div className="bt-loader-specimen" ref={specimenRef}>{TITLE_2}</div>
        </div>
      </div>
      <div id="bt-hero-panel" className="bt-card" ref={heroPanelRef} aria-hidden="true" />
      <div id="bt-counter" ref={counterRef} aria-hidden="true">
        <span ref={numRef}>0</span>
        <span className="bt-unit">%</span>
      </div>
    </>
  );
}
