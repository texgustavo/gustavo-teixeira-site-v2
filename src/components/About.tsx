const stack = [
  'Next.js', 'React', 'TypeScript', 'Astro', 'TailwindCSS',
  'GSAP', 'Framer Motion', 'Three.js', 'React Three Fiber',
  'Node.js', 'Claude Code', 'AI Workflows', 'Vercel'
];

export default function About() {
  return (
    <section className="about">
      <div className="about__inner">
        <span className="eyebrow">Sobre</span>
        <h2 className="about__title">
          Experiências digitais <em>premium</em> com motion e IA.
        </h2>
        <p className="about__bio">
          Desenvolvedor criativo brasileiro baseado em Nova York, especializado
          em experiências frontend premium, motion design e desenvolvimento
          assistido por IA. Construo sites rápidos, sofisticados e memoráveis
          pra marcas que valorizam diferenciação visual e técnica.
        </p>

        <div className="about__stack-wrap">
          <span className="eyebrow">Stack</span>
          <ul className="about__stack">
            {stack.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
