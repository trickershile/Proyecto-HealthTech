"use client";

import React from 'react';
import QuantumOrganicNucleus from './QuantumOrganicNucleus';

// Tipos de estado para TypeScript (Seguridad ante todo)
type NucleusState = 'idle' | 'talking' | 'warning' | 'alert' | 'listening';

interface QuantumNucleusProps {
  state?: NucleusState;
}

export default function QuantumNucleus({ state = 'idle', audioLevel = 0 }: { state?: NucleusState, audioLevel?: number }) {
  
  // 1. Configuración Reactiva de Físicas y Colores
  const config = {
    idle: {
      core: "border-cyan-900 shadow-[0_0_30px_rgba(0,150,255,0.3)] animate-breathe",
      ripples: "border-cyan-500/10",
      rippleCount: 3,
      rippleDelay: 1.2,
    },
    talking: {
      core: "border-cyan-400 shadow-[0_0_60px_rgba(0,255,255,0.7)] scale-110 animate-breathe",
      ripples: "border-cyan-300/40",
      rippleCount: 5, // Más ondas = más actividad
      rippleDelay: 0.5, // Ondas más seguidas
    },
    listening: {
      core: "border-violet-500 shadow-[0_0_50px_rgba(150,0,255,0.6)] scale-105 animate-pulse",
      ripples: "border-violet-400/30",
      rippleCount: 4,
      rippleDelay: 0.8,
    },
    warning: {
      core: "border-yellow-500 shadow-[0_0_60px_rgba(255,200,0,0.7)] scale-110 animate-breathe",
      ripples: "border-yellow-400/50",
      rippleCount: 6,
      rippleDelay: 0.4, // Muy rápido
    },
    alert: {
      core: "border-red-600 shadow-[0_0_80px_rgba(255,0,0,0.9)] scale-125 animate-pulse",
      ripples: "border-red-500/70",
      rippleCount: 8, // Máxima alerta
      rippleDelay: 0.2, // Caótico
    },
  }[state];

  return (
    <div className="relative flex items-center justify-center w-full h-96 transition-all duration-1000">
      
      {/* 0. Motor de Partículas Cuánticas (Base) */}
      <QuantumOrganicNucleus state={state} audioLevel={audioLevel} />

      {/* 2. Capas de Ondas de Energía (Reacción Exagerada) */}
      {[...Array(config.rippleCount)].map((_, i) => (
        <div
          key={i}
          className={`absolute rounded-full border-[1px] opacity-0 ${config.ripples} ${state !== 'idle' ? 'animate-ripple-organic' : ''}`}
          style={{
            animationDelay: `${i * config.rippleDelay}s`,
            width: '120px',
            height: '120px',
            filter: 'blur(2px)' // Suaviza para que parezca energía, no una línea
          }}
        />
      ))}

      {/* 3. Horizonte de Eventos (Giro Errático) */}
      <div className={`absolute w-48 h-48 rounded-full border-t-2 border-b-2 border-l-transparent border-r-transparent animate-spin-erratic ${config.ripples} opacity-20`} />

      {/* 4. El Núcleo Central (El Agujero Negro "Vivo") */}
      <div className={`
        relative z-10 w-32 h-32 rounded-full bg-black
        flex items-center justify-center border-2 transition-all duration-700 ease-[cubic-bezier(0.19, 1, 0.22, 1)]
        ${config.core} shadow-[inset_0_0_20px_rgba(0,0,0,1)]
      `}>
        {/* Efecto de horizonte de eventos (Giro sutil interno) */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-500/5 to-transparent animate-spin-slow opacity-30" />
        
        {/* Singularidad central que late */}
        <div className={`w-3 h-3 rounded-full bg-white/60 blur-[1px] ${state !== 'idle' ? 'animate-ping' : ''}`} />
      </div>
    </div>
  );
}
