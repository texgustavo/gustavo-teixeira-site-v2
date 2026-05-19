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
import Footer from './components/Footer';

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const [preloading, setPreloading] = useState(true);
  const lenisRef = useRef<Lenis | null>(null);

  // Lenis + ScrollTrigger bridge — instância única, mount-only.
  // Config premium cinematográfica: duration + ease expo-out (clássico Awwwards/Lusion).
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.25,
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

  // Toggle stop/start de acordo com preloading — não recria a instância.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (preloading) {
      lenis.stop();
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else {
      lenis.start();
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

        {/* Sessão de demonstração — fragment shader raymarching fullscreen */}
        <LabShader />

        {/* Footer */}
        <Footer />
      </div>
    </>
  );
}
