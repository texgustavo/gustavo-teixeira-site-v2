// Preloader.tsx — word cycling multilíngue + curve exit (framer-motion)
// + preload paralelo dos 372 frames do Hero NYC.
// Exit só dispara quando AMBOS terminam: ciclo de palavras + frames carregados.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const WORDS = ['Hello', 'Bonjour', 'Ciao', 'Olá', 'やあ', 'Hallå', 'Guten Tag', 'হ্যালো'];

const FRAME_COUNT = 372;
const framePath = (i: number) =>
  `/frames/f_${String(i + 1).padStart(4, '0')}.webp`;

const opacity = {
  initial: { opacity: 0 },
  enter: { opacity: 0.85, transition: { duration: 1, delay: 0.2 } },
};

const slideUp = {
  initial: { top: 0 },
  exit: {
    top: '-100vh',
    transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] as const, delay: 0.2 },
  },
};

interface PreloaderProps {
  onComplete?: () => void;
}

export default function Preloader({ onComplete }: PreloaderProps) {
  const [index, setIndex] = useState(0);
  const [dimension, setDimension] = useState({ width: 0, height: 0 });
  const [isExiting, setIsExiting] = useState(false);
  const [framesLoaded, setFramesLoaded] = useState(false);
  const [wordsDone, setWordsDone] = useState(false);

  // Mede viewport (necessário pro SVG path da curva)
  useEffect(() => {
    setDimension({ width: window.innerWidth, height: window.innerHeight });
    const onResize = () => {
      setDimension({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ciclo de palavras
  useEffect(() => {
    if (index === WORDS.length - 1) {
      const t = window.setTimeout(() => {
        setWordsDone(true);
      }, 1000);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(
      () => setIndex(index + 1),
      index === 0 ? 1000 : 150
    );
    return () => window.clearTimeout(t);
  }, [index]);

  // Preload paralelo dos frames
  useEffect(() => {
    let cancelled = false;
    let loaded = 0;

    const loadOne = (i: number): Promise<void> =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        const done = () => {
          loaded++;
          resolve();
        };
        img.onload = done;
        img.onerror = done;
        img.src = framePath(i);
      });

    (async () => {
      const BATCH = 24;
      for (let start = 0; start < FRAME_COUNT && !cancelled; start += BATCH) {
        const end = Math.min(start + BATCH, FRAME_COUNT);
        const promises: Promise<void>[] = [];
        for (let i = start; i < end; i++) promises.push(loadOne(i));
        await Promise.all(promises);
      }
      if (!cancelled) setFramesLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Lógica de saída:
  //   - se palavras E frames terminaram → exit imediato
  //   - se palavras terminaram mas frames ainda carregando → espera max 3s, então exit
  //     (frames continuam em background; VideoScrubSection mostra seu loader interno se não pronto)
  useEffect(() => {
    if (isExiting || !wordsDone) return;

    const triggerExit = () => {
      setIsExiting(true);
      window.setTimeout(() => onComplete?.(), 1000);
    };

    if (framesLoaded) {
      triggerExit();
      return;
    }

    // Cap de 3s aguardando frames depois das palavras
    const t = window.setTimeout(triggerExit, 3000);
    return () => window.clearTimeout(t);
  }, [wordsDone, framesLoaded, isExiting, onComplete]);

  const initialPath = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height + 300} 0 ${dimension.height} L0 0`;
  const targetPath = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height} 0 ${dimension.height} L0 0`;

  const curve = {
    initial: {
      d: initialPath,
      transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] as const },
    },
    exit: {
      d: targetPath,
      transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] as const, delay: 0.3 },
    },
  };

  return (
    <motion.div
      variants={slideUp}
      initial="initial"
      animate={isExiting ? 'exit' : 'initial'}
      className="preloader-v2"
      aria-busy={!isExiting}
    >
      {dimension.width > 0 && (
        <>
          <motion.p
            variants={opacity}
            initial="initial"
            animate="enter"
            className="preloader-v2__word"
          >
            <span className="preloader-v2__dot" />
            {WORDS[index]}
          </motion.p>
          <svg className="preloader-v2__svg">
            <motion.path
              variants={curve}
              initial="initial"
              animate={isExiting ? 'exit' : 'initial'}
              fill="#0d0d0d"
            />
          </svg>
        </>
      )}
    </motion.div>
  );
}
