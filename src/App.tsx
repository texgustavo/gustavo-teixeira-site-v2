import { useEffect } from 'react';
import Lenis from 'lenis';
import HeroShader from './components/HeroShader';
import About from './components/About';
import Footer from './components/Footer';

export default function App() {
  // Lenis smooth scroll global
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 1.2,
    });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  return (
    <div className="app">
      {/* Hero — fragment shader fullscreen "Grid Run" (atzedent) */}
      <HeroShader />

      {/* Conteúdo HTML normal abaixo da hero */}
      <About />
      <Footer />
    </div>
  );
}
