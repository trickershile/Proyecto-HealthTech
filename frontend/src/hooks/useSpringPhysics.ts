"use client";
 
import { useState, useRef, useEffect } from 'react';
 
// Constantes de física de muelle
const SPRING_K = 0.1;   // Rigidez del muelle (0.01 a 0.5)
const DAMPING = 0.8;    // Fricción/amortiguación (0.5 a 0.95)
 
export function useSpringPhysics() {
  const [position, setPosition] = useState({ x: 0, y: 0, stretchX: 0, stretchY: 0 });
  
  // Referencias para no causar re-renders
  const targetRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const currentPosRef = useRef({ x: 0, y: 0 });
  const isDownRef = useRef(false);
 
  useEffect(() => {
    // 1. Escuchamos el mouse
    const onMouseMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
    };
    
    // Para el efecto de estirar al clickear
    const onMouseDown = () => { isDownRef.current = true; };
    const onMouseUp = () => { isDownRef.current = false; };
 
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
 
    // 2. El Bucle de Física (Spring Damping)
    let animationFrameId: number;
    const animate = () => {
      // Cálculo de fuerza de muelle (Atracción)
      const ax = (targetRef.current.x - currentPosRef.current.x) * SPRING_K;
      const ay = (targetRef.current.y - currentPosRef.current.y) * SPRING_K;
 
      // Cálculo de fricción (Damping)
      velocityRef.current.x = (velocityRef.current.x + ax) * DAMPING;
      velocityRef.current.y = (velocityRef.current.y + ay) * DAMPING;
 
      // Actualización de posición
      currentPosRef.current.x += velocityRef.current.x;
      currentPosRef.current.y += velocityRef.current.y;
 
      // Modificamos la elasticidad si está clickeado (estiramiento)
      const stretchFactor = isDownRef.current ? 1.5 : 1;
      
      setPosition({
        x: currentPosRef.current.x,
        y: currentPosRef.current.y,
        stretchX: velocityRef.current.x * stretchFactor, // Exponemos la velocidad para deformar visualmente
        stretchY: velocityRef.current.y * stretchFactor
      });
 
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
 
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);
 
  return position;
}
