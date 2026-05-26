"use client"; 
 import React, { useRef, useEffect } from 'react'; 
 import * as THREE from 'three'; 
 
 // --- CONFIGURACIÓN DE OPTIMIZACIÓN EXTREMA ---
 const PARTICLE_COUNT = 40; 
 const FLOATING_PARTICLES_COUNT = 100;
 const MOUSE_LERP = 0.08;
 const REACTION_FORCE = 0.45;
 
 const QuantumOrganicNucleus: React.FC<{ state: string, audioLevel?: number, doseMissedHours?: number | null, labPhase?: 'idle' | 'absorption' | 'distribution' | 'metabolism' | 'excretion' | 'interaction', interactionStrength?: number, halfLifeHours?: number | null }> = ({ state, audioLevel = 0, doseMissedHours = null, labPhase = 'idle', interactionStrength = 0, halfLifeHours = null }) => { 
   const mountRef = useRef<HTMLDivElement>(null); 
   const mouseRef = useRef(new THREE.Vector2(0, 0)); 
   const lerpMouseRef = useRef(new THREE.Vector2(0, 0));
   
   // Referencias persistentes para evitar recrear la escena
   const refs = useRef<{
     renderer?: THREE.WebGLRenderer;
     scene?: THREE.Scene;
     camera?: THREE.PerspectiveCamera;
     nucleusMaterial?: THREE.ShaderMaterial;
     auraMaterial?: THREE.ShaderMaterial;
     coreMesh?: THREE.Mesh;
     auraMesh?: THREE.Mesh;
     points?: THREE.Points;
     floatingPoints?: THREE.Points;
     mainGroup?: THREE.Group;
     frameId?: number;
     time: number;
     lastTime: number;
     latestState: string;
     latestDoseMissedHours: number | null;
     latestLabPhase: 'idle' | 'absorption' | 'distribution' | 'metabolism' | 'excretion' | 'interaction';
     latestInteractionStrength: number;
     latestHalfLifeHours: number | null;
     latestAudio: number;
     smoothedAudio: number;
     hoverTarget: number;
     grabTarget: number;
     hoverStrength: number;
     grabStrength: number;
     floatingBase?: Float32Array;
     floatingVel?: Float32Array;
     floatingPhaseT: number;
     splitMix: number;
     baseNucleusColor?: THREE.Color;
     baseAuraColor?: THREE.Color;
   }>({
     time: 0,
     lastTime: performance.now(),
     latestState: state,
     latestDoseMissedHours: doseMissedHours,
     latestLabPhase: labPhase,
     latestInteractionStrength: interactionStrength,
     latestHalfLifeHours: halfLifeHours,
     latestAudio: audioLevel,
     smoothedAudio: 0,
     hoverTarget: 0,
     grabTarget: 0,
     hoverStrength: 0,
     grabStrength: 0,
     floatingPhaseT: 0,
     splitMix: 0,
   });
 
   // 1. INICIALIZACIÓN ÚNICA DE LA ESCENA
   useEffect(() => { 
    const container = mountRef.current;
    if (!container) return; 
 
     const scene = new THREE.Scene(); 
     const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000); 
     camera.position.z = 2.5; 
 
     const renderer = new THREE.WebGLRenderer({ 
       antialias: false,
       alpha: true,
       powerPreference: "high-performance" 
     }); 
     renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
     renderer.setSize(400, 400); 
    container.appendChild(renderer.domElement); 
 
     // Grupo principal para inclinación global
     const mainGroup = new THREE.Group();
     scene.add(mainGroup);
 
     // Material del núcleo (GPU Shaders)
     const nucleusMaterial = new THREE.ShaderMaterial({
       uniforms: {
         time: { value: 0 },
         mouse: { value: new THREE.Vector3(0, 0, 0) },
         color: { value: new THREE.Color(0x00cccc) },
         colorA: { value: new THREE.Color(0x22c55e) },
         colorB: { value: new THREE.Color(0xa855f7) },
         splitMix: { value: 0.0 },
         interactionStrength: { value: 0.0 },
         audioLevel: { value: 0.0 },
         isAlert: { value: 0.0 },
         brightness: { value: 1.0 },
         reactionForce: { value: REACTION_FORCE },
         hoverStrength: { value: 0.0 },
         grabStrength: { value: 0.0 },
       },
       vertexShader: `
         uniform float time;
         uniform vec3 mouse;
         uniform float audioLevel;
         uniform float isAlert;
         uniform float reactionForce;
         uniform float hoverStrength;
         uniform float grabStrength;
         uniform float interactionStrength;
         varying float vNoise;
         varying vec3 vPos;
         
         void main() {
           vec3 pos = position;
           
           // Estética de fluido denso y estable
           float speed = 1.0 + audioLevel * 0.4;
           float noise = sin(pos.x * 2.5 + time * speed) * cos(pos.y * 2.2 + time * 0.6);
           noise += sin(pos.z * 2.8 + time * 0.8 * speed) * cos(pos.x * 1.5 + time * 0.5);
           noise += sin(time * 1.2 + length(pos) * 2.5) * (0.1 + audioLevel * 0.15);
           
           // INTERACCIÓN MAGNÉTICA (Grab/Pull)
           float dist = distance(pos, mouse);
           float repulsion = pow(max(0.0, 1.6 - dist), 2.5) * (0.25 + hoverStrength * 0.75);
           
           // Efecto de "agarrar" extremos: Desplazamiento direccional hacia el mouse
           vec3 dirToMouse = normalize(mouse - pos);
           float grabInfluence = pow(max(0.0, 2.0 - dist), 3.0);
           vec3 grabVec = dirToMouse * grabInfluence * reactionForce * 0.6 * grabStrength;
           
           // Movimiento "Respiración Confiada"
           float pulse = sin(time * (isAlert > 0.5 ? 6.0 : 1.5)) * 0.04;
           float talkVibe = audioLevel * sin(time * 8.0) * 0.03;
           float shock = interactionStrength * (sin(time * 22.0 + pos.y * 7.0) * 0.08 + cos(time * 18.0 + pos.x * 6.0) * 0.08);
           
           // Combinación final: Posición base * factor + vector de arrastre
           float factor = 1.0 + (noise * 0.12) + pulse + talkVibe + (repulsion * reactionForce) + shock;
           vec3 newPos = pos * factor + grabVec;
           
           vNoise = noise;
           vPos = newPos;
           gl_PointSize = (5.0 + audioLevel * 3.0) * (1.0 / length(modelViewMatrix * vec4(newPos, 1.0)));
           gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
         }
       `,
       fragmentShader: `
         uniform vec3 color;
         uniform vec3 colorA;
         uniform vec3 colorB;
         uniform float splitMix;
         uniform float brightness;
         varying float vNoise;
         varying vec3 vPos;
         void main() {
           float strength = 1.0 - distance(gl_PointCoord, vec2(0.5));
           strength = pow(strength, 3.5);
           float side = step(0.0, vPos.x);
           vec3 splitColor = mix(colorA, colorB, side);
           vec3 baseColor = mix(color, color * 1.5, vNoise * 0.5 + 0.5);
           vec3 finalColor = mix(baseColor, splitColor, splitMix);
           gl_FragColor = vec4(finalColor * brightness, strength * 0.9 * brightness);
         }
       `,
       transparent: true, blending: THREE.AdditiveBlending, depthTest: false
     });
 
     const geometry = new THREE.IcosahedronGeometry(1, PARTICLE_COUNT); 
     const points = new THREE.Points(geometry, nucleusMaterial); 
     mainGroup.add(points); 
 
     const coreGeo = new THREE.SphereGeometry(0.38, 16, 16);
     const coreMat = new THREE.MeshBasicMaterial({ color: 0x001a1a, transparent: true, opacity: 0.95 });
     const coreMesh = new THREE.Mesh(coreGeo, coreMat);
     mainGroup.add(coreMesh);
 
     const auraMat = new THREE.ShaderMaterial({
       uniforms: { 
         time: { value: 0 }, 
         color: { value: new THREE.Color(0x00ffff) },
         audioLevel: { value: 0.0 },
         brightness: { value: 1.0 }
       },
       vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
       fragmentShader: `varying vec3 vNormal; uniform float time; uniform vec3 color; uniform float audioLevel; uniform float brightness; void main() { float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 4.5); gl_FragColor = vec4(color * brightness, intensity * (0.35 + audioLevel * 0.4 + sin(time * 2.5) * 0.15) * brightness); }`,
       transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide
     });
     const auraMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 24), auraMat);
     mainGroup.add(auraMesh);
 
     const floatGeo = new THREE.BufferGeometry();
     const floatPos = new Float32Array(FLOATING_PARTICLES_COUNT * 3);
     const floatBase = new Float32Array(FLOATING_PARTICLES_COUNT * 3);
     const floatVel = new Float32Array(FLOATING_PARTICLES_COUNT * 3);
     for(let i = 0; i < FLOATING_PARTICLES_COUNT; i++) {
       floatPos[i*3] = (Math.random() - 0.5) * 4.5;
       floatPos[i*3+1] = (Math.random() - 0.5) * 4.5;
       floatPos[i*3+2] = (Math.random() - 0.5) * 2;
       floatBase[i*3] = floatPos[i*3];
       floatBase[i*3+1] = floatPos[i*3+1];
       floatBase[i*3+2] = floatPos[i*3+2];
       floatVel[i*3] = (Math.random() - 0.5) * 0.006;
       floatVel[i*3+1] = (Math.random() - 0.5) * 0.006;
       floatVel[i*3+2] = (Math.random() - 0.5) * 0.003;
     }
     floatGeo.setAttribute('position', new THREE.BufferAttribute(floatPos, 3));
     const floatingPoints = new THREE.Points(floatGeo, new THREE.PointsMaterial({ size: 0.007, color: 0x44ffff, transparent: true, opacity: 0.4 }));
     scene.add(floatingPoints);
 
     refs.current = {
       ...refs.current,
       renderer, scene, camera, nucleusMaterial, auraMaterial: auraMat, coreMesh, auraMesh, points, floatingPoints, mainGroup, floatingBase: floatBase, floatingVel: floatVel
     };
 
     const updateMouseFromClient = (clientX: number, clientY: number) => {
       const rect = container.getBoundingClientRect();
       const x = ((clientX - rect.left) / rect.width) * 2 - 1;
       const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
       mouseRef.current.x = THREE.MathUtils.clamp(x, -1, 1);
       mouseRef.current.y = THREE.MathUtils.clamp(y, -1, 1);
     };

     const onPointerEnter = () => {
       refs.current.hoverTarget = 1;
     };
     const onPointerLeave = () => {
       refs.current.hoverTarget = 0;
       refs.current.grabTarget = 0;
     };
     const onPointerMove = (e: PointerEvent) => {
       refs.current.hoverTarget = 1;
       updateMouseFromClient(e.clientX, e.clientY);
     };
     const onPointerDown = (e: PointerEvent) => {
       refs.current.hoverTarget = 1;
       refs.current.grabTarget = 1;
       updateMouseFromClient(e.clientX, e.clientY);
       container?.setPointerCapture?.(e.pointerId);
     };
     const onPointerUp = (e: PointerEvent) => {
       refs.current.grabTarget = 0;
       container?.releasePointerCapture?.(e.pointerId);
     };
     const onPointerCancel = (e: PointerEvent) => {
       refs.current.grabTarget = 0;
       container?.releasePointerCapture?.(e.pointerId);
     };

     container.addEventListener('pointerenter', onPointerEnter);
     container.addEventListener('pointerleave', onPointerLeave);
     container.addEventListener('pointermove', onPointerMove);
     container.addEventListener('pointerdown', onPointerDown);
     window.addEventListener('pointerup', onPointerUp);
     window.addEventListener('pointercancel', onPointerCancel);
 
     const animate = () => { 
       const currentTime = performance.now(); 
       refs.current.lastTime = currentTime; 
       
       const { renderer, scene, camera, nucleusMaterial, auraMaterial, coreMesh, auraMesh, points, floatingPoints, mainGroup } = refs.current;
       if (!renderer || !scene || !camera) return;
 
       // 1. CONTROL DE VELOCIDAD DEL TIEMPO
       let timeSpeed = 0.01; 
       const currentState = refs.current.latestState;
       if (currentState === 'talking') timeSpeed = 0.0036; 
       else if (currentState === 'warning') timeSpeed = 0.014;
       else if (currentState === 'alert') timeSpeed = 0.02; 
       timeSpeed *= 0.65;
       refs.current.time += timeSpeed; 
       const time = refs.current.time;
 
       lerpMouseRef.current.x = THREE.MathUtils.lerp(lerpMouseRef.current.x, mouseRef.current.x, MOUSE_LERP);
       lerpMouseRef.current.y = THREE.MathUtils.lerp(lerpMouseRef.current.y, mouseRef.current.y, MOUSE_LERP);
       const m = new THREE.Vector3(lerpMouseRef.current.x, lerpMouseRef.current.y, 0.5).unproject(camera);
 
       refs.current.hoverStrength += (refs.current.hoverTarget - refs.current.hoverStrength) * 0.12;
       refs.current.grabStrength += (refs.current.grabTarget - refs.current.grabStrength) * 0.18;

       // INCLINACIÓN GLOBAL (Whole object reaction)
       if (mainGroup) {
         const tilt = 0.3 * refs.current.hoverStrength;
         mainGroup.rotation.x = THREE.MathUtils.lerp(mainGroup.rotation.x, -lerpMouseRef.current.y * tilt, 0.1);
         mainGroup.rotation.y = THREE.MathUtils.lerp(mainGroup.rotation.y, lerpMouseRef.current.x * tilt, 0.1);
       }
 
       const baseAudioTarget = currentState === 'talking' ? refs.current.latestAudio * 0.35 : refs.current.latestAudio;
      const audioTarget = baseAudioTarget * 0.6;
       const audioFollow = currentState === 'talking' ? 0.22 : 0.08;
       refs.current.smoothedAudio += (audioTarget - refs.current.smoothedAudio) * audioFollow;
       const smoothAudio = refs.current.smoothedAudio;

       // 2. CONFIGURACIÓN DE ESCALA Y REACCIÓN SEGÚN ESTADO 
       let targetScale = 1.0; 
       let currentReactionForce = REACTION_FORCE; 
 
       if (currentState === 'alert' || currentState === 'warning') { 
         targetScale = 1.1 + Math.sin(time * 12) * 0.03; 
         currentReactionForce = REACTION_FORCE * 1.5; 
       } else if (currentState === 'talking') { 
         // EL SECRETO ORGÁNICO: Combinamos dos ondas a diferentes velocidades 
         const voiceCadence = (Math.sin(time * 4.0) + Math.cos(time * 2.5)) * 0.015; 
         targetScale = 1.02 + voiceCadence + (smoothAudio * 0.03); 
         currentReactionForce = REACTION_FORCE * 0.1; 
       } else if (currentState === 'listening') { 
         targetScale = 1.03; 
         currentReactionForce = REACTION_FORCE * 1.2; 
       } 
       currentReactionForce *= 0.75;
 
       // 3. EL AMORTIGUADOR (Signal Damping) 
       if (points) {
         points.scale.x += (targetScale - points.scale.x) * 0.04; 
         points.scale.y += (targetScale - points.scale.y) * 0.04; 
         points.scale.z += (targetScale - points.scale.z) * 0.04; 
       }
 
       // Sincronizar escala del núcleo sólido, aura y partículas flotantes
       if (coreMesh) coreMesh.scale.copy(points!.scale);
       if (auraMesh) auraMesh.scale.set(points!.scale.x * 1.05, points!.scale.y * 1.05, points!.scale.z * 1.05);
       if (floatingPoints) floatingPoints.scale.copy(points!.scale);
 
       // Actualizar Uniforms
       if (nucleusMaterial) {
         const hours = refs.current.latestDoseMissedHours;
         const drop = typeof hours === 'number' && Number.isFinite(hours)
           ? Math.min(0.65, (Math.max(0, hours) / 12) * 0.55)
           : 0;
         const halfLife = refs.current.latestHalfLifeHours;
         const decay = 1;
         const brightness = Math.max(0.18, (1 - drop) * decay);
         refs.current.splitMix += ((Math.max(0, Math.min(1, refs.current.latestInteractionStrength))) - refs.current.splitMix) * 0.12;
         const baseNucleusColor = refs.current.baseNucleusColor;
         const baseAuraColor = refs.current.baseAuraColor;
         if (baseNucleusColor) nucleusMaterial.uniforms.color.value.copy(baseNucleusColor);
         if (baseAuraColor && auraMaterial) auraMaterial.uniforms.color.value.copy(baseAuraColor);
         nucleusMaterial.uniforms.time.value = time;
         nucleusMaterial.uniforms.mouse.value.copy(m);
         nucleusMaterial.uniforms.reactionForce.value = currentReactionForce * (1 + refs.current.latestInteractionStrength * 0.9);
         nucleusMaterial.uniforms.audioLevel.value = smoothAudio;
         nucleusMaterial.uniforms.hoverStrength.value = refs.current.hoverStrength;
         nucleusMaterial.uniforms.grabStrength.value = refs.current.grabStrength;
         nucleusMaterial.uniforms.brightness.value = brightness;
         nucleusMaterial.uniforms.splitMix.value = refs.current.splitMix;
         nucleusMaterial.uniforms.interactionStrength.value = refs.current.latestInteractionStrength;
       }
       if (auraMaterial) {
         auraMaterial.uniforms.time.value = time;
         auraMaterial.uniforms.audioLevel.value = smoothAudio;
         auraMaterial.uniforms.brightness.value = nucleusMaterial ? nucleusMaterial.uniforms.brightness.value : 1.0;
       }
 
       if (points) {
         points.rotation.y += 0.0008 + smoothAudio * 0.002 + refs.current.latestInteractionStrength * 0.004;
         points.rotation.z += 0.0003;
       }
       if (floatingPoints) {
         floatingPoints.rotation.y += 0.0001 + smoothAudio * 0.0005 + refs.current.latestInteractionStrength * 0.001;
         const attr = (floatingPoints.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
         const p = attr.array as Float32Array;
         const base = refs.current.floatingBase;
         const vel = refs.current.floatingVel;
         const phase = refs.current.latestLabPhase;
         if (base && vel) {
           const tPrev = refs.current.floatingPhaseT;
           refs.current.floatingPhaseT = phase === 'idle' ? 0 : (tPrev + 0.01);
           const phaseT = refs.current.floatingPhaseT;
           for (let i = 0; i < FLOATING_PARTICLES_COUNT; i++) {
             const ix = i * 3;
             let x = p[ix];
             let y = p[ix + 1];
             let z = p[ix + 2];
             x += vel[ix];
             y += vel[ix + 1];
             z += vel[ix + 2];
             if (phase === 'absorption') {
               x += (0 - x) * 0.03;
               y += (0 - y) * 0.03;
               z += (0 - z) * 0.03;
             } else if (phase === 'distribution') {
               const len = Math.max(0.001, Math.sqrt(x * x + y * y + z * z));
               x += (x / len) * 0.02;
               y += (y / len) * 0.02;
               z += (z / len) * 0.012;
             } else if (phase === 'excretion') {
               const pull = Math.exp(-phaseT * 0.12);
               x += (base[ix] - x) * 0.02 * pull;
               y += (base[ix + 1] - y) * 0.02 * pull;
               z += (base[ix + 2] - z) * 0.02 * pull;
             } else if (phase === 'interaction') {
               x += Math.sin(time * 18 + y * 1.3) * 0.05;
               y += Math.cos(time * 16 + x * 1.2) * 0.05;
               z += Math.sin(time * 14 + z * 1.4) * 0.03;
             } else {
               x += (base[ix] - x) * 0.01;
               y += (base[ix + 1] - y) * 0.01;
               z += (base[ix + 2] - z) * 0.01;
             }
             p[ix] = x;
             p[ix + 1] = y;
             p[ix + 2] = z;
           }
           attr.needsUpdate = true;
         }
       }
       
       renderer.render(scene, camera); 
       refs.current.frameId = requestAnimationFrame(animate); 
     }; 
 
     animate(); 
 
     return () => { 
       container.removeEventListener('pointerenter', onPointerEnter);
       container.removeEventListener('pointerleave', onPointerLeave);
       container.removeEventListener('pointermove', onPointerMove);
       container.removeEventListener('pointerdown', onPointerDown);
       window.removeEventListener('pointerup', onPointerUp);
       window.removeEventListener('pointercancel', onPointerCancel);
       if (refs.current.frameId) cancelAnimationFrame(refs.current.frameId);
       renderer.dispose();
       geometry.dispose(); nucleusMaterial.dispose();
       coreGeo.dispose(); coreMat.dispose();
       auraMesh.geometry.dispose(); auraMat.dispose();
       floatGeo.dispose(); floatingPoints.material.dispose();
       if (mainGroup) scene.remove(mainGroup);
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
     }; 
   }, []); // ARRAY DE DEPENDENCIAS VACÍO: Solo se ejecuta una vez
 
   // 2. ACTUALIZACIÓN DE UNIFORMS (Sin recrear la escena)
   useEffect(() => {
     const { nucleusMaterial, auraMaterial, coreMesh, floatingPoints } = refs.current;
     if (!nucleusMaterial || !auraMaterial) return;
 
     refs.current.latestState = state;
     const isAlert = state === 'alert';
     const isTalking = state === 'talking';
     const mainColor = new THREE.Color(
       isAlert ? 0xff1111 :
      state === 'warning' ? 0xffd6a5 :
      isTalking ? 0x8af8e2 :
      0x7adcff
     );
     const coreColor = new THREE.Color(isAlert ? 0x440000 : 0x001a1a);
     const particleColor = new THREE.Color(
       isAlert ? 0xff4444 :
      state === 'warning' ? 0xffe3c2 :
      0xc6fff2
     );
 
     nucleusMaterial.uniforms.color.value.copy(mainColor);
     nucleusMaterial.uniforms.isAlert.value = isAlert ? 1.0 : 0.0;
     auraMaterial.uniforms.color.value.copy(mainColor);
    refs.current.baseNucleusColor = mainColor.clone();
    refs.current.baseAuraColor = mainColor.clone();
     
     if (coreMesh) (coreMesh.material as THREE.MeshBasicMaterial).color.copy(coreColor);
     if (floatingPoints) (floatingPoints.material as THREE.PointsMaterial).color.copy(particleColor);
  }, [state]);
 
   useEffect(() => {
     refs.current.latestAudio = audioLevel;
   }, [audioLevel]);
 
  useEffect(() => {
    refs.current.latestDoseMissedHours = doseMissedHours;
  }, [doseMissedHours]);

  useEffect(() => {
    refs.current.latestLabPhase = labPhase;
    refs.current.floatingPhaseT = 0;
  }, [labPhase]);

  useEffect(() => {
    refs.current.latestInteractionStrength = Math.max(0, Math.min(1, interactionStrength));
  }, [interactionStrength]);

  useEffect(() => {
    refs.current.latestHalfLifeHours = halfLifeHours;
  }, [halfLifeHours]);

  const ringRgb =
    state === 'alert'
      ? '239,68,68'
      : state === 'warning'
        ? '251,191,36'
        : '52,211,153';

   return (
     <div className="relative flex items-center justify-center">
        <div className={`absolute w-80 h-80 rounded-full blur-[110px] transition-all duration-300 
          ${state === 'alert' ? 'bg-red-600 opacity-30 scale-125' : 
            state === 'talking' ? 'bg-emerald-300 opacity-30 scale-110' : 
            'bg-emerald-400 opacity-12'}`} 
          style={{
            transform: `scale(${1 + audioLevel * 0.5})`,
            opacity: 0.1 + audioLevel * 0.5
          }}
        />
        <div
          className="absolute z-[5] w-48 h-48 rounded-full pointer-events-none"
          style={{
            ['--ring' as any]: ringRgb,
            backgroundImage:
              'radial-gradient(circle at center, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.60) 38%, rgba(0,0,0,0.18) 56%, rgba(0,0,0,0) 72%), radial-gradient(circle at center, rgba(0,0,0,0) 58%, rgba(var(--ring),0.12) 62%, rgba(0,0,0,0) 68%)',
            boxShadow: 'inset 0 0 24px rgba(0,0,0,0.55)',
            opacity: 0.55,
            transform: `scale(${0.98 + audioLevel * 0.06})`,
          }}
        />
        <div ref={mountRef} className="z-10 mix-blend-screen" /> 
     </div>
   ); 
 };
 
 export default React.memo(QuantumOrganicNucleus);
