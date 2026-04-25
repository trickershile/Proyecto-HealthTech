"use client";
import React from 'react';

const Ripples = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Ondas expansivas orgánicas */}
      <div className="absolute w-64 h-64 border border-blue-500/20 rounded-full animate-ripple-organic" />
      <div className="absolute w-64 h-64 border border-purple-500/20 rounded-full animate-ripple-organic [animation-delay:0.8s]" />
      <div className="absolute w-64 h-64 border border-blue-500/20 rounded-full animate-ripple-organic [animation-delay:1.6s]" />
      
      {/* Partículas de luz */}
      <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-blue-500/5 to-purple-500/5 rounded-full blur-3xl" />
    </div>
  );
};

export default Ripples;
