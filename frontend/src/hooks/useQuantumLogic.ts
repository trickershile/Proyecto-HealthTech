"use client";
import { useState } from 'react';

// src/hooks/useQuantumLogic.ts

export type QuantumState = 'idle' | 'listening' | 'processing' | 'talking' | 'warning' | 'alert';
export type QuantumMode = 'paciente' | 'alumno';

export interface HUDData {
  biometrics: { hr: string; bp: string; spo2: string };
  molecular: { item1: string; item2: string; item3: string };
}

export function useQuantumLogic() {
  const [aiState, setAiState] = useState<QuantumState>('idle');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [aiFinalResponse, setAiFinalResponse] = useState<string>('');
  const [hudData, setHudData] = useState<HUDData>({
    biometrics: { hr: '72 BPM', bp: '120/80', spo2: '98%' },
    molecular: { item1: 'ESCANEO...', item2: 'NOMINAL', item3: '99.9%' }
  });
  const [drugName, setDrugName] = useState<string>('');
  const [drugName2, setDrugName2] = useState<string>('');
  const [molecularFormula, setMolecularFormula] = useState<string>('');
  const [mechanism, setMechanism] = useState<string>('');
  const [halfLife, setHalfLife] = useState<string>('');
  const [metabolism, setMetabolism] = useState<string>('');
  const [excretion, setExcretion] = useState<string>('');
  const [interaction, setInteraction] = useState<'none' | 'moderate' | 'severe'>('none');

  const processUserInput = async (text: string, modo: QuantumMode = 'paciente') => {
    setAiState('processing');
    setAiResponse('');
    setAiFinalResponse('');
    setDrugName('');
    setDrugName2('');
    setMolecularFormula('');
    setMechanism('');
    setHalfLife('');
    setMetabolism('');
    setExcretion('');
    setInteraction('none');

    try {
      const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
      const payload = {
        pregunta: text,
        modo
      };

      const res = await fetch(`${backendBaseUrl}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Respuesta sin cuerpo de streaming');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assembled = '';
      let done = false;
      setAiState('talking');
      setHudData({
        biometrics: { hr: '72 BPM', bp: '120/80', spo2: '98%' },
        molecular: { item1: 'BACKEND: OK', item2: 'FUENTE: SUPABASE', item3: `MODO: ${modo}` }
      });

      const flushFrame = (frame: string) => {
        const lines = frame.split('\n');
        let event = 'message';
        const dataLines: string[] = [];
        for (const raw of lines) {
          const line = raw.trimEnd();
          if (!line) continue;
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        const dataText = dataLines.join('\n').trim();
        if (event === 'done') {
          done = true;
          return;
        }
        if (event === 'error') {
          try {
            const parsed = JSON.parse(dataText || '{}');
            const msg = typeof parsed?.message === 'string' ? parsed.message : 'Error del backend';
            throw new Error(msg);
          } catch (err) {
            if (err instanceof Error) throw err;
            throw new Error('Error del backend');
          }
        }
        if (event === 'chunk') {
          try {
            const parsed = JSON.parse(dataText || '{}');
            const delta = typeof parsed?.delta === 'string' ? parsed.delta : '';
            if (delta) {
              assembled += delta;
              setAiResponse(assembled);
            }
          } catch {
            return;
          }
        }
      };

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        let idx = buffer.indexOf('\n\n');
        while (idx !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          flushFrame(frame);
          if (done) break;
          idx = buffer.indexOf('\n\n');
        }
      }

      const finalText = assembled.trim();
      if (!finalText) {
        throw new Error('Respuesta vacía del backend');
      }
      setAiResponse(finalText);
      setAiFinalResponse(finalText);

    } catch (error) {
      console.error(error);
      const devDetail =
        process.env.NODE_ENV !== 'production' && error instanceof Error && error.message
          ? `\n\nDetalle: ${error.message}`
          : '';
      setAiState('alert');
      setAiResponse(`Fallo de conexión con la base de datos farmacológica.${devDetail}`);
      setAiFinalResponse('');
      setHudData({
        biometrics: { hr: '72 BPM', bp: '120/80', spo2: '98%' },
        molecular: { item1: 'BACKEND: ERROR', item2: 'REVISA: API', item3: `MODO: ${modo}` }
      });
      setDrugName('');
      setDrugName2('');
      setMolecularFormula('');
      setMechanism('');
      setHalfLife('');
      setMetabolism('');
      setExcretion('');
      setInteraction('none');
    }
  };

  const resetState = () => {
    setAiState('idle');
    setAiResponse('');
    setAiFinalResponse('');
    setDrugName('');
    setDrugName2('');
    setMolecularFormula('');
    setMechanism('');
    setHalfLife('');
    setMetabolism('');
    setExcretion('');
    setInteraction('none');
  };

  return {
    aiState,
    setAiState,
    aiResponse,
    aiFinalResponse,
    drugName,
    drugName2,
    molecularFormula,
    mechanism,
    halfLife,
    metabolism,
    excretion,
    interaction,
    processUserInput,
    resetState,
    hudData
  };
}
