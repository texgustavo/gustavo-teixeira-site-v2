import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Preloader from './components/Preloader';
import PageProgress from './components/PageProgress';
import VideoScrubSection from './components/VideoScrubSection';
import LabShader from './components/LabShader';
import About from './components/About';
import Projects from './components/Projects';
import Manifesto from './components/Manifesto';
import AgentTerminal from './components/AgentTerminal';
import Footer from './components/Footer';

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const [preloading, setPreloading] = useState(true);
  const lenisRef = useRef<Lenis | null>(null);

  // Lenis + ScrollTrigger bridge — instância única, mount-only.
  // Config premium cinematográfica desktop. SKIP no mobile (native touch é melhor —
  // Lenis com pin + scrub causa "puxa rápido" feel após exit do Hero pin).
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      // No mobile, ScrollTrigger usa native scroll events. Sem Lenis = scroll responsivo.
      return;
    }

    const lenis = new Lenis({
      // duration 0.9 (antes 1.25) → menos inércia brigando com o scrub: 0.4 do
      // ScrollTrigger no Hero. Double-smoothing causa feel de "atraso" que
      // parece low-FPS mesmo quando o FPS está OK.
      duration: 0.9,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });
    lenisRef.current = lenis;

    lenis.on('scroll', ScrollTrigger.update);
    const tickerFn = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0);

    // Trava scroll desde o início — só libera quando preloader fecha.
    lenis.stop();

    return () => {
      gsap.ticker.remove(tickerFn);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Toggle stop/start de acordo com preloading.
  // Usa body overflow:hidden em paralelo (cobre mobile sem Lenis também).
  useEffect(() => {
    const lenis = lenisRef.current;
    if (preloading) {
      lenis?.stop();
      document.body.style.overflow = 'hidden';
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else {
      lenis?.start();
      document.body.style.overflow = '';
    }
  }, [preloading]);

  return (
    <>
      {preloading && <Preloader onComplete={() => setPreloading(false)} />}

      <PageProgress hidden={preloading} />

      <div className="app" aria-hidden={preloading}>
        {/* Hero — NYC imersivo (image sequence scroll-driven + cues char-by-char) */}
        <VideoScrubSection paused={preloading} />

        {/* Sobre */}
        <About />

        {/* Projetos selecionados — sticky stacking */}
        <Projects />

        {/* Respiro editorial entre Projects e Lab */}
        <Manifesto />

        {/* Talk-to-my-agent — terminal aesthetic, streaming Claude Haiku 4.5 */}
        <AgentTerminal />

        {/* Sessão de demonstração — fragment shader raymarching fullscreen */}
        <LabShader />

        {/* Footer */}
        <Footer />
      </div>
    </>
  );
}
