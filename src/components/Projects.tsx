// Projects.tsx — sessão de projetos selecionados com STICKY STACKING (Enerblock style)
// Cada card é position:sticky com top incrementado → vão empilhando como cartas de baralho
// conforme o usuário scrolla. CSS puro pro efeito + GSAP só pra reveal de entrada.

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type Project = {
  order: string;
  category: string;
  title: string;
  year: string;
  body: string;
  href: string;
  image: string;
};

const PROJECTS: Project[] = [
  {
    order: '01',
    category: 'Psicologia clínica',
    title: 'Mariana Daher',
    year: '2026',
    body: 'Landing premium com sticky grid scroll, paleta scrapbook autoral e motion narrativo. HTML vanilla + GSAP + Lenis.',
    href: 'https://mariana-daher-psi.vercel.app/',
    image: '/projects/mariana.webp',
  },
  {
    order: '02',
    category: 'SaaS · IA',
    title: 'Hugfy',
    year: '2026',
    body: 'Plataforma full-stack pra famílias neurodivergentes. Auth, RLS, agenda, fichinhas com embeddings, Resumo Semanal progressivo, sistema de avatar.',
    href: 'https://hugfy.com.br',
    image: '/projects/hugfy.webp',
  },
  {
    order: '03',
    category: 'Logística',
    title: 'Despacho Rápido',
    year: '2026',
    body: 'Redesign moderno pra transportadora. UI premium, motion cinematográfico, dashboard de operações. Next.js + R3F + integrações.',
    href: 'https://site-three-theta-49.vercel.app/',
    image: '/projects/despacho.webp',
  },
];

export default function Projects() {
  const rootRef = useRef<HTMLElement>(null);
  const headerLineRefs = useRef<HTMLDivElement[]>([]);
  const cardRefs = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Estado inicial: linhas do header escondidas + cards leve y/opacity
    headerLineRefs.current.forEach((line) => gsap.set(line, { yPercent: 110 }));
    cardRefs.current.forEach((card) => {
      const inner = card.querySelector('.project-card__inner');
      if (inner) gsap.set(inner, { opacity: 0, y: 40 });
    });

    // Title reveal scrub
    gsap.to(headerLineRefs.current, {
      yPercent: 0,
      duration: 1,
      stagger: 0.12,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: root,
        start: 'top 75%',
        end: 'top 30%',
        scrub: 0.6,
      },
    });

    // Cada card fade-in conforme entra
    cardRefs.current.forEach((card) => {
      const inner = card.querySelector('.project-card__inner');
      if (!inner) return;
      gsap.to(inner, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'expo.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      });
    });

    return () => {
      ScrollTrigger.getAll()
        .filter((st) => st.trigger === root || (st.trigger && root.contains(st.trigger as Element)))
        .forEach((st) => st.kill());
    };
  }, []);

  return (
    <section className="projects" ref={rootRef}>
      <div className="projects__header">
        <div className="projects__eyebrow">
          <span className="projects__eyebrow-num">02</span>
          <span className="projects__eyebrow-sep">/</span>
          <span>Selected work</span>
        </div>
        <h2 className="projects__title">
          <div className="projects__title-line">
            <div
              className="projects__title-inner"
              ref={(el) => { if (el) headerLineRefs.current[0] = el; }}
            >
              Projetos
            </div>
          </div>
          <div className="projects__title-line">
            <div
              className="projects__title-inner"
              ref={(el) => { if (el) headerLineRefs.current[1] = el; }}
            >
              em produção
            </div>
          </div>
        </h2>
      </div>

      <div className="projects__stack">
        {PROJECTS.map((p, i) => (
          <article
            className="project-card"
            key={p.order}
            style={{ '--idx': i + 1 } as React.CSSProperties}
            ref={(el) => { if (el) cardRefs.current[i] = el; }}
          >
            <div className="project-card__inner">
              {/* Topbar: order + year */}
              <div className="project-card__top">
                <span className="project-card__order">{p.order}</span>
                <span className="project-card__year">{p.year}</span>
              </div>

              {/* Body: 2 colunas — texto (esquerda) + preview (direita) */}
              <div className="project-card__main">
                <div className="project-card__text">
                  <span className="project-card__category">{p.category}</span>
                  <h3 className="project-card__title">{p.title}</h3>
                  <p className="project-card__desc">{p.body}</p>
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="project-card__link"
                  >
                    Visit site
                    <span className="project-card__link-arrow" aria-hidden="true">→</span>
                  </a>
                </div>

                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="project-card__visual"
                  aria-label={`Abrir ${p.title} em nova aba`}
                >
                  <img
                    src={p.image}
                    alt={`Preview do projeto ${p.title}`}
                    className="project-card__image"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
