"use client";

import React, { useState, useEffect } from 'react';

interface AtomicTextProps {
  text: string;
  speed?: number; // Tiempo entre letras en ms (ej. 20ms)
  className?: string; // Para estilos de Tailwind (ej. 'text-3xl text-cyan-400')
}

const AtomicText: React.FC<AtomicTextProps> = ({ text, speed = 25, className = "" }) => {
  const [displayedText, setDisplayedText] = useState<string>("");

  // 1. El "Cerebro Atómico": Efecto que secuencialmente añade letras
  useEffect(() => {
    const source = String(text ?? "");
    if (!source) {
      setDisplayedText("");
      return;
    }

    setDisplayedText("");
    let currentIdx = 0;
    const intervalId = setInterval(() => {
      currentIdx += 1;
      if (currentIdx >= source.length) {
        setDisplayedText(source);
        clearInterval(intervalId);
        return;
      }
      setDisplayedText(source.slice(0, currentIdx));
    }, speed);

    return () => clearInterval(intervalId); // Limpia si el componente se desmonta
  }, [text, speed]);

  return (
    <div
      className={`leading-relaxed tracking-wide whitespace-pre-wrap break-words hyphens-none text-balance ${className}`}
    >
      {displayedText}
    </div>
  );
};

export default React.memo(AtomicText);
