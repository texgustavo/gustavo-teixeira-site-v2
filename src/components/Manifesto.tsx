// Manifesto.tsx — layout estilo Juan|Mora (juanmora.co footer).
// Dois textos massivos em pontas opostas, cada um com word-mask slide-up reveal.
// Marca accent no centro como connector visual.

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function Manifesto() {
  const rootRef = useRef<HTMLElement>(null);
  const innerLeftRef = useRef<HTMLSpanElement>(null);
  const innerRightRef = useRef<HTMLSpanElement>(null);
  const subLeftRef = useRef<HTMLParagraphElement>(null);
  const subRightRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Estado inicial: PERFORMANCE off-screen LEFT, IDENTIDADE off-screen RIGHT
    // (slide horizontal convergindo pra dentro, não vertical mask)
    gsap.set(innerLeftRef.current, { x: '-70vw', opacity: 0 });
    gsap.set(innerRightRef.current, { x: '70vw', opacity: 0 });
    gsap.set([subLeftRef.current, subRightRef.current], { opacity: 0, y: 16 });
    gsap.set(markRef.current, { scale: 0, opacity: 0 });
    if (indicatorRef.current) gsap.set(indicatorRef.current, { opacity: 0, y: 10 });

    // Timeline orquestrada — dispara assim que a sessão começa a entrar (10% visível)
    // garantindo que Performance/Identidade animam ANTES de terminar o último card do Projects
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: root,
        start: 'top 90%',
        toggleActions: 'play none none reverse',
      },
    });

    // 1) Palavra esquerda entra deslizando da esquerda
    tl.to(innerLeftRef.current, {
      x: 0,
      opacity: 1,
      duration: 1.3,
      ease: 'expo.out',
    }, 0);

    // 2) Palavra direita entra deslizando da direita (paralela, mesma duration)
    tl.to(innerRightRef.current, {
      x: 0,
      opacity: 1,
      duration: 1.3,
      ease: 'expo.out',
    }, 0);

    // 3) Mark central pops in quando as duas estão chegando perto
    tl.to(markRef.current, {
      scale: 1,
      opacity: 1,
      duration: 0.6,
      ease: 'back.out(2)',
    }, 0.55);

    // 4) Subtitles entram
    tl.to([subLeftRef.current, subRightRef.current], {
      opacity: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.08,
      ease: 'power2.out',
    }, '-=0.5');

    // 5) Indicator final
    if (indicatorRef.current) {
      tl.to(indicatorRef.current, {
        opacity: 0.65,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
      }, '-=0.2');
    }

    return () => {
      ScrollTrigger.getAll()
        .filter((st) => st.trigger === root)
        .forEach((st) => st.kill());
    };
  }, []);

  return (
    <section className="manifesto" ref={rootRef}>
      <div className="manifesto__grid">
        {/* Coluna esquerda */}
        <div className="manifesto__col manifesto__col--left">
          <h2 className="manifesto__big" aria-label="Performance">
            <span className="manifesto__big-mask" aria-hidden="true">
              <span className="manifesto__big-inner" ref={innerLeftRef}>
                Performance
              </span>
            </span>
          </h2>
          <p className="manifesto__sub" ref={subLeftRef}>em código</p>
        </div>

        {/* Centro — accent mark como connector */}
        <div className="manifesto__center">
          <span className="manifesto__mark" ref={markRef} aria-hidden="true" />
        </div>

        {/* Coluna direita */}
        <div className="manifesto__col manifesto__col--right">
          <h2 className="manifesto__big" aria-label="Identidade">
            <span className="manifesto__big-mask" aria-hidden="true">
              <span className="manifesto__big-inner" ref={innerRightRef}>
                Identidade
              </span>
            </span>
          </h2>
          <p className="manifesto__sub" ref={subRightRef}>em tempo real.</p>
        </div>
      </div>

      <div className="manifesto__indicator" ref={indicatorRef} aria-hidden="true">
        <span className="manifesto__indicator-arrow">↓</span>
        <span>Demo · GLSL</span>
      </div>
    </section>
  );
}
