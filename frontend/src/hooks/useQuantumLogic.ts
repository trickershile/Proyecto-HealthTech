"use client";
import { useState } from 'react';

/**
 * Hook principal de UI para el "chat farmacéutico" en el frontend.
 *
 * Responsabilidades:
 * - Mantener el estado de la IA (idle/processing/talking/warning/alert).
 * - Enviar la pregunta al gateway del frontend (POST /api/chat/stream).
 * - Leer streaming SSE y ensamblar el texto final incrementalmente.
 * - Actualizar HUD/indicadores de la interfaz.
 *
 * Importante:
 * - El cliente NO llama al backend directamente.
 * - El cliente NO conoce la INTERNAL_API_KEY; la maneja el gateway en server-side.
 */

export type QuantumState = 'idle' | 'listening' | 'processing' | 'talking' | 'warning' | 'alert';

export interface HUDData {
  biometrics: { hr: string; bp: string; spo2: string };
  molecular: { item1: string; item2: string; item3: string };
}

export type Confidence = 'alta' | 'media' | 'baja';

export type Disambiguation = { question: string; options: string[] };
export type RiskLevel = 'none' | 'warning' | 'alert';
export type RiskInfo = { level: RiskLevel; title: string; message: string };
export type BotiquinItem = { nombre_medicamento: string; categoria: string; risk_level: RiskLevel; ts: number };
export type SpecialCondition = { level: RiskLevel; message: string };
export type SpecialConditions = { pregnancy: SpecialCondition; lactation: SpecialCondition; driving: SpecialCondition };
export type LayoutHint = '' | 'ficha' | 'conversacional';

export type StructuredFichaContent = {
  para_que_sirve: string;
  dosis: string;
  precauciones: string;
  dieta: string;
  efectos: string;
};

export type StructuredConversationalContent = {
  respuesta_directa: string;
  alerta_seguridad: string;
  pasos_a_seguir: string;
};

export type StructuredResponse =
  | { layout: 'ficha'; content: StructuredFichaContent }
  | { layout: 'conversacional'; content: StructuredConversationalContent };

