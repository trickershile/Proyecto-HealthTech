"use client";
import React from 'react';

const EventHorizon = () => {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Resplandor del borde con giro errático */}
      <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full animate-spin-erratic" />
      <div className="absolute inset-0 border border-purple-500/40 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
      
      {/* Efecto de luz distorsionada */}
      <div className="absolute inset-[-50%] bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-45 animate-[pulse_5s_ease-in-out_infinite]" />
    </div>
  );
};

export default EventHorizon;
