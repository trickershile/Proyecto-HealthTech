"use client";
 
import React from 'react';
import { useSpringPhysics } from '@/hooks/useSpringPhysics';
 
export default function ReactiveCursor() {
  const { x, y, stretchX, stretchY } = useSpringPhysics();
 
  const angle = Math.atan2(stretchY, stretchX);
  const rotationDegrees = angle * (180 / Math.PI);
 
  const stretchAmount = Math.sqrt(stretchX * stretchX + stretchY * stretchY) * 0.01;
  const scaleX = 1 + stretchAmount;
  const scaleY = 1 - stretchAmount * 0.5;
 
  return (
    <div
      className="fixed top-0 left-0 w-6 h-6 z-50 pointer-events-none origin-center"
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
      }}
    >
      <div
        className="w-full h-full bg-cyan-400 rounded-full blur-[2px] shadow-[0_0_15px_rgba(34,211,238,0.7)] transition-transform duration-75 ease-out"
        style={{
          transform: `rotate(${rotationDegrees}deg) scale(${scaleX}, ${scaleY})`,
        }}
      />
    </div>
  );
}
