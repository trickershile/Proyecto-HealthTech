"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QuantumNucleus from "@/components/nucleus/QuantumOrganicNucleus";
import AssistantOutputBox from "@/components/results/AssistantOutputBox";
import ReminderModal from "@/components/ui/ReminderModal";
import AnswerModal from "@/components/ui/AnswerModal";
import SearchBar from "@/components/ui/SearchBar";
import { useQuantumLogic } from "@/hooks/useQuantumLogic";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import { useVoiceSynthesis } from "@/hooks/useVoiceSynthesis";
import { AlarmClock, BriefcaseMedical, FileDown, Square } from "lucide-react";
import { buildSummary, parse3BlockTemplate, stripMarkdown } from "@/lib/assistantText";

export default function Home() {
  const [status, setStatus] = useState<"idle" | "talking" | "warning" | "alert" | "listening" | "processing">("idle");
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [slowVoice, setSlowVoice] = useState(false);
  const [seniorMode, setSeniorMode] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: string; ts: number }>>([]);
  const [botiquin, setBotiquin] = useState<Array<{ nombre_medicamento: string; categoria: string; risk_level: string; ts: number }>>([]);
  const lastAutoSpokenRef = useRef<string>("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  const { isListening, startListening, stopListening } = useVoiceRecognition();
  const { speak, stop, audioLevel, isSpeaking, setRate } = useVoiceSynthesis();
  const {
    aiState,
    setAiState,
    aiResponse,
    aiFinalResponse,
    resolvedMedication,
    risk,
    specialConditions,
    layoutHint,
    structuredResponse,
    processUserInput,
    resetState,
  } = useQuantumLogic();

  const isConversationalLayout = layoutHint === "conversacional" || structuredResponse?.layout === "conversacional";

  useEffect(() => {
    if (!isConversationalLayout) return;
    const t = (aiResponse || aiFinalResponse || "").trim();
    if (!t) return;
    setAnswerOpen(true);
  }, [aiFinalResponse, aiResponse, isConversationalLayout]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("healthtech_history") || "";
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setHistory(parsed.slice(-3));
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem("mi_botiquin_web") || "[]";
        const parsed = JSON.parse(raw);
        setBotiquin(Array.isArray(parsed) ? parsed : []);
      } catch {
        setBotiquin([]);
      }
    };
    load();
    const onUpdate = () => load();
    window.addEventListener("mi_botiquin_web_updated", onUpdate);
    return () => window.removeEventListener("mi_botiquin_web_updated", onUpdate);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("healthtech_history", JSON.stringify(history.slice(-3)));
    } catch {
      return;
    }
  }, [history]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("healthtech_settings") || "";
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.largeText === "boolean") setLargeText(parsed.largeText);
      if (typeof parsed?.highContrast === "boolean") setHighContrast(parsed.highContrast);
      if (typeof parsed?.slowVoice === "boolean") setSlowVoice(parsed.slowVoice);
      if (typeof parsed?.seniorMode === "boolean") setSeniorMode(parsed.seniorMode);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("healthtech_settings", JSON.stringify({ largeText, highContrast, slowVoice, seniorMode }));
    } catch {
      return;
    }
  }, [highContrast, largeText, seniorMode, slowVoice]);

  useEffect(() => {
    setRate(slowVoice ? 1.06 : 1.12);
  }, [setRate, slowVoice]);

  useEffect(() => {
    if (isListening) setAiState("listening");
  }, [isListening, setAiState]);

  useEffect(() => {
    if (aiState === "alert" || aiState === "warning" || aiState === "listening" || aiState === "processing") {
      setStatus(aiState);
      return;
    }
    if (isSpeaking) {
      setStatus("talking");
      return;
    }
    setStatus(aiState);
  }, [aiState, isSpeaking]);

  useEffect(() => {
    if (!aiFinalResponse) return;
    if (aiFinalResponse === lastAutoSpokenRef.current) return;
    lastAutoSpokenRef.current = aiFinalResponse;
    speak(aiFinalResponse, () => setAiState("idle"));
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], a: aiFinalResponse, ts: Date.now() };
      return next.slice(-3);
    });
  }, [aiFinalResponse, setAiState, speak]);

  const handleSearch = useCallback(
    async (query: string) => {
      stop();
      resetState();
      const normalizedQuery = String(query ?? "").trim();
      const resolved = String(resolvedMedication ?? "").trim();
      const qLower = normalizedQuery.toLowerCase();
      const rLower = resolved.toLowerCase();
      const looksFollowUp =
        /^(y\s+)?(para\s+que|para\s+qué|que\s+hace|qué\s+hace|precauciones|efectos|dosis|dieta|contraindicaciones|riesgos|puedo\s+tomar)/i.test(
          normalizedQuery
        );
      const buildFollowUp = (q: string, med: string) => {
        const base = q.replace(/^\s*y\s+/i, "").trim();
        const qn = base
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (/^(para\s+que|para\s+qué|que\s+hace|qué\s+hace)/.test(qn)) return `¿Para qué sirve ${med}?`;
        if (/^dosis/.test(qn)) return `¿Cuál es la dosis terapéutica y la dosis máxima de ${med}?`;
        if (/^precauciones/.test(qn)) return `¿Qué precauciones debo tener con ${med}?`;
        if (/^dieta/.test(qn)) return `¿Qué dieta debo seguir mientras tomo ${med}?`;
        if (/^efectos/.test(qn)) return `¿Qué efectos secundarios puede causar ${med}?`;
        return `Sobre ${med}: ${base}`;
      };
      const finalQuery = resolved && looksFollowUp && rLower && !qLower.includes(rLower) ? buildFollowUp(normalizedQuery, resolved) : normalizedQuery;
      setHistory((prev) => [...prev, { q: finalQuery, a: "", ts: Date.now() }].slice(-3));
      await processUserInput(finalQuery);
    },
    [processUserInput, resetState, resolvedMedication, stop]
  );

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
      setAiState("idle");
      return;
    }
    if (isSpeaking) return;
    setAiState("listening");
    startListening(async (text) => {
      const raw = String(text ?? "").trim();
      if (!raw) return;
      const norm = raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const currentText = (aiFinalResponse || aiResponse || "").trim();
      const blocks = currentText ? parse3BlockTemplate(currentText) : null;

      if (/(^detener$|^para$|^stop$)/.test(norm)) {
        stop();
        return;
      }
      if (/^repetir$/.test(norm)) {
        if (currentText) speak(currentText);
        return;
      }
      if (/^resumen$/.test(norm)) {
        if (currentText) speak(buildSummary(currentText));
        return;
      }
      if (/^(para que sirve|para que sirve el medicamento)$/.test(norm)) {
        if (blocks?.block1) speak(`Para qué sirve. ${blocks.block1}`);
        else speak("¿De qué medicamento? Diga el nombre del medicamento.");
        return;
      }
      if (/^dosis$/.test(norm)) {
        if (blocks?.block2) speak(`Dosis terapéutica y máxima. ${blocks.block2}`);
        else speak("¿De qué medicamento? Diga el nombre del medicamento.");
        return;
      }
      if (/^(cuidados|precauciones)$/.test(norm)) {
        if (blocks?.block3) speak(`Precauciones. ${blocks.block3}`);
        else speak("¿De qué medicamento? Diga el nombre del medicamento.");
        return;
      }
      if (/^dieta$/.test(norm)) {
        if (blocks?.block4) speak(`Dieta mientras lo toma. ${blocks.block4}`);
        else speak("¿De qué medicamento? Diga el nombre del medicamento.");
        return;
      }
      if (/^(efectos|efectos secundarios)$/.test(norm)) {
        if (blocks?.block5) speak(`Efectos secundarios. ${blocks.block5}`);
        else speak("¿De qué medicamento? Diga el nombre del medicamento.");
        return;
      }
      await handleSearch(raw);
    });
  };

  const hudAccent =
    status === "alert"
      ? "from-red-500/20 via-transparent to-red-500/10"
      : status === "warning"
        ? "from-orange-500/20 via-transparent to-orange-500/10"
        : status === "processing"
          ? "from-emerald-500/12 via-transparent to-black/20"
          : status === "listening"
            ? "from-emerald-500/18 via-transparent to-black/20"
            : "from-emerald-500/18 via-transparent to-cyan-500/12";

  const hudStroke =
    status === "alert"
      ? "border-red-500/25 shadow-[0_0_60px_rgba(239,68,68,0.12)]"
      : status === "warning"
        ? "border-orange-500/25 shadow-[0_0_60px_rgba(249,115,22,0.12)]"
        : status === "processing"
          ? "border-emerald-500/18 shadow-[0_0_60px_rgba(16,185,129,0.08)]"
          : status === "listening"
            ? "border-cyan-500/20 shadow-[0_0_60px_rgba(34,211,238,0.10)]"
            : "border-emerald-500/15 shadow-[0_0_60px_rgba(16,185,129,0.09)]";

  const hudText = status === "alert" ? "text-red-300" : status === "warning" ? "text-orange-300" : "text-emerald-200";

  const hasResult = Boolean(String(aiResponse || "").trim());
  const riskBanner =
    risk.level === "alert"
      ? {
          className: "border-red-500/30 bg-red-950/25 text-red-100 animate-pulse",
          title: risk.title || "🚨 ALERTA: Riesgo alto",
          message:
            risk.message ||
            "Si Usted ya tomó una dosis peligrosa o tiene síntomas de alarma, busque ayuda de urgencia ahora.",
        }
      : risk.level === "warning"
        ? {
            className: "border-orange-500/30 bg-orange-950/20 text-orange-100 animate-pulse",
            title: risk.title || "⚠️ ADVERTENCIA: Revise con atención",
            message: risk.message || "Revise la información con atención y no exceda los límites indicados.",
          }
        : null;

  const exportTxt = () => {
    const clean = stripMarkdown(aiResponse || "");
    const blob = new Blob([clean + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "respuesta.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const clean = stripMarkdown(aiResponse || "");
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Respuesta</title><style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px;color:#0f172a}
      h1{font-size:16px;margin:0 0 12px}
      pre{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5}
      @page{margin:18mm}
    </style></head><body><h1>Respuesta</h1><pre>${(clean || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")}</pre></body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div
      className={`min-h-screen w-full overflow-x-hidden ${highContrast ? "bg-black text-white" : "bg-slate-950 text-white"} ${
        largeText ? "text-[17px]" : "text-[15px]"
      }`}
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center px-4 pb-24 pt-10">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.16),_transparent_55%)] pointer-events-none" />

        <div className="w-full grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="no-print order-2 lg:order-1 lg:sticky lg:top-6 h-fit">
            <div className="rounded-3xl border border-white/10 bg-black/25 px-4 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.32em] text-white/70">Historial</div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.localStorage.removeItem("mi_botiquin_web");
                      setBotiquin([]);
                    } catch {
                      setBotiquin([]);
                    }
                  }}
                  className="min-h-[40px] rounded-2xl border border-white/10 bg-black/30 px-3 text-[11px] uppercase tracking-[0.22em] text-white/75 hover:border-white/20"
                >
                  Limpiar
                </button>
              </div>
              <div className="mt-2 text-xs text-white/55">Últimas 5 consultas.</div>
              {botiquin.length ? (
                <div className="mt-3 grid gap-2">
                  {botiquin.slice(0, 5).map((item) => (
                    <button
                      key={`${item.nombre_medicamento}-${item.ts}`}
                      type="button"
                      onClick={() => handleSearch(item.nombre_medicamento)}
                      className="w-full rounded-2xl border border-slate-800 bg-black/30 px-3 py-2 text-left text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate">{item.nombre_medicamento}</div>
                        <div className="shrink-0 text-[11px] font-semibold text-white/60">
                          {(() => {
                            const d = new Date(item.ts);
                            const now = new Date();
                            const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                            const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                            const diffDays = Math.round((b - a) / (24 * 60 * 60 * 1000));
                            if (diffDays === 0) return "(hoy)";
                            if (diffDays === 1) return "(ayer)";
                            return `(${diffDays}d)`;
                          })()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/55">Aún no hay consultas guardadas.</div>
              )}
            </div>
          </aside>

          <main className="order-1 lg:order-2">
            <div className={`no-print relative mx-auto aspect-square w-[min(420px,95vw)] rounded-[34px] border bg-black/20 backdrop-blur-2xl ${hudStroke}`}>
              <div className={`absolute inset-0 rounded-[34px] bg-gradient-to-b ${hudAccent}`} />
              <div className="absolute inset-[10px] rounded-[26px] border border-white/10 bg-black/20" />

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
            <div className={`absolute right-7 top-6 text-[10px] uppercase tracking-[0.38em] ${hudText}`}>{status}</div>

            <div className="absolute inset-0 flex items-center justify-center">
              <QuantumNucleus state={status} audioLevel={audioLevel} />
            </div>
          </div>

            <div className="mt-6 w-full max-w-3xl">
              <div className="text-center">
                <div className="text-2xl font-semibold tracking-tight">Mi Asistente Farmacéutico Virtual</div>
                <div className="mt-1 text-sm text-white/60">Orientación Segura - Duoc UC</div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <div className="min-w-[240px] flex-1">
                  <SearchBar
                    onSearch={handleSearch}
                    isListening={aiState === "listening"}
                    onVoiceClick={toggleVoice}
                    showMic={true}
                    showCounter={false}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => stop()}
                  className="min-h-[52px] rounded-2xl border border-white/10 bg-black/30 px-3 text-white/80 hover:border-white/20"
                  aria-label="Detener"
                >
                  <Square size={18} />
                </button>
                <button
                  type="button"
                  disabled={!hasResult}
                  onClick={exportPdf}
                  className="min-h-[52px] rounded-2xl border border-white/10 bg-black/30 px-4 text-[12px] font-semibold text-white/85 hover:border-white/20 disabled:opacity-40"
                >
                  PDF
                </button>
                <button
                  type="button"
                  disabled={!hasResult}
                  onClick={exportTxt}
                  className="min-h-[52px] rounded-2xl border border-white/10 bg-black/30 px-4 text-[12px] font-semibold text-white/85 hover:border-white/20 disabled:opacity-40"
                >
                  TXT
                </button>
              </div>
            </div>

            <div className="mt-8 w-full max-w-3xl px-2 sm:px-4">
              {riskBanner ? (
                <div className={`no-print mt-5 rounded-3xl border px-5 py-4 ${riskBanner.className}`}>
                  <div className="text-[11px] uppercase tracking-[0.28em] opacity-90">Semáforo de riesgo</div>
                  <div className="mt-2 text-sm font-semibold leading-relaxed">{riskBanner.title}</div>
                  <div className="mt-1 text-sm leading-relaxed opacity-95">{riskBanner.message}</div>
                </div>
              ) : null}
            {!isConversationalLayout ? (
              <AssistantOutputBox
                value={aiResponse}
                disabled={status === "processing" || status === "listening"}
                className=""
                voice={{ speak, stop, isSpeaking }}
                specialConditions={specialConditions}
                layoutHint={layoutHint}
                structuredResponse={structuredResponse}
                showToolbar={false}
                showSectionChips={false}
              />
            ) : null}
            {hasResult ? (
              <div className="no-print mt-4 flex w-full flex-col items-stretch justify-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 backdrop-blur-xl sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.querySelector("aside");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="min-h-[48px] w-full rounded-2xl bg-black/40 px-4 text-[12px] font-semibold text-white/90 hover:bg-black/55 sm:w-auto"
                >
                  <span className="inline-flex items-center gap-2">
                    <BriefcaseMedical className="h-4 w-4 text-white" />
                    <span>Mi Botiquín Web</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[48px] w-full rounded-2xl bg-sky-700 px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-sky-600 active:bg-sky-800 sm:w-auto"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileDown className="h-4 w-4 text-white" />
                    <span>Exportar Mi Ficha (PDF/Impresión)</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setReminderOpen(true)}
                  className="min-h-[48px] w-full rounded-2xl bg-black/40 px-4 text-[12px] font-semibold text-white/90 hover:bg-black/55 sm:w-auto"
                >
                  <span className="inline-flex items-center gap-2">
                    <AlarmClock className="h-4 w-4 text-white" />
                    <span>Recordatorio de Toma</span>
                  </span>
                </button>
              </div>
            ) : null}
            <AnswerModal
              open={answerOpen && isConversationalLayout}
              onClose={() => setAnswerOpen(false)}
              text={aiFinalResponse || aiResponse}
              structuredResponse={structuredResponse?.layout === "conversacional" ? structuredResponse : null}
              voice={{ speak, stop, isSpeaking }}
            />
            <div className="no-print mt-3 text-xs text-white/55 text-center">
              {status === "processing"
                ? "Enviando…"
                : status === "talking"
                  ? "Recibiendo…"
                  : status === "alert"
                    ? "Alerta activa."
                    : "Listo."}
            </div>
          </div>
          </main>
        </div>
      </div>

      <div className="no-print fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-950/30 via-transparent to-transparent" />

      <ReminderModal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        defaultMedicationName={resolvedMedication || (botiquin[0]?.nombre_medicamento || "")}
      />

      {risk.level === "alert" ? (
        <div className="no-print pointer-events-auto fixed bottom-20 right-4 z-40 flex flex-col gap-2">
          <a
            href="tel:+56226353800"
            className="min-h-[52px] w-[min(340px,92vw)] rounded-3xl bg-red-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_0_50px_rgba(239,68,68,0.25)] hover:bg-red-500 active:bg-red-700 animate-pulse"
          >
            🚨 LLAMAR A URGENCIAS (CITUC) AQUÍ
          </a>
          <a
            href="tel:131"
            className="min-h-[48px] w-[min(340px,92vw)] rounded-3xl border border-white/10 bg-black/40 px-5 py-3 text-center text-sm font-semibold text-white/90 backdrop-blur hover:border-white/20"
          >
            Llamar 131 (SAMU)
          </a>
        </div>
      ) : null}

      <div className="no-print fixed bottom-0 left-0 right-0 z-30 border-t border-emerald-500/15 bg-emerald-950/40 backdrop-blur-xl">
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
            repeating-linear-gradient(
              0deg,
              rgba(255, 255, 255, 0.035) 0px,
              rgba(255, 255, 255, 0.035) 1px,
              transparent 1px,
              transparent 12px
            ),
            repeating-linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.03) 0px,
              rgba(255, 255, 255, 0.03) 1px,
              transparent 1px,
              transparent 14px
            );
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
            rgba(var(--scan), 0.1) 300deg,
            rgba(var(--scan), 0) 360deg
          );
          filter: blur(10px);
          animation: rotor 12s linear infinite;
          border-radius: 26px;
        }

        @keyframes scan {
          0% {
            transform: translateY(-120%);
          }
          100% {
            transform: translateY(120%);
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
      `}</style>
    </div>
  );
}

