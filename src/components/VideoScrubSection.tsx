// VideoScrubSection.tsx — sessão 2 do v2
// Image sequence (372 frames, 24fps, 15.5s) renderizado em <canvas>.
// - Idle: rAF loop a 24fps (looping infinito como a Hero) SÓ quando a sessão tá em view.
// - Scrollando: pausa loop, scroll progress dita o frame (scrub liso via scrub: 0.4).
// - Após ~250ms sem scroll: retoma loop de onde parou.
// - Cues: char-by-char no título + word-by-word no body, animação trigger-baseada.

import { Fragment, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 372;
const FPS = 24;
const FRAME_INTERVAL = 1000 / FPS;
const SCROLL_FACTOR = 1.4;
const FRAME_W = 2560;
const FRAME_H = 1440;

const framePath = (i: number) =>
  `/frames/f_${String(i + 1).padStart(4, '0')}.webp`;

type Cue = {
  startFrame: number;
  endFrame: number;
  eyebrow: string;
  title: string;
  body: string;
  stack?: string[]; // opcional — lista compacta de stack chips separados por ·
};

// Cues alinhadas com as fronteiras reais dos clipes no vídeo concatenado:
//   c1 sunset visível: 0-84   | xfade1: 84-96   (0→3.5s | 3.5-4s)
//   c2 aerial day:    96-168  | xfade2: 168-180 (4-7s   | 7-7.5s)
//   c3 bridge:        180-276 | xfade3: 276-288 (7.5-11.5s | 11.5-12s)
//   c4 night:         288-372 (12-15.5s)
// Cada cue cobre todo o range visível do seu clipe — troca acontece exatamente no xfade.
const CUES: Cue[] = [
  {
    startFrame: 8,
    endFrame: 84,
    eyebrow: '01',
    title: 'Gustavo Teixeira',
    body: 'Brasileiro baseado em NY, trabalhando com clientes globais.',
  },
  {
    startFrame: 96,
    endFrame: 168,
    eyebrow: '02',
    title: 'Creative developer',
    body: 'Front-end premium',
    stack: ['Three.js', 'R3F', 'GSAP', 'Shaders', 'Next.js'],
  },
  {
    startFrame: 180,
    endFrame: 276,
    eyebrow: '03',
    title: 'Performance e identidade',
    body: 'Sites rápidos e memoráveis pra marcas que precisam disso.',
  },
  {
    startFrame: 288,
    endFrame: 368,
    eyebrow: '04',
    title: 'Experiências digitais com IA',
    body: 'Pra marcas que querem se diferenciar visual e tecnicamente.',
  },
];

// ---------- Helpers de render de char/word ----------
const renderTitle = (text: string) => {
  const words = text.split(' ');
  return words.map((word, wi) => (
    <span className="word-group" key={wi}>
      {Array.from(word).map((ch, ci) => (
        <span className="char" key={ci}>
          {ch}
        </span>
      ))}
      {wi < words.length - 1 && <span className="char">&nbsp;</span>}
    </span>
  ));
};

const renderBody = (text: string) => {
  const words = text.split(' ');
  return words.map((word, wi) => (
    <span className="word" key={wi}>
      {word}
      {wi < words.length - 1 && ' '}
    </span>
  ));
};

export default function VideoScrubSection({ paused = false }: { paused?: boolean }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const overlayTrackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cueContentRefs = useRef<HTMLDivElement[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);

  // Sync paused state via ref pra rAF/onUpdate enxergarem sem recriar effect.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const [loadProgress, setLoadProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pin = pinRef.current;
    const overlayTrack = overlayTrackRef.current;
    if (!canvas || !pin || !overlayTrack) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // ---------- Preload ----------
    const frames: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
    let loaded = 0;
    let cancelled = false;

    const loadOne = (i: number): Promise<void> =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (!cancelled) {
            frames[i] = img;
            loaded++;
            setLoadProgress(loaded / FRAME_COUNT);
          }
          resolve();
        };
        img.onerror = () => {
          loaded++;
          setLoadProgress(loaded / FRAME_COUNT);
          resolve();
        };
        img.src = framePath(i);
      });

    const batchLoad = async () => {
      const BATCH = 24;
      for (let start = 0; start < FRAME_COUNT && !cancelled; start += BATCH) {
        const end = Math.min(start + BATCH, FRAME_COUNT);
        const promises: Promise<void>[] = [];
        for (let i = start; i < end; i++) promises.push(loadOne(i));
        await Promise.all(promises);
      }
    };

    // ---------- Draw ----------
    const drawFrame = (idx: number) => {
      const clamped = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(idx)));
      const img = frames[clamped];
      if (!img) return;
      ctx.drawImage(img, 0, 0, FRAME_W, FRAME_H);
    };

    // ---------- Cue activation (char-by-char no título, word-by-word no body) ----------
    const cueActive = CUES.map(() => false);

    // Estado inicial: tudo invisível
    const initCueStates = () => {
      for (let i = 0; i < CUES.length; i++) {
        const content = cueContentRefs.current[i];
        if (!content) continue;
        const chars = content.querySelectorAll('.char');
        const words = content.querySelectorAll('.word');
        const eyebrow = content.querySelector('.video-scrub__cue-eyebrow');
        gsap.set(content, { opacity: 0 });
        gsap.set(chars, { opacity: 0, y: 60 });
        gsap.set(words, { opacity: 0, y: 20 });
        if (eyebrow) gsap.set(eyebrow, { opacity: 0, y: 10 });
      }
    };

    const activateCue = (i: number) => {
      const content = cueContentRefs.current[i];
      if (!content) return;
      const chars = content.querySelectorAll('.char');
      const words = content.querySelectorAll('.word');
      const eyebrow = content.querySelector('.video-scrub__cue-eyebrow');

      gsap.killTweensOf([content, chars, words, eyebrow].filter(Boolean));

      const tl = gsap.timeline();
      tl.to(content, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 0);
      if (eyebrow) {
        tl.to(eyebrow, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.05);
      }
      tl.fromTo(
        chars,
        { opacity: 0, y: 60 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.022, ease: 'power3.out' },
        0.1
      );
      tl.fromTo(
        words,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.035, ease: 'power2.out' },
        0.25
      );
    };

    const deactivateCue = (i: number) => {
      const content = cueContentRefs.current[i];
      if (!content) return;
      const chars = content.querySelectorAll('.char');
      const words = content.querySelectorAll('.word');
      const eyebrow = content.querySelector('.video-scrub__cue-eyebrow');

      gsap.killTweensOf([content, chars, words, eyebrow].filter(Boolean));

      const tl = gsap.timeline();
      tl.to(chars, {
        opacity: 0, y: -30, duration: 0.3, stagger: 0.012, ease: 'power2.in',
      }, 0);
      tl.to(words, {
        opacity: 0, y: -12, duration: 0.25, stagger: 0.02, ease: 'power2.in',
      }, 0.05);
      if (eyebrow) {
        tl.to(eyebrow, { opacity: 0, y: -8, duration: 0.2, ease: 'power2.in' }, 0.1);
      }
      tl.to(content, { opacity: 0, duration: 0.2, ease: 'power2.in' }, 0.2);
    };

    let lastProgress = 0;

    const updateCues = (progress: number) => {
      const currentFrame = progress * (FRAME_COUNT - 1);

      let activeIdx = -1;
      for (let i = 0; i < CUES.length; i++) {
        const c = CUES[i];
        if (currentFrame >= c.startFrame && currentFrame < c.endFrame) {
          activeIdx = i;
          break;
        }
      }

      for (let i = 0; i < CUES.length; i++) {
        if (i === activeIdx && !cueActive[i]) {
          // ativa um, garante que os outros saiam
          for (let j = 0; j < CUES.length; j++) {
            if (j !== i && cueActive[j]) {
              cueActive[j] = false;
              deactivateCue(j);
            }
          }
          cueActive[i] = true;
          activateCue(i);
        } else if (i !== activeIdx && cueActive[i]) {
          cueActive[i] = false;
          deactivateCue(i);
        }
      }
    };

    // ---------- Track ----------
    const sizeTrack = () => {
      const pinH = pin.offsetHeight;
      const totalH = pinH * (FRAME_COUNT / FPS) * SCROLL_FACTOR;
      overlayTrack.style.setProperty('--track-offset-y', `-${pinH}px`);
      overlayTrack.style.setProperty('--track-height', `${totalH - pinH}px`);
    };

    // ---------- rAF idle loop (só roda enquanto pin engatado E usuário já scrollou) ----------
    let currentFrame = 0;
    let isScrolling = false;
    let pinEngaged = false;
    let userHasScrolled = false; // ← evita auto-loop disparar cue 1 antes do primeiro scroll
    let lastTick = 0;
    let rafId = 0;
    let idleTimer: number | null = null;
    const RESUME_DELAY = 250;

    const resetAllCues = () => {
      for (let i = 0; i < CUES.length; i++) {
        if (cueActive[i]) {
          cueActive[i] = false;
          deactivateCue(i);
        }
      }
    };

    const tick = (now: number) => {
      // Só avança quando:
      // - não está pausado (preloader fechado)
      // - pin engatado (sessão visível)
      // - usuário JÁ scrollou pelo menos uma vez (evita flash de cue 1 ao abrir)
      // - não está scrollando ativamente
      // - asset carregado
      if (
        !pausedRef.current &&
        pinEngaged &&
        userHasScrolled &&
        !isScrolling &&
        ready &&
        now - lastTick >= FRAME_INTERVAL
      ) {
        currentFrame = (currentFrame + 1) % FRAME_COUNT;
        drawFrame(currentFrame);
        updateCues(currentFrame / (FRAME_COUNT - 1));
        lastTick = now;
      }
      rafId = requestAnimationFrame(tick);
    };

    // ---------- ScrollTrigger principal: pin + scrub + lifecycle do loop ----------
    let mainST: ScrollTrigger | null = null;

    const setup = () => {
      sizeTrack();

      mainST = ScrollTrigger.create({
        trigger: pin,
        pin: pin,
        start: 'top top',
        end: () => {
          sizeTrack();
          return `+=${overlayTrack.offsetHeight - pin.offsetHeight}`;
        },
        scrub: 0.4,
        pinSpacing: false,
        invalidateOnRefresh: true,
        onEnter: () => {
          pinEngaged = true;
          lastTick = 0;
          hintRef.current?.classList.add('is-visible');
        },
        onEnterBack: () => {
          pinEngaged = true;
          lastTick = 0;
          hintRef.current?.classList.add('is-visible');
        },
        onLeave: () => {
          pinEngaged = false;
          resetAllCues();
          hintRef.current?.classList.remove('is-visible');
        },
        onLeaveBack: () => {
          pinEngaged = false;
          resetAllCues();
          currentFrame = 0;
          drawFrame(0);
          hintRef.current?.classList.remove('is-visible');
        },
        onUpdate: (self) => {
          const p = self.progress;
          lastProgress = p;

          // Primeiro scroll real detectado → libera o auto-loop quando idle
          if (p > 0.002) userHasScrolled = true;

          isScrolling = true;
          const idx = p * (FRAME_COUNT - 1);
          currentFrame = Math.round(idx);
          drawFrame(idx);
          updateCues(p);

          // some o hint depois de 8% de scroll (já entendeu que precisa rolar)
          if (hintRef.current) {
            if (p > 0.08) hintRef.current.classList.add('is-dismissed');
            else hintRef.current.classList.remove('is-dismissed');
          }

          if (idleTimer !== null) window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => {
            isScrolling = false;
            idleTimer = null;
          }, RESUME_DELAY);
        },
      });

      ScrollTrigger.refresh();

      // Hero é a primeira sessão: pin já em range no scroll=0 → onEnter NÃO dispara no init.
      // Forçamos estado inicial pinEngaged + hint visível. onLeave/onUpdate cuidam de hide depois.
      pinEngaged = true;
      hintRef.current?.classList.add('is-visible');
    };

    // ---------- Boot ----------
    batchLoad().then(() => {
      if (cancelled) return;
      drawFrame(0);
      initCueStates();
      setReady(true);
      setup();
      rafId = requestAnimationFrame(tick);
    });

    const onResize = () => {
      sizeTrack();
      ScrollTrigger.refresh();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      mainST?.kill();
    };
  }, [ready]);

  return (
    <section className="video-scrub" ref={sectionRef}>
      <div className="video-scrub__pin" ref={pinRef}>
        <canvas
          ref={canvasRef}
          width={FRAME_W}
          height={FRAME_H}
          className="video-scrub__canvas"
          aria-hidden="true"
        />

        {!ready && (
          <div className="video-scrub__loader">
            <div className="video-scrub__loader-label">
              Carregando NY <span>{Math.round(loadProgress * 100)}%</span>
            </div>
            <div className="video-scrub__loader-bar">
              <div
                className="video-scrub__loader-bar-fill"
                style={{ transform: `scaleX(${loadProgress})` }}
              />
            </div>
          </div>
        )}

        {CUES.map((cue, i) => (
          <div className="video-scrub__cue" key={i}>
            <div
              className="video-scrub__cue-content"
              ref={(el) => {
                if (el) cueContentRefs.current[i] = el;
              }}
            >
              <span className="video-scrub__cue-eyebrow">{cue.eyebrow}</span>
              <h2 className="video-scrub__cue-title">{renderTitle(cue.title)}</h2>
              <p className="video-scrub__cue-body">{renderBody(cue.body)}</p>
              {cue.stack && (
                <div className="video-scrub__cue-stack">
                  {cue.stack.map((item, j) => (
                    <Fragment key={j}>
                      <span className="word">{item}</span>
                      {j < cue.stack!.length - 1 && (
                        <span className="video-scrub__cue-stack-sep" aria-hidden="true">·</span>
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="video-scrub__hint" ref={hintRef} aria-hidden="true">
          <span className="video-scrub__hint-label">Role para descobrir</span>
          <div className="video-scrub__hint-track">
            <div className="video-scrub__hint-pill" />
          </div>
        </div>
      </div>
      <div className="video-scrub__overlay-track" ref={overlayTrackRef} />
    </section>
  );
}
