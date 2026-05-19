// About.tsx — sessão "Sobre"
// Coluna esquerda: foto com efeito "quadro abrindo" (duas metades deslizando pra fora)
// Coluna direita: line-mask título + word stagger nos parágrafos + stack categorizado com stagger

import { Fragment, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TITLE_LINES = [
  'Visão criativa',
  'e execução técnica',
  'sem concessões',
];

const BIO_PARAGRAPHS = [
  'Desenvolvedor criativo brasileiro baseado em Nova York. Português nativo, inglês fluente.',
  'Especializado em motion design, frontend 3D e shaders WebGL. Construo sites premium do zero, com identidade visual forte, performance real e detalhe técnico que diferencia.',
  'Trabalho com marcas que querem presença digital memorável. Sem template, sem atalho, sem concessões.',
];

const STACK_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Frameworks', items: ['Astro', 'Vite', 'Next.js', 'React', 'TypeScript'] },
  { label: 'Motion', items: ['GSAP', 'ScrollTrigger', 'SplitText', 'MorphSVG', 'Lenis'] },
  { label: '3D / WebGL', items: ['Three.js', 'React Three Fiber', 'Drei', 'Postprocessing', 'GLSL Shaders', 'Blender'] },
  { label: 'Styling', items: ['TailwindCSS', 'CSS Custom'] },
  { label: 'Deploy', items: ['Vercel', 'GitHub', 'Node.js'] },
  { label: 'Tools', items: ['Cursor', 'GitHub'] },
];

const renderChars = (text: string) => {
  const words = text.split(' ');
  return (
    <>
      {words.map((word, wi) => (
        <span className="about-word-group" key={wi}>
          {Array.from(word).map((ch, ci) => (
            <span className="about-char" key={ci}>{ch}</span>
          ))}
          {wi < words.length - 1 && <span className="about-char">&nbsp;</span>}
        </span>
      ))}
    </>
  );
};

