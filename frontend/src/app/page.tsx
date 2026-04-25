"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import QuantumNucleus from '@/components/nucleus/QuantumOrganicNucleus';
import SearchBar from '@/components/ui/SearchBar';
import AssistantOutputBox from '@/components/results/AssistantOutputBox';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useVoiceSynthesis } from '@/hooks/useVoiceSynthesis';
import { useQuantumLogic } from '@/hooks/useQuantumLogic';

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'talking' | 'warning' | 'alert' | 'listening' | 'processing'>('idle');
  const [mode, setMode] = useState<'paciente' | 'alumno'>('paciente');
  const [doseMissedHours, setDoseMissedHours] = useState<number | null>(null);
  const [labPhase, setLabPhase] = useState<'idle' | 'absorption' | 'distribution' | 'metabolism' | 'excretion' | 'interaction'>('idle');
  const labTimersRef = useRef<number[]>([]);

  const { isListening, startListening } = useVoiceRecognition();
  const { speak, stop, audioLevel, isSpeaking } = useVoiceSynthesis();
  const {
    aiState,
    setAiState,
    aiResponse,
    aiFinalResponse,
    hudData,
    drugName,
    drugName2,
    molecularFormula,
    mechanism,
    halfLife,
    metabolism,
    excretion,
    interaction,
    processUserInput,
    resetState
  } = useQuantumLogic();

  useEffect(() => {
    if (isListening) {
      setAiState('listening');
    }
  }, [isListening, setAiState]);

  useEffect(() => {
    if (aiState === 'alert' || aiState === 'warning' || aiState === 'listening' || aiState === 'processing') {
      setStatus(aiState);
      return;
    }
    if (isSpeaking) {
      setStatus('talking');
      return;
    }
    setStatus(aiState);
  }, [aiState, isSpeaking]);

  useEffect(() => {
    if (!aiFinalResponse) return;
    const stateAtResponse = aiState;
    speak(aiFinalResponse, () => {
      if (stateAtResponse === 'talking') setAiState('idle');
    });
  }, [aiFinalResponse, aiState, speak, setAiState]);

  useEffect(() => {
    for (const id of labTimersRef.current) window.clearTimeout(id);
    labTimersRef.current = [];

    if (mode !== 'alumno') {
      setLabPhase('idle');
      return;
    }

    if (status === 'alert' && (interaction === 'severe' || Boolean(drugName2))) {
      setLabPhase('interaction');
      return;
    }

    if (!drugName && !molecularFormula) {
      setLabPhase('idle');
      return;
    }

    if (status === 'processing' || status === 'listening') {
      setLabPhase('idle');
      return;
    }

    setLabPhase('absorption');
    labTimersRef.current.push(window.setTimeout(() => setLabPhase('distribution'), 900));
    labTimersRef.current.push(window.setTimeout(() => setLabPhase('metabolism'), 1800));
    labTimersRef.current.push(window.setTimeout(() => setLabPhase('excretion'), 2700));
  }, [drugName, drugName2, interaction, mode, molecularFormula, status]);

  const parseMissedDoseHours = (query: string) => {
    const normalized = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!/(olvide|olvido|me olvide|me olvido|se me olvido|me salte)/.test(normalized)) return null;
    const hoursMatch = normalized.match(/\bhace\s+(\d+(?:[.,]\d+)?)\s*(h|hora|horas)\b/);
    if (hoursMatch) {
      const hours = Number(String(hoursMatch[1]).replace(',', '.'));
      if (!Number.isFinite(hours)) return null;
      return Math.max(0, Math.min(48, hours));
    }
    const minutesMatch = normalized.match(/\bhace\s+(\d+(?:[.,]\d+)?)\s*(m|min|minuto|minutos)\b/);
    if (minutesMatch) {
      const minutes = Number(String(minutesMatch[1]).replace(',', '.'));
      if (!Number.isFinite(minutes)) return null;
      return Math.max(0, Math.min(48, minutes / 60));
    }
    return null;
  };

  const handleSearch = useCallback(async (query: string) => {
    stop();
    resetState();
    setDoseMissedHours(parseMissedDoseHours(query));
    setLabPhase('idle');
    await processUserInput(query, mode);
  }, [mode, processUserInput, resetState, stop]);

  const enterStudentMode = useCallback(() => {
    setMode('alumno');
  }, []);

  const toggleVoice = () => {
    if (aiState === 'listening' || isSpeaking) return;
    setAiState('listening');
    startListening(async (text) => {
      if (text) await handleSearch(text);
    });
  };

  const hudAccent =
    status === 'alert'
      ? 'from-red-500/20 via-transparent to-red-500/10'
      : status === 'warning'
        ? 'from-orange-500/20 via-transparent to-orange-500/10'
        : status === 'processing'
          ? mode === 'alumno'
            ? 'from-slate-500/12 via-transparent to-black/20'
            : 'from-emerald-500/12 via-transparent to-cyan-500/10'
        : status === 'listening'
          ? mode === 'alumno'
            ? 'from-slate-400/18 via-transparent to-black/20'
            : 'from-emerald-500/18 via-transparent to-cyan-500/10'
          : mode === 'alumno'
            ? 'from-slate-500/14 via-transparent to-black/25'
            : 'from-emerald-500/18 via-transparent to-cyan-500/12';

  const hudStroke =
    status === 'alert'
      ? 'border-red-500/25 shadow-[0_0_60px_rgba(239,68,68,0.12)]'
      : status === 'warning'
        ? 'border-orange-500/25 shadow-[0_0_60px_rgba(249,115,22,0.12)]'
        : status === 'processing'
          ? mode === 'alumno'
            ? 'border-slate-400/15 shadow-[0_0_60px_rgba(148,163,184,0.08)]'
            : 'border-emerald-500/18 shadow-[0_0_60px_rgba(16,185,129,0.08)]'
        : status === 'listening'
          ? mode === 'alumno'
            ? 'border-slate-300/20 shadow-[0_0_60px_rgba(148,163,184,0.10)]'
            : 'border-cyan-500/20 shadow-[0_0_60px_rgba(34,211,238,0.10)]'
          : mode === 'alumno'
            ? 'border-white/10 shadow-[0_0_60px_rgba(148,163,184,0.06)]'
            : 'border-emerald-500/15 shadow-[0_0_60px_rgba(16,185,129,0.09)]';

  const hudText =
    status === 'alert'
      ? 'text-red-300'
      : status === 'warning'
        ? 'text-orange-300'
        : status === 'listening'
          ? mode === 'alumno'
            ? 'text-slate-200'
            : 'text-emerald-200'
          : status === 'processing'
            ? mode === 'alumno'
              ? 'text-slate-200'
              : 'text-emerald-200'
            : mode === 'alumno'
              ? 'text-slate-200'
              : 'text-emerald-200';

  const hudScan =
    status === 'alert'
      ? '239,68,68'
      : status === 'warning'
        ? '249,115,22'
        : status === 'listening'
          ? mode === 'alumno'
            ? '148,163,184'
            : '16,185,129'
          : status === 'processing'
            ? mode === 'alumno'
              ? '148,163,184'
              : '6,182,212'
          : mode === 'alumno'
              ? '148,163,184'
              : '16,185,129';

  const nucleusState = (
    status === 'alert'
      ? 'alert'
      : status === 'warning'
        ? 'warning'
        : status === 'listening'
          ? 'listening'
          : isSpeaking
            ? 'talking'
            : status === 'processing'
              ? 'talking'
              : 'idle'
  ) as 'idle' | 'talking' | 'warning' | 'alert' | 'listening';
  const hasChemicalId = Boolean(drugName || drugName2 || molecularFormula || mechanism || halfLife || metabolism || excretion);
  const showDangerPanel = mode === 'paciente' && status === 'alert';
  const interactionStrength = interaction === 'severe' ? 1 : interaction === 'moderate' ? 0.65 : 0;
  const isAlumno = mode === 'alumno';

  const pageBg = isAlumno
    ? 'bg-gradient-to-b from-zinc-950 via-black to-black'
    : 'bg-gradient-to-b from-emerald-950 via-slate-950 to-slate-950';

  const parseHalfLifeHours = (value: string) => {
    const text = String(value ?? '').toLowerCase();
    const match = text.match(/(\d+(?:[.,]\d+)?).{0,8}\b(h|hora|horas)\b/);
    if (!match) return null;
    const n = Number(String(match[1]).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const halfLifeHours = parseHalfLifeHours(halfLife);

  return (
    <main className={`min-h-screen ${pageBg} text-slate-200 flex flex-col items-center justify-start px-4 sm:px-6 pb-20 overflow-hidden pt-28 sm:pt-32`} style={{ ['--scan' as any]: hudScan }}>
      <div className="fixed top-10 w-full max-w-2xl z-20 px-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchBar
              onSearch={handleSearch}
              isListening={status === 'listening'}
              onVoiceClick={toggleVoice}
              mode={mode}
            />
          </div>

          <div className="flex items-center gap-3">
            {status === 'processing' ? (
              <div className={`text-[11px] uppercase tracking-[0.28em] ${isAlumno ? 'text-slate-200' : 'text-emerald-200'}`}>
                Cargando...
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setMode(prev => (prev === 'paciente' ? 'alumno' : 'paciente'))}
              className={`relative h-10 w-[148px] rounded-2xl border backdrop-blur-xl transition-colors ${
                isAlumno
                  ? 'border-white/10 bg-white/[0.03]'
                  : 'border-emerald-500/15 bg-emerald-500/10'
              }`}
              aria-label="Cambiar modo"
            >
              <span
                className={`absolute top-1 bottom-1 w-[68px] rounded-xl transition-all duration-300 z-0 ${
                  isAlumno
                    ? 'left-[76px] bg-white/10 border border-white/10'
                    : 'left-1 bg-emerald-400/20 border border-emerald-400/20'
                }`}
              />
              <span className="absolute inset-0 flex items-center justify-between px-3 text-[10px] uppercase tracking-[0.30em] relative z-10">
                <span className={isAlumno ? 'text-white/45' : 'text-emerald-100/80'}>Paciente</span>
                <span className={isAlumno ? 'text-white/70' : 'text-white/45'}>Alumno</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-y-0 left-6 hidden lg:flex items-center z-10">
        <div className="side-panel relative w-[280px] h-[420px] rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden">
          <div className="panel-shimmer absolute inset-0" />
          <div className="panel-grid absolute inset-0 opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-black/25" />
          <div className="relative p-5">
            <div className="flex items-center justify-between">
              <div className={`text-[10px] uppercase tracking-[0.35em] ${hudText}`}>Panel A</div>
              <div className="flex items-center gap-2">
                <span className="panel-dot w-2 h-2 rounded-full" />
                <span className="panel-dot w-1.5 h-1.5 rounded-full" />
                <span className="panel-dot w-1 h-1 rounded-full" />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="panel-row flex items-center justify-between">
                <span className="text-xs text-white/70">HR</span>
                <span className="text-xs text-white/50">{hudData.biometrics.hr}</span>
              </div>
              <div className="panel-row flex items-center justify-between">
                <span className="text-xs text-white/70">BP</span>
                <span className="text-xs text-white/50">{hudData.biometrics.bp}</span>
              </div>
              <div className="panel-row flex items-center justify-between">
                <span className="text-xs text-white/70">SpO₂</span>
                <span className="text-xs text-white/50">{hudData.biometrics.spo2}</span>
              </div>
            </div>
            <div className="mt-6 panel-bars h-24 rounded-2xl border border-white/10 bg-black/20 overflow-hidden" />
            <div className="mt-4 panel-ticker text-[10px] text-white/45 uppercase tracking-[0.28em] whitespace-normal break-words leading-relaxed">
              {hudData.molecular.item1} • {hudData.molecular.item2} • {hudData.molecular.item3}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-y-0 right-6 hidden lg:flex items-center z-10">
        <div className="side-panel relative w-[280px] h-[420px] rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden">
          <div className="panel-shimmer absolute inset-0" />
          <div className="panel-grid absolute inset-0 opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-black/25" />
          <div className="relative p-5">
            <div className="flex items-center justify-between">
              <div className={`text-[10px] uppercase tracking-[0.35em] ${hudText}`}>Panel B</div>
              <div className="text-[10px] text-white/45 uppercase tracking-[0.35em]">{mode}</div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="panel-row flex items-center justify-between">
                <span className="text-xs text-white/70">Estado</span>
                <span className="text-xs text-white/50">{status}</span>
              </div>
              <div className="panel-row flex items-center justify-between">
                <span className="text-xs text-white/70">Voz</span>
                <span className="text-xs text-white/50">{isSpeaking ? 'Hablando' : 'Lista'}</span>
              </div>
              <div className="panel-row flex items-center justify-between">
                <span className="text-xs text-white/70">Entrada</span>
                <span className="text-xs text-white/50">{isListening ? 'Mic' : 'Texto'}</span>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
                <div className="text-[10px] uppercase tracking-[0.32em] text-white/60">
                  {showDangerPanel ? 'Alerta de Seguridad' : 'Cédula de Identidad Química'}
                </div>
              </div>
              {showDangerPanel ? (
                <div className="px-4 py-4">
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 shadow-[0_0_40px_rgba(239,68,68,0.10)]">
                    <div className="text-[11px] uppercase tracking-[0.34em] text-red-200">PELIGRO</div>
                    <div className="mt-1 text-lg font-light text-red-100 tracking-wide">NO TOMAR</div>
                    <div className="mt-2 text-xs text-red-100/70 leading-relaxed">
                      Combinar o duplicar dosis puede ser peligroso. Contacta a tu médico o urgencias de inmediato.
                    </div>
                  </div>
                </div>
              ) : hasChemicalId ? (
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-start justify-between gap-4 min-w-0">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-white/50 pt-0.5">Fármaco</span>
                    <span className="text-xs text-white/75 text-right leading-snug flex-1 min-w-0 whitespace-normal break-words">
                      {mode === 'alumno' && drugName2 ? `${drugName || '—'} + ${drugName2}` : (drugName || '—')}
                    </span>
                  </div>
                  {mode === 'alumno' ? (
                    <div className="flex items-start justify-between gap-4 min-w-0">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-white/50 pt-0.5">Fórmula</span>
                      <span className="text-xs text-white/60 text-right leading-snug flex-1 min-w-0 whitespace-normal break-words">
                        {molecularFormula || '—'}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-4 min-w-0">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-white/50 pt-0.5">{mode === 'alumno' ? 'Mecanismo' : 'Acción'}</span>
                    <span className="text-xs text-white/60 text-right leading-snug flex-1 min-w-0 whitespace-normal break-words">
                      {mechanism || '—'}
                    </span>
                  </div>
                  {mode === 'alumno' ? (
                    <>
                      <div className="flex items-start justify-between gap-4 min-w-0">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/50 pt-0.5">Metabolismo</span>
                        <span className="text-xs text-white/60 text-right leading-snug flex-1 min-w-0 whitespace-normal break-words">
                          {metabolism || '—'}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4 min-w-0">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/50 pt-0.5">Excreción</span>
                        <span className="text-xs text-white/60 text-right leading-snug flex-1 min-w-0 whitespace-normal break-words">
                          {excretion || '—'}
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div className="flex items-start justify-between gap-4 min-w-0">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-white/50 pt-0.5">Vida media</span>
                    <span className="text-xs text-white/60 text-right leading-snug flex-1 min-w-0 whitespace-normal break-words">
                      {halfLife || '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-xs text-white/45">
                  Sin compuesto detectado.
                </div>
              )}
            </div>
            <div className="mt-4 panel-ticker panel-ticker-rev text-[10px] text-white/45 uppercase tracking-[0.28em] whitespace-normal break-words leading-relaxed">
              análisis • triage • explicación • prevención • seguimiento • recomendaciones
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center w-full gap-8 mt-20 lg:mt-40">
        <div className="relative w-[min(92vw,460px)] h-[min(92vw,460px)] md:w-[460px] md:h-[460px]">
          <div className={`absolute -inset-6 rounded-[44px] blur-3xl opacity-35 bg-gradient-to-br ${hudAccent}`} />
          <div className={`absolute inset-0 rounded-[34px] border ${hudStroke} bg-white/[0.035] backdrop-blur-2xl`} />
          <div className="absolute inset-[10px] rounded-[26px] border border-white/10 bg-black/20" />
          <div className="absolute inset-0 rounded-[34px] bg-gradient-to-b from-white/[0.08] via-transparent to-black/30" />
          <div className="hud-grid absolute inset-[10px] rounded-[26px] opacity-35" />
          <div className="hud-rotor absolute inset-[10px] rounded-[26px] opacity-25" />

          <div className="absolute inset-[10px] rounded-[26px] overflow-hidden">
            <div className="scanline absolute left-0 right-0 h-[2px]" />
          </div>

          <div className="absolute -inset-px rounded-[34px] pointer-events-none opacity-80">
            <div className="absolute left-6 top-6 w-10 h-10 border-l border-t border-white/30" />
            <div className="absolute right-6 top-6 w-10 h-10 border-r border-t border-white/30" />
            <div className="absolute left-6 bottom-6 w-10 h-10 border-l border-b border-white/30" />
            <div className="absolute right-6 bottom-6 w-10 h-10 border-r border-b border-white/30" />
          </div>

          <div className="absolute left-7 top-6 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/70" />
            <span className={`text-[10px] uppercase tracking-[0.38em] ${hudText}`}>Quantum Med-Scan</span>
          </div>
          <div className={`absolute right-7 top-6 text-[10px] uppercase tracking-[0.38em] ${hudText}`}>
            {status}
          </div>

          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="hud-reticle relative w-[72%] h-[72%]">
              <div className="absolute inset-0 rounded-full border border-white/10" />
              <div className="absolute inset-[14%] rounded-full border border-white/10" />
              <div className="absolute left-1/2 top-[8%] bottom-[8%] w-px bg-white/10 -translate-x-1/2" />
              <div className="absolute top-1/2 left-[8%] right-[8%] h-px bg-white/10 -translate-y-1/2" />
              <div className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-white/20 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <QuantumNucleus
              state={nucleusState}
              audioLevel={audioLevel}
              mode={mode}
              doseMissedHours={doseMissedHours}
              labPhase={labPhase}
              interactionStrength={interactionStrength}
              halfLifeHours={halfLifeHours}
            />
          </div>
        </div>

        <div className="w-full max-w-3xl px-2 sm:px-4">
          <AssistantOutputBox
            value={aiResponse}
            disabled={status === 'processing' || status === 'listening'}
            className=""
          />
          <div className="mt-3 text-xs text-white/55 text-center">
            {status === 'processing'
              ? 'Enviando…'
              : status === 'talking'
                ? 'Recibiendo…'
                : status === 'alert'
                  ? 'Error de conexión. Revisa backend/credenciales.'
                  : 'Listo.'}
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${
        isAlumno ? 'from-slate-900/25' : 'from-emerald-950/30'
      } via-transparent to-transparent`} />

      <div className={`fixed bottom-0 left-0 right-0 z-30 border-t ${
        isAlumno ? 'border-white/10 bg-black/70' : 'border-emerald-500/15 bg-emerald-950/40'
      } backdrop-blur-xl`}>
        <div className="mx-auto w-full max-w-3xl px-4 py-3 text-center text-xs text-white/70">
          ⚠️ La información proporcionada por esta IA no sustituye el consejo de un profesional médico.
        </div>
      </div>

      <style jsx>{`
        .scanline {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(var(--scan), 0.0) 10%,
            rgba(var(--scan), 0.6) 50%,
            rgba(var(--scan), 0.0) 90%,
            transparent 100%
          );
          filter: blur(0.7px);
          opacity: 0.55;
          animation: scan 3.9s linear infinite;
        }

        .hud-grid {
          background-image: radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.08) 0%, transparent 45%),
            radial-gradient(circle at 80% 85%, rgba(255, 255, 255, 0.06) 0%, transparent 45%),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0px, rgba(255, 255, 255, 0.035) 1px, transparent 1px, transparent 12px),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0px, rgba(255, 255, 255, 0.03) 1px, transparent 1px, transparent 14px);
          mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.55) 62%, rgba(0, 0, 0, 0) 100%);
          border-radius: 26px;
        }

        .hud-rotor {
          background: conic-gradient(
            from 0deg,
            rgba(var(--scan), 0) 0deg,
            rgba(var(--scan), 0.12) 32deg,
            rgba(var(--scan), 0) 70deg,
            rgba(var(--scan), 0.08) 140deg,
            rgba(var(--scan), 0) 220deg,
            rgba(var(--scan), 0.10) 300deg,
            rgba(var(--scan), 0) 360deg
          );
          filter: blur(10px);
          animation: rotor 12s linear infinite;
          border-radius: 26px;
        }

        .side-panel {
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.45), 0 0 70px rgba(var(--scan), 0.06);
        }

        .panel-grid {
          background-image: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0px, rgba(255, 255, 255, 0.03) 1px, transparent 1px, transparent 14px),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.022) 0px, rgba(255, 255, 255, 0.022) 1px, transparent 1px, transparent 16px);
          mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.65) 62%, rgba(0, 0, 0, 0) 100%);
        }

        .panel-shimmer {
          background: linear-gradient(115deg, rgba(var(--scan), 0) 0%, rgba(var(--scan), 0.06) 40%, rgba(var(--scan), 0.0) 65%);
          transform: translateX(-60%);
          animation: shimmer 4.8s ease-in-out infinite;
        }

        .panel-dot {
          background: rgba(var(--scan), 0.55);
          box-shadow: 0 0 18px rgba(var(--scan), 0.20);
          opacity: 0.8;
          animation: dot 1.8s ease-in-out infinite;
        }
        .panel-dot:nth-child(2) { animation-delay: 0.22s; opacity: 0.65; }
        .panel-dot:nth-child(3) { animation-delay: 0.44s; opacity: 0.45; }

        .panel-row {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding-bottom: 10px;
        }
        .panel-row:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .panel-bars {
          background-image: linear-gradient(90deg, rgba(var(--scan), 0.0), rgba(var(--scan), 0.10), rgba(var(--scan), 0.0)),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0px, rgba(255, 255, 255, 0.08) 2px, transparent 2px, transparent 10px);
          background-size: 180% 100%, 100% 100%;
          animation: bars 3.2s ease-in-out infinite;
          mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.3) 75%, rgba(0, 0, 0, 0) 100%);
        }

        .panel-rings {
          background: radial-gradient(circle at center, rgba(var(--scan), 0.12) 0%, rgba(var(--scan), 0.0) 55%),
            radial-gradient(circle at center, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.0) 52%),
            conic-gradient(from 0deg, rgba(var(--scan), 0.0) 0deg, rgba(var(--scan), 0.10) 40deg, rgba(var(--scan), 0.0) 120deg, rgba(var(--scan), 0.06) 220deg, rgba(var(--scan), 0.0) 360deg);
          animation: rotor 14s linear infinite;
          filter: blur(0.2px);
        }

        .panel-ticker {
          mask-image: linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 14%, rgba(0, 0, 0, 1) 86%, rgba(0, 0, 0, 0) 100%);
          animation: ticker 9s linear infinite;
        }

        .panel-ticker-rev {
          animation-direction: reverse;
        }

        @keyframes scan {
          0% {
            top: -10%;
            opacity: 0;
          }
          8% {
            opacity: 0.25;
          }
          50% {
            opacity: 0.55;
          }
          92% {
            opacity: 0.22;
          }
          100% {
            top: 110%;
            opacity: 0;
          }
        }

        @keyframes rotor {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes shimmer {
          0% { transform: translateX(-60%) translateY(-8%); opacity: 0.0; }
          12% { opacity: 0.55; }
          50% { transform: translateX(60%) translateY(8%); opacity: 0.35; }
          88% { opacity: 0.15; }
          100% { transform: translateX(80%) translateY(10%); opacity: 0.0; }
        }

        @keyframes bars {
          0% { background-position: 0% 50%, 0% 50%; }
          50% { background-position: 100% 50%, 0% 50%; }
          100% { background-position: 0% 50%, 0% 50%; }
        }

        @keyframes ticker {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-40%); }
        }

        @keyframes dot {
          0% { transform: translateY(0px); filter: brightness(1); }
          50% { transform: translateY(-2px); filter: brightness(1.2); }
          100% { transform: translateY(0px); filter: brightness(1); }
        }
      `}</style>
    </main>
  );
}
