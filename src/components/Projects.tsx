// Projects.tsx — SVG Mask Scroll Transition (Codrops + adaptação Gustavo v2)
// Substitui o sticky-stacking-cards por uma sessão imersiva fullscreen:
// stage com height:500vh + sticky inner. N SVG layers (uma por projeto) empilhados.
// Cada layer tem <mask> com 28 retângulos horizontais ("blinds") em height:0.
// GSAP ScrollTrigger anima height+y dos rects sincronizado ao scroll,
// stagger 0.02s, ease power3.out. Rects abrem do centro pra fora.
// Conforme scroll progride: layer 1 reveal → layer 2 reveal → layer 3 reveal.
//
// Mantém header "02 / Selected work — Projetos em produção" como intro antes do stage.

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Menos blinds = menos DOM updates por frame. 12 ainda dá efeito persiana visível,
// e baixa de 108 rects animados (3 layers × 18 × 2) pra 72. ~33% menos trabalho.
const BLIND_COUNT = 12;
const SVG_NS = 'http://www.w3.org/2000/svg';

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
    category: 'Psicologia clínica · 2026',
    title: 'Mariana Daher',
    year: '2026',
    body: 'Landing premium com sticky grid scroll, paleta scrapbook autoral e motion narrativo. HTML vanilla + GSAP + Lenis.',
    href: 'https://mariana-daher-psi.vercel.app/',
    image: '/projects/mariana.webp',
  },
  {
    order: '02',
    category: 'SaaS · IA · 2026',
    title: 'Hugfy',
    year: '2026',
    body: 'Plataforma full-stack pra famílias neurodivergentes. Auth, RLS, agenda, fichinhas com embeddings, sistema de avatar.',
    href: 'https://hugfy.com.br',
    image: '/projects/hugfy.webp',
  },
  {
    order: '03',
    category: 'Logística · 2026',
    title: 'Despacho Rápido',
    year: '2026',
    body: 'Redesign moderno pra transportadora. UI premium, motion cinematográfico, dashboard de operações.',
    href: 'https://site-three-theta-49.vercel.app/',
    image: '/projects/despacho.webp',
  },
];

type Blind = { top: SVGRectElement; bottom: SVGRectElement; y: number; h: number };

