// PageProgress.tsx — mini scrollbar lateral indicando posição no scroll geral.
// Aparece ao scrollar, some após ~1.2s idle.

import { useEffect, useRef } from 'react';

type Props = {
  hidden?: boolean; // permite App esconder durante preloader
};

export default function PageProgress({ hidden = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let idleTimer: number | null = null;
    let rafId = 0;
    let queued = false;

    const update = () => {
      queued = false;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const progress = Math.max(0, Math.min(1, window.scrollY / docHeight));

      const track = trackRef.current;
      const thumb = thumbRef.current;
      if (!track || !thumb) return;

      const trackH = track.offsetHeight;
      const thumbH = thumb.offsetHeight;
      const maxTop = trackH - thumbH;
      thumb.style.transform = `translateY(${progress * maxTop}px)`;

      track.classList.add('is-active');
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        track.classList.remove('is-active');
      }, 1200);
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      rafId = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    // primeira passada
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className={`page-progress${hidden ? ' page-progress--hidden' : ''}`}
      ref={trackRef}
      aria-hidden="true"
    >
      <div className="page-progress__thumb" ref={thumbRef} />
    </div>
  );
}
