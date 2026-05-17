// ScrollText.tsx — texto que se revela letra por letra CONFORME o scroll
// Cada char tem sua janela [start, end] de scroll progress (0..1).
// Dentro dessa janela, o char transita de blur(12px)+opacity:0 pra blur(0)+opacity:1.
// Char anterior termina quando próximo começa, criando reveal contínuo.

import { CSSProperties, JSX } from 'react';

interface ScrollTextProps {
  text: string;
  progress: number;          // 0 a 1, scroll progress da hero (vem do parent)
  startAt?: number;          // em que % do scroll começa reveal (default 0)
  endAt?: number;            // em que % do scroll termina reveal (default 0.5)
  charOverlap?: number;      // overlap entre chars consecutivos (default 0.5 = metade do slot)
  blurAmount?: number;       // blur máximo em px (default 12)
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  style?: CSSProperties;
}

export function ScrollText({
  text,
  progress,
  startAt = 0,
  endAt = 0.5,
  charOverlap = 0.5,
  blurAmount = 12,
  className,
  as = 'span',
  style,
}: ScrollTextProps) {
  const chars = text.split('');
  const total = chars.length;
  const totalRange = endAt - startAt;
  const slotWidth = totalRange / total;
  const charDuration = slotWidth * (1 + charOverlap); // cada char demora 1.5 slots (overlap 50%)

  const Tag = as as keyof JSX.IntrinsicElements;

  return (
    // @ts-expect-error — Tag dinâmica precisa de cast pra aceitar children/props
    <Tag className={className} style={style}>
      {chars.map((char, i) => {
        // Espaço mantém largura mas não anima
        if (char === ' ') {
          return (
            <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
              {' '}
            </span>
          );
        }

        // Janela de scroll desse char específico
        const charStart = startAt + i * slotWidth;
        const charEnd = charStart + charDuration;

        // t = quanto desse char já "se revelou" (0 a 1)
        const t = Math.max(0, Math.min(1, (progress - charStart) / (charEnd - charStart)));

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: t,
              filter: `blur(${(1 - t) * blurAmount}px)`,
              transition: 'none', // movimento já vem do progress, transição CSS atrapalha
              willChange: 'opacity, filter',
            }}
          >
            {char}
          </span>
        );
      })}
    </Tag>
  );
}
