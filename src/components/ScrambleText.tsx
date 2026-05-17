// ScrambleText.tsx — wrapper React do ScrambleTextPlugin oficial do GSAP.
// Desde abril/2025 todos os plugins GSAP são gratuitos (Webflow tornou open),
// incluindo ScrambleText, SplitText, MorphSVG, DrawSVG, etc.
// https://webflow.com/blog/gsap-becomes-free

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

// Registra o plugin uma vez globalmente
gsap.registerPlugin(ScrambleTextPlugin);

interface Props {
  text: string;
  duration?: number;     // segundos (não ms — convenção GSAP)
  delay?: number;        // segundos
  chars?: 'upperCase' | 'lowerCase' | 'upperAndLowerCase' | string; // charset do scramble
  revealDelay?: number;  // segundos — quanto demora pra começar a "settling" as letras
  speed?: number;        // velocidade interna de troca de chars random (0.3 = padrão)
  className?: string;
}

export default function ScrambleText({
  text,
  duration = 2,
  delay = 0,
  chars = 'upperAndLowerCase',
  revealDelay = 0.4,
  speed = 0.3,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // O plugin precisa de um texto INICIAL no elemento pra calcular o tween.
    // Setamos placeholder de espaços com mesmo length pra evitar layout shift.
    ref.current.textContent = ' '.repeat(text.length);

    const tween = gsap.to(ref.current, {
      duration,
      delay,
      ease: 'none',
      scrambleText: {
        text,
        chars,
        revealDelay,
        speed,
        tweenLength: false,
      },
    });

    return () => {
      tween.kill();
    };
  }, [text, duration, delay, chars, revealDelay, speed]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: 'inherit' }}
    >
      {text}
    </span>
  );
}