const renderWords = (text: string) => {
  const words = text.split(' ');
  return (
    <>
      {words.map((word, wi) => (
        <Fragment key={wi}>
          <span className="about-word">{word}</span>
          {wi < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
};

export default function About() {
  const rootRef = useRef<HTMLElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const coverTopRef = useRef<HTMLDivElement>(null);
  const coverBottomRef = useRef<HTMLDivElement>(null);

  const lineRefs = useRef<HTMLDivElement[]>([]);
  const bioRefs = useRef<HTMLParagraphElement[]>([]);
  const stackPretitleRef = useRef<HTMLSpanElement>(null);
  const stackRowsRef = useRef<HTMLLIElement[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ---------- Estado inicial ----------
    gsap.set(imgRef.current, { scale: 1.08 });
    gsap.set(coverTopRef.current, { yPercent: 0 });
    gsap.set(coverBottomRef.current, { yPercent: 0 });

    lineRefs.current.forEach((line) => gsap.set(line, { yPercent: 110 }));

    bioRefs.current.forEach((p) => {
      const words = p.querySelectorAll('.about-word');
      gsap.set(words, { opacity: 0, y: 14, filter: 'blur(6px)' });
    });

    if (stackPretitleRef.current) {
      const chars = stackPretitleRef.current.querySelectorAll('.about-char');
      gsap.set(chars, { opacity: 0, y: 14 });
    }

    stackRowsRef.current.forEach((row) => {
      gsap.set(row, { opacity: 0, y: 18, filter: 'blur(4px)' });
    });

    // ---------- Quadro abrindo: covers deslizam + foto settle ----------
    const imageTl = gsap.timeline({
      scrollTrigger: {
        trigger: root,
        start: 'top 75%',
        toggleActions: 'play none none reverse',
      },
    });
    imageTl
      .to(coverTopRef.current, { yPercent: -100, duration: 1.15, ease: 'expo.inOut' }, 0)
      .to(coverBottomRef.current, { yPercent: 100, duration: 1.15, ease: 'expo.inOut' }, 0)
      .to(imgRef.current, { scale: 1, duration: 1.4, ease: 'expo.out' }, 0);

    // ---------- Title line-mask reveal — scrub-based (linha por linha conforme scroll) ----------
    gsap.to(lineRefs.current, {
      yPercent: 0,
      duration: 1,
      stagger: 0.4, // gap maior pra cada linha ter seu próprio range de scroll
      ease: 'expo.out',
      scrollTrigger: {
        trigger: root,
        start: 'top 85%',
        end: 'top 25%',
        scrub: 0.6,
      },
    });

    // ---------- Bio paragraphs word stagger ----------
    bioRefs.current.forEach((p, idx) => {
      const words = p.querySelectorAll('.about-word');
      gsap.to(words, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.55,
        stagger: 0.02,
        ease: 'power3.out',
        delay: idx * 0.08,
        scrollTrigger: {
          trigger: p,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      });
    });

    // ---------- Stack pretitle char + rows stagger ----------
    if (stackPretitleRef.current) {
      const chars = stackPretitleRef.current.querySelectorAll('.about-char');
      gsap.to(chars, {
        opacity: 1, y: 0,
        duration: 0.45, stagger: 0.022, ease: 'power3.out',
        scrollTrigger: {
          trigger: stackPretitleRef.current,
          start: 'top 88%',
          toggleActions: 'play none none reverse',
        },
      });
    }
    gsap.to(stackRowsRef.current, {
      opacity: 1, y: 0, filter: 'blur(0px)',
      duration: 0.55, stagger: 0.06, ease: 'power3.out',
      scrollTrigger: {
        trigger: stackRowsRef.current[0],
        start: 'top 88%',
        toggleActions: 'play none none reverse',
      },
    });

    return () => {
      ScrollTrigger.getAll()
        .filter((st) => st.trigger === root || (st.trigger && root.contains(st.trigger as Element)))
        .forEach((st) => st.kill());
    };
  }, []);

  return (
    <section className="about-section" ref={rootRef}>
      <div className="about-grid">
        {/* Coluna esquerda — foto com quadro abrindo */}
        <div className="about-image-col">
          <div className="about-image-wrap">
            <img
              ref={imgRef}
              src="/about/foto-gustavo.jpg"
              alt="Gustavo Teixeira no metrô de Nova York"
              className="about-image"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="about-cover about-cover-top" ref={coverTopRef} />
          <div className="about-cover about-cover-bottom" ref={coverBottomRef} />
        </div>

        {/* Coluna direita — texto */}
        <div className="about-content-col">
          <div className="about-eyebrow">
            <span className="about-eyebrow-num">01</span>
            <span className="about-eyebrow-sep">/</span>
            <span>Sobre</span>
          </div>

          <h2 className="about-title">
            {TITLE_LINES.map((line, i) => (
              <div className="about-line" key={i}>
                <div
                  className="about-line-inner"
                  ref={(el) => {
                    if (el) lineRefs.current[i] = el;
                  }}
                >
                  {line}
                </div>
              </div>
            ))}
          </h2>

          <div className="about-bio">
            {BIO_PARAGRAPHS.map((p, i) => (
              <p
                className="about-bio-p"
                key={i}
                ref={(el) => {
                  if (el) bioRefs.current[i] = el;
                }}
              >
                {renderWords(p)}
              </p>
            ))}
          </div>

          <div className="about-block about-block--stack">
            <div className="about-block-pretitle">
              <span ref={stackPretitleRef}>{renderChars('Stack')}</span>
              <span className="about-block-square" />
            </div>
            <ul className="about-stack-grid">
              {STACK_GROUPS.map((group, i) => (
                <li
                  className="about-stack-row"
                  key={group.label}
                  ref={(el) => {
                    if (el) stackRowsRef.current[i] = el;
                  }}
                >
                  <span className="about-stack-label">{group.label}</span>
                  <span className="about-stack-items">
                    {group.items.map((item, j) => (
                      <span key={item}>
                        {item}
                        {j < group.items.length - 1 && (
                          <span className="about-stack-sep"> · </span>
                        )}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