export default function Projects() {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headerLineRefs = useRef<HTMLDivElement[]>([]);
  const layerRefs = useRef<SVGSVGElement[]>([]);
  const textRefs = useRef<HTMLDivElement[]>([]);
  const fillRefs = useRef<HTMLDivElement[]>([]);
  const masterRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ============ Header title reveal (mantido do design anterior) ============
    headerLineRefs.current.forEach((line) => gsap.set(line, { yPercent: 110 }));
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

    // ============ SVG Mask Scroll Transition (adaptado do Codrops) ============
    let blindsSets: Blind[][] = [];

    function createBlinds(g: SVGGElement, vbHeight: number): Blind[] {
      g.innerHTML = '';
      const h = vbHeight / BLIND_COUNT;
      const blinds: Blind[] = [];
      let currentY = 0;
      for (let i = 0; i < BLIND_COUNT; i++) {
        const centerY = vbHeight - (currentY + h / 2);
        const rectTop = document.createElementNS(SVG_NS, 'rect');
        const rectBottom = document.createElementNS(SVG_NS, 'rect');
        [rectTop, rectBottom].forEach((r) => {
          r.setAttribute('x', '0');
          r.setAttribute('width', '100');
          r.setAttribute('height', '0');
          r.setAttribute('fill', 'white');
          r.setAttribute('shape-rendering', 'crispEdges');
          r.setAttribute('y', String(centerY));
        });
        g.appendChild(rectTop);
        g.appendChild(rectBottom);
        blinds.push({ top: rectTop, bottom: rectBottom, y: centerY, h: h / 2 });
        currentY += h;
      }
      return blinds;
    }

    function openBlinds(blinds: Blind[]) {
      return gsap.timeline().to(
        blinds.flatMap((b) => [b.top, b.bottom]),
        {
          attr: {
            y: (i: number) => {
              const b = blinds[Math.floor(i / 2)];
              return i % 2 === 0 ? b.y - b.h : b.y;
            },
            height: (i: number) => {
              const b = blinds[Math.floor(i / 2)];
              return b.h + 0.01; // pequeno overlap evita gaps de subpixel
            },
          },
          ease: 'power3.out',
          stagger: { each: 0.02, from: 'start' },
        }
      );
    }

    function textIn(el: HTMLElement) {
      return gsap.to(el, {
        clipPath: 'inset(0% 0% 0% 0%)',
        y: 0,
        duration: 1.5,
        ease: 'expo.out',
      });
    }

    function textOut(el: HTMLElement) {
      return gsap.to(el, {
        clipPath: 'inset(0% 0% 100% 0%)',
        y: -30,
        duration: 1.2,
        ease: 'power2.inOut',
      });
    }

    function updateLayout() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const vbWidth = 100;
      const vbHeight = (height / width) * 100;

      blindsSets = [];

      layerRefs.current.forEach((svg) => {
        if (!svg) return;
        svg.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`);
        const maskRect = svg.querySelector('mask rect') as SVGRectElement | null;
        if (maskRect) {
          maskRect.setAttribute('width', String(vbWidth));
          maskRect.setAttribute('height', String(vbHeight));
        }
        const img = svg.querySelector('image') as SVGImageElement | null;
        if (img) {
          img.setAttribute('width', String(vbWidth));
          img.setAttribute('height', String(vbHeight));
        }
        const g = svg.querySelector('g[id^="projects-blinds"]') as SVGGElement | null;
        if (g) {
          const blinds = createBlinds(g, vbHeight);
          blindsSets.push(blinds);
        }
      });

      buildMasterTimeline();
    }

    function buildMasterTimeline() {
      if (masterRef.current) masterRef.current.kill();

      // Estado inicial dos textos
      textRefs.current.forEach((t) => {
        gsap.set(t, { clipPath: 'inset(100% 0 0 0)', y: 40 });
      });

      const stage = stageRef.current;
      if (!stage) return;

      // ÚNICO ScrollTrigger pra master timeline + progress bar.
      // Dois triggers paralelos com scrub diferente forçavam dois rAF loops
      // sobrepostos por frame e batiam no main thread.
      const master = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
          anticipatePin: 1,
          onUpdate: (self) => {
            const progress = self.progress;
            const total = fillRefs.current.length;
            for (let i = 0; i < total; i++) {
              let p = (progress - i / total) * total;
              p = p < 0 ? 0 : p > 1 ? 1 : p;
              const fill = fillRefs.current[i];
              if (fill) fill.style.width = `${p * 100}%`;
            }
          },
        },
      });

      blindsSets.forEach((blinds, i) => {
        master.add(openBlinds(blinds));
        const txt = textRefs.current[i];
        if (txt) {
          master.add(textIn(txt), '-=0.3');
          master.add(textOut(txt), '+=0.8');
        }
      });

      masterRef.current = master;
    }

    updateLayout();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateLayout, 250);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      if (masterRef.current) masterRef.current.kill();
      ScrollTrigger.getAll()
        .filter((st) => st.trigger === root || st.trigger === stageRef.current)
        .forEach((st) => st.kill());
    };
  }, []);

  return (
    <section className="projects projects--mask" ref={rootRef}>
      {/* Header — mantido como intro (eyebrow + título) */}
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
        <p className="projects__scroll-hint">role para descobrir ↓</p>
      </div>

      {/* Stage — 500vh, sticky inner anima máscaras */}
      <div className="projects-mask__stage" ref={stageRef}>
        <div className="projects-mask__sticky">
          {/* SVG layers — uma por projeto, empilhadas */}
          {PROJECTS.map((p, i) => (
            <svg
              key={p.order}
              ref={(el) => { if (el) layerRefs.current[i] = el; }}
              className="projects-mask__layer"
              viewBox="0 0 100 56.25"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <mask id={`projects-mask-${i}`} maskUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="100" height="56.25" fill="black" />
                  <g id={`projects-blinds-${i}`} />
                </mask>
              </defs>
              <image
                href={p.image}
                x="0"
                y="0"
                width="100"
                height="56.25"
                preserveAspectRatio="xMidYMid meet"
                mask={`url(#projects-mask-${i})`}
              />
            </svg>
          ))}

          {/* Texts overlay — um por projeto */}
          <div className="projects-mask__texts">
            {PROJECTS.map((p, i) => (
              <div
                key={p.order}
                ref={(el) => { if (el) textRefs.current[i] = el; }}
                className="projects-mask__txt"
              >
                <span className="projects-mask__order">{p.order}</span>
                <h3 className="projects-mask__title">{p.title}</h3>
                <h4 className="projects-mask__category">{p.category}</h4>
                <p className="projects-mask__body">{p.body}</p>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="projects-mask__link"
                >
                  Visit site →
                </a>
              </div>
            ))}
          </div>

          {/* Progress bar — N segmentos */}
          <div className="projects-mask__progress">
            {PROJECTS.map((_, i) => (
              <div key={i} className="projects-mask__segment">
                <div
                  className="projects-mask__fill"
                  ref={(el) => { if (el) fillRefs.current[i] = el; }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
