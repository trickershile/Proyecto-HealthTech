"use client"; 
 
 import React, { useRef, useEffect, useState } from 'react'; 
 import * as THREE from 'three'; 
 
 // Constantes de física reactiva del núcleo (sin cambios) 
 const LERP_FACTOR = 0.08; 
 const IDLE_RESPIRATION_SPEED = 0.005; 
 const REACTION_FORCE = 0.5; 
 const FIELD_RADIUS = 1.3; 
 
 // Constantes del Polvo de Estrellas Atómico (sin cambios) 
 const DUST_COUNT = 3000; 
 const DUST_LIFE_SPAN = 3.0; 
 const EJECTION_SPEED = 0.15; 
 
 // --- NUEVAS CONSTANTES PARA EL VÓRTICE CÓSMICO (Dando más vida) --- 
 const VORTEX_PARTICLE_COUNT = 5000; // Un disco denso de partículas 
 const VORTEX_INNER_RADIUS = 1.1;    // Donde empieza el disco (justo fuera del núcleo) 
 const VORTEX_OUTER_RADIUS = 2.0;    // Dónde termina el disco 
 
 export default function QuantumParticleNucleus({ 
   state = 'idle', 
   audioVolumeRef 
 }: { 
   state: string; 
   audioVolumeRef?: React.MutableRefObject<number>; 
 }) { 
   const mountRef = useRef<HTMLDivElement>(null); 
   const [colorState, setColorState] = useState(0x00ffff); // Cian 
 
   useEffect(() => { 
    const container = mountRef.current;
    if (!container) return; 
 
     // --- 1. CONFIGURACIÓN DE ESCENA BÁSICA --- 
     const scene = new THREE.Scene(); 
     const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000); 
     camera.position.z = 2.8; // Cámara un poco más atrás para ver el vórtice 
 
     const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); 
     renderer.setPixelRatio(window.devicePixelRatio); 
     renderer.setSize(250, 250); 
    container.appendChild(renderer.domElement); 
 
     // --- 2. SISTEMA 1: El Núcleo Cuántico (La esfera central reactiva) --- 
     const geometry = new THREE.IcosahedronGeometry(1, 15); 
     const material = new THREE.PointsMaterial({ 
       color: colorState, 
       size: 0.025, 
       blending: THREE.AdditiveBlending, 
       transparent: true, 
       depthTest: false, 
     }); 
     const points = new THREE.Points(geometry, material); 
     scene.add(points); 
 
     // --- 3. SISTEMA 2: El Polvo de Estrellas Atómico (Efecto de Dispersión) --- 
     // ... (Este bloque se queda exactamente igual) ... 
     const dustGeometry = new THREE.BufferGeometry(); 
     const dustPositions = new Float32Array(DUST_COUNT * 3); 
     const dustVelocities = new Float32Array(DUST_COUNT * 3); 
     const dustLives = new Float32Array(DUST_COUNT); 
     for (let i = 0; i < DUST_COUNT; i++) { 
       dustPositions[i * 3] = 0; dustPositions[i * 3 + 1] = 0; dustPositions[i * 3 + 2] = 0; dustLives[i] = -1; 
     } 
     dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)); 
     dustGeometry.setAttribute('life', new THREE.BufferAttribute(dustLives, 1)); 
     const dustMaterial = new THREE.PointsMaterial({ 
       color: 0xffffff, size: 0.015, blending: THREE.AdditiveBlending, transparent: true, opacity: 1, depthTest: false, 
     }); 
     const dustPoints = new THREE.Points(dustGeometry, dustMaterial); 
     scene.add(dustPoints); 
 
     // --- 4. NUEVO SISTEMA 3: El Vórtice Cósmico (El Disco de Vida) --- 
     const vortexGeometry = new THREE.BufferGeometry(); 
     const vortexPositions = new Float32Array(VORTEX_PARTICLE_COUNT * 3); 
     const vortexColors = new Float32Array(VORTEX_PARTICLE_COUNT * 3); // Colores variables 
 
     const tempColor = new THREE.Color(); 
 
     for (let i = 0; i < VORTEX_PARTICLE_COUNT; i++) { 
       // C.1. Matemáticas Polares para crear un anillo 
       // Un radio aleatorio entre el radio interno y externo 
       const distance = VORTEX_INNER_RADIUS + Math.random() * (VORTEX_OUTER_RADIUS - VORTEX_INNER_RADIUS); 
       // Un ángulo aleatorio de 0 a 360 grados (2PI) 
       const angle = Math.random() * Math.PI * 2; 
 
       vortexPositions[i * 3] = distance * Math.cos(angle); // X = radio * cos(ángulo) 
       vortexPositions[i * 3 + 1] = distance * Math.sin(angle); // Y = radio * sin(ángulo) 
       vortexPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.1; // Z muy bajito, para un disco plano con grosor 
 
       // C.2. Colores Variables sutiles (cian con destellos blancos) 
       const brightness = 0.7 + Math.random() * 0.3; // De 0.7 a 1.0 (brillante) 
       tempColor.setHSL(0.5, 1.0, brightness); // Tono cian, saturación total, luminosidad brillante 
       
       // A veces, hacemos que la partícula sea puramente blanca (destello) 
       if (Math.random() < 0.1) tempColor.set(0xffffff); 
 
       vortexColors[i * 3] = tempColor.r; 
       vortexColors[i * 3 + 1] = tempColor.g; 
       vortexColors[i * 3 + 2] = tempColor.b; 
     } 
     
     vortexGeometry.setAttribute('position', new THREE.BufferAttribute(vortexPositions, 3)); 
     vortexGeometry.setAttribute('color', new THREE.BufferAttribute(vortexColors, 3)); // Activamos colores por vértice 
 
     const vortexMaterial = new THREE.PointsMaterial({ 
       size: 0.012, // Partículas muy pequeñas 
       blending: THREE.AdditiveBlending, 
       transparent: true, 
       opacity: 0.6, // Sutil 
       vertexColors: true, // ¡Vital! Usar los colores del atributo anterior 
       depthTest: false, 
     }); 
     
     const vortexPoints = new THREE.Points(vortexGeometry, vortexMaterial); 
     // Giramos el plano del vórtice 30 grados para darle perspectiva 
     vortexPoints.rotation.x = Math.PI / 6; 
     scene.add(vortexPoints); 
 
     // --- 5. LÓGICA DE FÍSICA Y REACCIÓN --- 
     // ... (Todo este bloque de física se queda igual) ... 
     const originalPositions = geometry.attributes.position.array.slice(); 
     const vertexPos = new THREE.Vector3(); 
     const originalPos = new THREE.Vector3(); 
     const mousePosScene = new THREE.Vector3(); 
     const forceVec = new THREE.Vector3(); 
     const mouse = new THREE.Vector2(); 
     let time = 0; 
     let lastTime = performance.now(); 
     const onMouseMove = (event: MouseEvent) => { 
       mouse.x = (event.clientX / window.innerWidth) * 2 - 1; 
       mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; 
     }; 
     window.addEventListener('mousemove', onMouseMove); 
 
     // --- 6. BUCLE DE ANIMACIÓN PRINCIPAL (Física Cuántica y Vórtice) --- 
     const animate = () => { 
       const currentTime = performance.now(); 
       const dt = (currentTime - lastTime) / 1000; 
       lastTime = currentTime; 
 
       // Si está hablando, el tiempo fluye más lento para que las ondas sean suaves 
       let timeSpeed = 0.01; 
       if (state === 'talking') timeSpeed = 0.004; 
       else if (state === 'alert') timeSpeed = 0.02; 
       time += timeSpeed; 
 
       // --- A. FÍSICA DEL NÚCLEO Y EL POLVO (Sin cambios) --- 
       mousePosScene.set(mouse.x, mouse.y, 0).unproject(camera); 
       mousePosScene.z = 0.5; 
 
       const rawVolume = audioVolumeRef ? audioVolumeRef.current : 0; 
       const micIntensity = rawVolume * 1.5; 
       const positions = geometry.attributes.position; 
 
       let targetScale = 1; 
       let currentReactionForce = REACTION_FORCE; 
 
       if (state === 'talking') { 
         const voiceCadence = (Math.sin(time * 4) + Math.cos(time * 2.5)) * 0.015; 
         targetScale = 1.02 + voiceCadence; 
         currentReactionForce = REACTION_FORCE * 0.1; 
       } else if (state === 'listening') { 
         targetScale = 1.02 + micIntensity; 
       } else if (state === 'alert' || state === 'warning') { 
         targetScale = 1.1 + Math.sin(time * 12) * 0.03; 
         currentReactionForce = REACTION_FORCE * 1.5; 
       } 
 
       points.scale.x += (targetScale - points.scale.x) * 0.15; 
       points.scale.y += (targetScale - points.scale.y) * 0.15; 
       points.scale.z += (targetScale - points.scale.z) * 0.15; 
 
       for (let i = 0; i < originalPositions.length; i += 3) { 
         vertexPos.set(positions.array[i], positions.array[i + 1], positions.array[i + 2]); 
         originalPos.set(originalPositions[i], originalPositions[i + 1], originalPositions[i + 2]); 
         const dist = vertexPos.distanceTo(mousePosScene); 
         forceVec.set(0, 0, 0); 
         if (dist < FIELD_RADIUS) { 
           const forcePower = (1.0 - (dist / FIELD_RADIUS)) * currentReactionForce; 
           forceVec.subVectors(originalPos, mousePosScene).normalize().multiplyScalar(forcePower); 
         } 
 
         const wave = Math.sin(time + originalPos.x * 2) * IDLE_RESPIRATION_SPEED; 
         originalPos.multiplyScalar(1 + wave); 
 
         positions.array[i] += (originalPos.x + forceVec.x - positions.array[i]) * LERP_FACTOR; 
         positions.array[i+1] += (originalPos.y + forceVec.y - positions.array[i+1]) * LERP_FACTOR; 
         positions.array[i+2] += (originalPos.z + forceVec.z - positions.array[i+2]) * LERP_FACTOR; 
       } 
       positions.needsUpdate = true; 
 
       if (dustPoints) dustPoints.scale.copy(points.scale); 
 
       // (Lógica del Polvo Atómico sin cambios) 
       const dustPosAttr = dustGeometry.attributes.position; 
       const dustLifeAttr = dustGeometry.attributes.life; 
       if (state === 'alert' || state === 'warning') dustMaterial.opacity = 1; 
       else if (state === 'talking') dustMaterial.opacity = 0.6; 
       else dustMaterial.opacity = THREE.MathUtils.lerp(dustMaterial.opacity, 0.2, 0.05); 
       for (let i = 0; i < DUST_COUNT; i++) { 
         if (dustLifeAttr.array[i] < 0) { 
           const isInteracting = mouse.length() > 0.3; 
           const isNucleusActive = state !== 'idle'; 
           if (isNucleusActive && isInteracting && Math.random() < 0.05) { 
             dustLifeAttr.array[i] = DUST_LIFE_SPAN; 
             const originalVertexIdx = Math.floor(Math.random() * (originalPositions.length / 3)) * 3; 
             dustPosAttr.array[i * 3] = originalPositions[originalVertexIdx]; 
             dustPosAttr.array[i * 3 + 1] = originalPositions[originalVertexIdx + 1]; 
             dustPosAttr.array[i * 3 + 2] = originalPositions[originalVertexIdx + 2]; 
             originalPos.set(originalPositions[originalVertexIdx], originalPositions[originalVertexIdx + 1], originalPositions[originalVertexIdx + 2]); 
             originalPos.normalize().multiplyScalar(EJECTION_SPEED + Math.random() * 0.05); 
             dustVelocities[i * 3] = originalPos.x; 
             dustVelocities[i * 3 + 1] = originalPos.y; 
             dustVelocities[i * 3 + 2] = originalPos.z; 
           } 
         } else { 
           dustLifeAttr.array[i] -= dt; 
           dustPosAttr.array[i * 3] += dustVelocities[i * 3] * dt; 
           dustPosAttr.array[i * 3 + 1] += dustVelocities[i * 3 + 1] * dt; 
           dustPosAttr.array[i * 3 + 2] += dustVelocities[i * 3 + 2] * dt; 
           dustVelocities[i * 3] += (Math.random() - 0.5) * 0.005; 
           dustVelocities[i * 3 + 1] += (Math.random() - 0.5) * 0.005; 
           const lifePercentage = dustLifeAttr.array[i] / DUST_LIFE_SPAN; 
           if (lifePercentage < 0.2) { 
             dustLifeAttr.array[i] = -1; 
             dustPosAttr.array[i * 3] = 0; dustPosAttr.array[i * 3 + 1] = 0; dustPosAttr.array[i * 3 + 2] = 0; 
           } 
         } 
       } 
       dustPosAttr.needsUpdate = true; 
       dustLifeAttr.needsUpdate = true; 
 
       // --- B. NUEVA LÓGICA DE ANIMACIÓN DEL VÓRTICE CÓSMICO --- 
       vortexPoints.rotation.z += 0.005; 
       vortexPoints.rotation.x = Math.PI / 6 + Math.sin(time * 0.5) * 0.05; 
 
       if (state === 'alert' || state === 'warning') { 
         vortexMaterial.color.set(state === 'alert' ? 0xff4444 : 0xffaa44); 
         vortexMaterial.opacity = THREE.MathUtils.lerp(vortexMaterial.opacity, 0.4, 0.05); 
       } else { 
         vortexMaterial.color.set(0x00ffff); 
         vortexMaterial.opacity = THREE.MathUtils.lerp(vortexMaterial.opacity, 0.7, 0.05); 
       } 
 
       // Rotaciones constantes del núcleo y el polvo 
       points.rotation.y += 0.002; 
       points.rotation.x += 0.001; 
       dustPoints.rotation.y += 0.001; 
 
       renderer.render(scene, camera); 
       animationId = requestAnimationFrame(animate); 
     }; 
     let animationId = requestAnimationFrame(animate); 
 
     // --- 7. CLEANUP (Asegurarnos de borrar el vórtice) --- 
     return () => { 
       window.removeEventListener('mousemove', onMouseMove); 
       cancelAnimationFrame(animationId); 
       renderer.dispose(); 
       material.dispose(); geometry.dispose(); 
       dustMaterial.dispose(); dustGeometry.dispose(); 
       vortexMaterial.dispose(); vortexGeometry.dispose(); // <-- ¡Nuevos elementos de cleanup! 
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
     }; 
   }, [state, colorState, audioVolumeRef]); 
 
   // useEffect para cambiar el color del núcleo central (sin cambios) 
   useEffect(() => { 
     if (state === 'alert') setColorState(0xff1111); 
     else if (state === 'warning') setColorState(0xffaa00); 
     else setColorState(0x00ffff); 
   }, [state]); 
 
   return ( 
     <div className="relative flex items-center justify-center w-80 h-80"> 
       <div className={`absolute inset-0 rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${state === 'alert' ? 'bg-red-950' : 'bg-cyan-950'}`} /> 
       <div ref={mountRef} className="absolute z-10 w-[250px] h-[250px] mix-blend-screen" /> 
     </div> 
   ); 
 }
