const channels = [
  { label: 'WhatsApp', value: '+1 (917) 702 8156', href: 'https://wa.me/19177028156' },
  { label: 'Email', value: 'gustavo.guitar.teixeira@gmail.com', href: 'mailto:gustavo.guitar.teixeira@gmail.com' },
  { label: 'Instagram', value: '@gustavoteixeiira', href: 'https://instagram.com/gustavoteixeiira' },
  { label: 'GitHub', value: '@texgustavo', href: 'https://github.com/texgustavo' },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span className="eyebrow">Vamos conversar</span>
        <h3 className="footer__title">
          Projetos a partir de <em>R$2.500</em>.
        </h3>
        <p className="footer__sub">
          Resposta em até 24h no WhatsApp ou email.
        </p>

        <ul className="footer__channels">
          {channels.map((c) => (
            <li key={c.label}>
              <span className="footer__label">{c.label}</span>
              <a className="footer__link" href={c.href} target="_blank" rel="noopener">
                {c.value}
              </a>
            </li>
          ))}
        </ul>

        <a href="https://wa.me/19177028156" target="_blank" rel="noopener" className="footer__cta">
          vamos conversar →
        </a>

        <p className="footer__credit">
          Gustavo Teixeira · Nova York · 2026
        </p>
      </div>
    </footer>
  );
}