export function useQuantumLogic() {
  // Estados de UI: texto parcial y final, HUD, etc.
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
  const [resolvedMedication, setResolvedMedication] = useState<string>('');
  const [steps, setSteps] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence>('baja');
  const [fuzzyScore, setFuzzyScore] = useState<number | null>(null);
  const [ragSimilarity, setRagSimilarity] = useState<number | null>(null);
  const [resolvedVia, setResolvedVia] = useState<string>('');
  const [disambiguation, setDisambiguation] = useState<Disambiguation | null>(null);
  const [risk, setRisk] = useState<RiskInfo>({ level: 'none', title: '', message: '' });
  const [specialConditions, setSpecialConditions] = useState<SpecialConditions | null>(null);
  const [layoutHint, setLayoutHint] = useState<LayoutHint>('');
  const [structuredResponse, setStructuredResponse] = useState<StructuredResponse | null>(null);

  const processUserInput = async (text: string) => {
    // Validación rápida en cliente (el backend también valida).
    const trimmed = String(text ?? '').trim();
    if (trimmed.length > 200) {
      setAiState('warning');
      setAiResponse('Su pregunta es muy larga. Use máximo 200 caracteres.');
      setAiFinalResponse('');
      return;
    }

    setAiState('processing');
    setAiResponse('');
    setAiFinalResponse('');
    setResolvedMedication('');
    setLayoutHint('');
    setStructuredResponse(null);
    setSteps([]);
    setConfidence('baja');
    setFuzzyScore(null);
    setRagSimilarity(null);
    setResolvedVia('');
    setDisambiguation(null);
    setRisk({ level: 'none', title: '', message: '' });
    setSpecialConditions(null);
    setDrugName('');
    setDrugName2('');
    setMolecularFormula('');
    setMechanism('');
    setHalfLife('');
    setMetabolism('');
    setExcretion('');
    setInteraction('none');

    try {
      // Payload que consume el gateway Next (/api/chat/stream).
      const payload = {
        pregunta: trimmed,
      };

      // Llamada al gateway (server-side) que reenvía al backend con X-API-Key.
      const res = await fetch(`/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // Si el gateway devuelve error, lo propagamos como excepción para mostrar estado ALERT.
        const errorText = await res.text().catch(() => '');
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Respuesta sin cuerpo de streaming');
      }

      // Lectura de streaming SSE:
      // - el backend manda frames separados por "\n\n"
      // - cada frame tiene "event:" y "data:" (JSON)
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assembled = '';
      let done = false;
      setAiState('talking');
      setHudData({
        biometrics: { hr: '72 BPM', bp: '120/80', spo2: '98%' },
        molecular: { item1: 'BACKEND: OK', item2: 'FUENTE: SUPABASE', item3: `MODO: paciente` }
      });

      const saveBotiquin = (item: BotiquinItem) => {
        try {
          const key = 'mi_botiquin_web';
          const raw = window.localStorage.getItem(key) || '[]';
          const prev = JSON.parse(raw);
          const prevList: BotiquinItem[] = Array.isArray(prev) ? prev : [];
          const nameKey = String(item.nombre_medicamento || '').trim().toLowerCase();
          if (!nameKey) return;
          const dedup = prevList.filter((x) => String(x?.nombre_medicamento || '').trim().toLowerCase() !== nameKey);
          const next = [item, ...dedup].slice(0, 5);
          window.localStorage.setItem(key, JSON.stringify(next));
          window.dispatchEvent(new Event('mi_botiquin_web_updated'));
        } catch {
          return;
        }
      };

      const flushFrame = (frame: string) => {
        // Parseo muy simple de SSE: soporta múltiples líneas data: por evento.
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
          try {
            const parsed = JSON.parse(dataText || '{}');
            const nombre = typeof parsed?.nombre_medicamento === 'string' ? parsed.nombre_medicamento : '';
            const categoria = typeof parsed?.categoria === 'string' ? parsed.categoria : '';
            const rl = parsed?.risk_level;
            const risk_level: RiskLevel = rl === 'alert' || rl === 'warning' ? rl : 'none';
            const layout = typeof parsed?.layout === 'string' ? parsed.layout : '';
            if (layout === 'ficha' || layout === 'conversacional') setLayoutHint(layout);
            const content = parsed?.content;
            if ((layout === 'ficha' || layout === 'conversacional') && content && typeof content === 'object') {
              if (layout === 'ficha') {
                setStructuredResponse({
                  layout: 'ficha',
                  content: {
                    para_que_sirve: typeof (content as any)?.para_que_sirve === 'string' ? (content as any).para_que_sirve : '',
                    dosis: typeof (content as any)?.dosis === 'string' ? (content as any).dosis : '',
                    precauciones: typeof (content as any)?.precauciones === 'string' ? (content as any).precauciones : '',
                    dieta: typeof (content as any)?.dieta === 'string' ? (content as any).dieta : '',
                    efectos: typeof (content as any)?.efectos === 'string' ? (content as any).efectos : '',
                  },
                });
              } else {
                setStructuredResponse({
                  layout: 'conversacional',
                  content: {
                    respuesta_directa:
                      typeof (content as any)?.respuesta_directa === 'string' ? (content as any).respuesta_directa : '',
                    alerta_seguridad:
                      typeof (content as any)?.alerta_seguridad === 'string' ? (content as any).alerta_seguridad : '',
                    pasos_a_seguir: typeof (content as any)?.pasos_a_seguir === 'string' ? (content as any).pasos_a_seguir : '',
                  },
                });
              }
            }
            if (nombre && nombre.trim()) saveBotiquin({ nombre_medicamento: nombre.trim(), categoria: categoria.trim(), risk_level, ts: Date.now() });
          } catch {
            done = true;
            return;
          }
          done = true;
          return;
        }
        if (event === 'error') {
          // El backend manda {"message": "..."} en event:error
          try {
            const parsed = JSON.parse(dataText || '{}');
            const msg = typeof parsed?.message === 'string' ? parsed.message : 'Error del backend';
            throw new Error(msg);
          } catch (err) {
            if (err instanceof Error) throw err;
            throw new Error('Error del backend');
          }
        }
        if (event === 'meta') {
          try {
            const parsed = JSON.parse(dataText || '{}');
            const name = typeof parsed?.resolved_medication === 'string' ? parsed.resolved_medication : '';
            if (name) setResolvedMedication(name);
            const layout = typeof parsed?.layout === 'string' ? parsed.layout : '';
            if (layout === 'ficha' || layout === 'conversacional') setLayoutHint(layout);
            const via = typeof parsed?.resolved_via === 'string' ? parsed.resolved_via : '';
            setResolvedVia(via || '');
            const fs = parsed?.fuzzy_score;
            setFuzzyScore(typeof fs === 'number' ? fs : null);
            const sim = parsed?.rag_similarity;
            setRagSimilarity(typeof sim === 'number' ? sim : null);
            const conf = parsed?.confidence;
            setConfidence(conf === 'alta' || conf === 'media' || conf === 'baja' ? conf : 'baja');

            const needs = Boolean(parsed?.needs_disambiguation);
            const question = typeof parsed?.disambiguation_question === 'string' ? parsed.disambiguation_question : '';
            const optsRaw = parsed?.disambiguation_options;
            const opts =
              Array.isArray(optsRaw) ? optsRaw.filter((v) => typeof v === 'string' && v.trim()).map((v) => String(v).trim()) : [];
            if (needs && opts.length) setDisambiguation({ question: question || '¿Cuál presentación está usando?', options: opts });

            const riskLevel = parsed?.risk_level;
            if (riskLevel === 'alert') setAiState('alert');
            if (riskLevel === 'warning') setAiState('warning');
            const title = typeof parsed?.risk_title === 'string' ? parsed.risk_title : '';
            const msg = typeof parsed?.risk_message === 'string' ? parsed.risk_message : '';
            if (riskLevel === 'alert' || riskLevel === 'warning') setRisk({ level: riskLevel, title, message: msg });

            const sc = parsed?.special_conditions;
            if (sc && typeof sc === 'object') {
              const readCond = (key: 'pregnancy' | 'lactation' | 'driving'): SpecialCondition => {
                const v = (sc as any)?.[key];
                const lvl = (v as any)?.level;
                const level: RiskLevel = lvl === 'alert' || lvl === 'warning' ? lvl : 'none';
                const message = typeof (v as any)?.message === 'string' ? String((v as any).message) : '';
                return { level, message };
              };
              setSpecialConditions({
                pregnancy: readCond('pregnancy'),
                lactation: readCond('lactation'),
                driving: readCond('driving'),
              });
            } else {
              setSpecialConditions(null);
            }
          } catch {
            return;
          }
        }
        if (event === 'step') {
          try {
            const parsed = JSON.parse(dataText || '{}');
            const title = typeof parsed?.title === 'string' ? parsed.title : '';
            if (title) setSteps((prev) => [...prev.slice(-7), title]);
          } catch {
            return;
          }
        }
        if (event === 'chunk') {
          // Cada chunk trae {"delta": "..."}: lo concatenamos y renderizamos incrementalmente.
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
        // Va juntando bytes y separa frames por "\n\n".
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
      // En UI se muestra un texto genérico (y en dev se adjunta el detalle).
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
        molecular: { item1: 'BACKEND: ERROR', item2: 'REVISA: API', item3: `MODO: paciente` }
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
    // Limpia estados para privacidad visual.
    setAiState('idle');
    setAiResponse('');
    setAiFinalResponse('');
    setResolvedMedication('');
    setLayoutHint('');
    setStructuredResponse(null);
    setSpecialConditions(null);
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
    resolvedMedication,
    confidence,
    fuzzyScore,
    ragSimilarity,
    resolvedVia,
    disambiguation,
    risk,
    specialConditions,
    layoutHint,
    structuredResponse,
    steps,
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
