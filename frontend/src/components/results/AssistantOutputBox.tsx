"use client";

import { useEffect, useMemo, useRef } from 'react';
import { Volume2, Square } from 'lucide-react';

import { useVoiceSynthesis } from '@/hooks/useVoiceSynthesis';
import { buildSummary, parse3BlockTemplate, stripMarkdown } from '@/lib/assistantText';

type RiskLevel = "none" | "warning" | "alert";
type SpecialCondition = { level: RiskLevel; message: string };
type SpecialConditions = { pregnancy: SpecialCondition; lactation: SpecialCondition; driving: SpecialCondition };

type StructuredFichaContent = {
  para_que_sirve: string;
  dosis: string;
  precauciones: string;
  dieta: string;
  efectos: string;
};

type StructuredConversationalContent = {
  respuesta_directa: string;
  alerta_seguridad: string;
  pasos_a_seguir: string;
};

type StructuredResponse =
  | { layout: "ficha"; content: StructuredFichaContent }
  | { layout: "conversacional"; content: StructuredConversationalContent };

type Props = {
  label?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  specialConditions?: SpecialConditions | null;
  layoutHint?: '' | 'ficha' | 'conversacional';
  structuredResponse?: StructuredResponse | null;
  showToolbar?: boolean;
  showSectionChips?: boolean;
  voice?: {
    speak: (text: string, onEnd?: () => void) => void;
    stop: () => void;
    isSpeaking: boolean;
  };
};

export default function AssistantOutputBox({
  label = 'Respuesta del asistente',
  value,
  placeholder = 'Aquí verás la respuesta del asistente…',
  disabled = false,
  className = '',
  specialConditions = null,
  layoutHint = '',
  structuredResponse = null,
  showToolbar = true,
  showSectionChips = true,
  voice,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);
  const fallbackVoice = useVoiceSynthesis();
  const speak = voice?.speak ?? fallbackVoice.speak;
  const stop = voice?.stop ?? fallbackVoice.stop;
  const isSpeaking = voice?.isSpeaking ?? fallbackVoice.isSpeaking;
  const blocks = useMemo(() => parse3BlockTemplate(value), [value]);
  const isV5 = Boolean(blocks?.block5 || blocks?.block4);
  const summary = useMemo(() => buildSummary(value), [value]);
  const hasStructured = Boolean(structuredResponse && (structuredResponse.layout === "ficha" || structuredResponse.layout === "conversacional"));
  const conversational = useMemo(() => {
    const raw = String(value ?? "").trim();
    if (!raw) return { text: "", disclaimer: "" };
    const m = raw.match(/\*Recuerde:([\s\S]*)\*$/);
    const disclaimer = m ? m[0].trim() : "";
    const content = (disclaimer ? raw.replace(disclaimer, "") : raw).trim();
    const text = content.replace(/^\s*RESPUESTA_CONVERSACIONAL\s*:?\s*/i, "").trim();
    return { text, disclaimer };
  }, [value]);

  const shouldUseConversational = useMemo(() => {
    if (hasStructured) return structuredResponse?.layout === "conversacional";
    if (layoutHint === 'conversacional') return true;
    if (!blocks) return true;
    if (layoutHint === 'ficha') return false;
    const parts = isV5
      ? [blocks.block1, blocks.block2, blocks.block3, blocks.block4 ?? "", blocks.block5 ?? ""]
      : [blocks.block1, blocks.block2, blocks.block3];
    const meaningful = parts.filter((s) => String(s || "").trim().replace(/[—\s]/g, "").length >= 12).length;
    return isV5 ? meaningful < 3 : meaningful < 2;
  }, [blocks, hasStructured, isV5, layoutHint, structuredResponse]);

  const structuredConversationalText = useMemo(() => {
    if (!structuredResponse || structuredResponse.layout !== "conversacional") return "";
    const c = structuredResponse.content;
    const parts: string[] = [];
    const a = String(c.alerta_seguridad || "").trim();
    const r = String(c.respuesta_directa || "").trim();
    const p = String(c.pasos_a_seguir || "").trim();
    if (r) parts.push(r);
    if (a) parts.push(`⚠️ ${a}`);
    if (p) parts.push(`Pasos a seguir:\n${p}`);
    return parts.join("\n\n").trim();
  }, [structuredResponse]);
  const conversationalText = useMemo(() => {
    if (hasStructured && structuredResponse?.layout === "conversacional") {
      return structuredConversationalText || stripMarkdown(value);
    }
    if (blocks && shouldUseConversational) {
      const parts: string[] = [];
      if (String(blocks.block1 || "").trim()) parts.push(String(blocks.block1).trim());
      if (isV5) {
        if (String(blocks.block2 || "").trim()) parts.push(`Dosis: ${String(blocks.block2).trim()}`);
        if (String(blocks.block3 || "").trim()) parts.push(`Precauciones: ${String(blocks.block3).trim()}`);
        if (String(blocks.block4 || "").trim()) parts.push(`Dieta: ${String(blocks.block4).trim()}`);
        if (String(blocks.block5 || "").trim()) parts.push(`Efectos: ${String(blocks.block5).trim()}`);
      } else {
        if (String(blocks.block2 || "").trim()) parts.push(`Cuidados: ${String(blocks.block2).trim()}`);
        if (String(blocks.block3 || "").trim()) parts.push(`Efectos: ${String(blocks.block3).trim()}`);
      }
      const merged = parts.join("\n\n").trim();
      return merged || stripMarkdown(value);
    }
    return conversational.text;
  }, [blocks, conversational.text, hasStructured, isV5, shouldUseConversational, structuredConversationalText, structuredResponse, value]);
  const conversationalDisclaimer = blocks?.disclaimer || conversational.disclaimer;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [value]);

  const canSpeak = !disabled && !!value.trim();
  const escapeHtml = (s: string) =>
    (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const cardBase = "rounded-3xl border-2 bg-[#0b1628] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]";
  const cardGlow = {
    emerald: "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_26px_70px_-44px_rgba(16,185,129,0.32)]",
    sky: "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_26px_70px_-44px_rgba(56,189,248,0.30)]",
    amber: "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_26px_70px_-44px_rgba(251,191,36,0.24)]",
    red: "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_26px_70px_-44px_rgba(248,113,113,0.24)]",
  };
  const actionBtnBase =
    "min-h-[48px] rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-40";
  const actionBtnBlue = `${actionBtnBase} bg-sky-700 hover:bg-sky-600 active:bg-sky-800`;
  const actionBtnStop = `${actionBtnBase} bg-red-600 hover:bg-red-500 active:bg-red-700`;
  const actionBtnSlate = `${actionBtnBase} bg-slate-800 hover:bg-slate-700 active:bg-slate-900`;

  const sealBase =
    "min-h-[44px] rounded-2xl px-4 text-left text-[12px] font-semibold text-white shadow-sm transition-colors disabled:opacity-40";
  const sealTone = (level: "none" | "warning" | "alert") =>
    level === "alert"
      ? "bg-red-600 hover:bg-red-500 active:bg-red-700"
      : level === "warning"
        ? "bg-amber-600 hover:bg-amber-500 active:bg-amber-700"
        : "bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800";

  const effectsSplit = useMemo(() => {
    const raw = hasStructured && structuredResponse?.layout === "ficha"
      ? String(structuredResponse.content.efectos || "").trim()
      : String(blocks?.block5 || "").trim();
    if (!raw) return { raw: "", leves: "", graves: "" };
    const idxGraves = raw.search(/\b(graves|alarma)\s*:/i);
    const idxLeves = raw.search(/\b(leves|comunes?)\s*:/i);
    if (idxGraves === -1) return { raw, leves: "", graves: "" };
    const levesPart = raw.slice(0, idxGraves).trim();
    const gravesPart = raw.slice(idxGraves).trim();
    const leves = (idxLeves >= 0 ? levesPart.slice(idxLeves) : levesPart).replace(/^\b(leves|comunes?)\s*:\s*/i, "").trim();
    const graves = gravesPart.replace(/^\b(graves|alarma)\s*:\s*/i, "").trim();
    return { raw, leves, graves };
  }, [blocks?.block5, hasStructured, structuredResponse]);

  return (
    <div className={`w-full print-ficha-root ${className}`}>
      {showToolbar ? (
        <div className="no-print flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.32em] text-white/60">{label}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!canSpeak || !summary}
              onClick={() => {
                if (isSpeaking) {
                  stop();
                  return;
                }
                speak(summary);
              }}
              className={`inline-flex items-center gap-2 ${isSpeaking ? actionBtnStop : actionBtnBlue}`}
            >
              {isSpeaking ? <Square size={14} /> : <Volume2 size={14} />}
              {isSpeaking ? 'Detener' : 'Resumen'}
            </button>
            <button
              type="button"
              disabled={!canSpeak}
              onClick={() => {
                if (isSpeaking) {
                  stop();
                  return;
                }
                speak(value);
              }}
              className={`inline-flex items-center gap-2 ${isSpeaking ? actionBtnStop : actionBtnBlue}`}
            >
              {isSpeaking ? <Square size={14} /> : <Volume2 size={14} />}
              {isSpeaking ? 'Detener' : 'Completo'}
            </button>
            <button
              type="button"
              disabled={disabled || !value.trim()}
              onClick={() => {
                const clean = stripMarkdown(value);
                const blob = new Blob([clean + "\n"], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "respuesta.txt";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
              className={actionBtnSlate}
            >
              TXT
            </button>
            <button
              type="button"
              disabled={disabled || !value.trim()}
              onClick={() => {
                const clean = stripMarkdown(value);
                const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Respuesta</title><style>
                  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px;color:#0f172a}
                  h1{font-size:16px;margin:0 0 12px}
                  pre{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5}
                  @page{margin:18mm}
                </style></head><body><h1>Respuesta</h1><pre>${escapeHtml(clean)}</pre></body></html>`;
                const w = window.open("", "_blank", "noopener,noreferrer");
                if (!w) return;
                w.document.open();
                w.document.write(html);
                w.document.close();
                w.focus();
                w.print();
              }}
              className={actionBtnSlate}
            >
              PDF
            </button>
            <button
              type="button"
              disabled={disabled || !value.trim()}
              onClick={() => window.print()}
              className={actionBtnBlue}
            >
              📄 Guardar Ficha o Imprimir (PDF)
            </button>
          </div>
        </div>
      ) : null}
      {((hasStructured && structuredResponse?.layout === "ficha") || (blocks && !shouldUseConversational)) ? (
        showSectionChips ? (
        <div className="no-print mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSpeak || !(hasStructured ? structuredResponse?.layout === "ficha" && structuredResponse.content.para_que_sirve : blocks.block1)}
            onClick={() => {
              if (hasStructured && structuredResponse?.layout === "ficha") {
                speak(`Para qué sirve. ${structuredResponse.content.para_que_sirve}`);
                return;
              }
              speak(`Para qué sirve. ${blocks.block1}`);
            }}
            className="min-h-[44px] rounded-2xl border border-emerald-400/35 bg-[#0b1628] px-4 text-[12px] font-semibold text-white/90 shadow-sm hover:bg-[#0d1b31] active:bg-[#091221] disabled:opacity-40"
          >
            Para qué sirve
          </button>
          <>
            <button
                type="button"
                disabled={!canSpeak || !(hasStructured ? structuredResponse?.layout === "ficha" && structuredResponse.content.dosis : blocks.block2)}
                onClick={() => {
                  if (hasStructured && structuredResponse?.layout === "ficha") {
                    speak(`Dosis terapéutica y máxima. ${structuredResponse.content.dosis}`);
                    return;
                  }
                  speak(`Dosis terapéutica y máxima. ${blocks.block2}`);
                }}
                className="min-h-[44px] rounded-2xl border border-sky-400/35 bg-[#0b1628] px-4 text-[12px] font-semibold text-white/90 shadow-sm hover:bg-[#0d1b31] active:bg-[#091221] disabled:opacity-40"
              >
                Dosis
              </button>
              <button
                type="button"
                disabled={!canSpeak || !(hasStructured ? structuredResponse?.layout === "ficha" && structuredResponse.content.precauciones : blocks.block3)}
                onClick={() => {
                  if (hasStructured && structuredResponse?.layout === "ficha") {
                    speak(`Precauciones. ${structuredResponse.content.precauciones}`);
                    return;
                  }
                  speak(`Precauciones. ${blocks.block3}`);
                }}
                className="min-h-[44px] rounded-2xl border border-amber-400/35 bg-[#0b1628] px-4 text-[12px] font-semibold text-white/90 shadow-sm hover:bg-[#0d1b31] active:bg-[#091221] disabled:opacity-40"
              >
                Precauciones
              </button>
              <button
                type="button"
                disabled={!canSpeak || !(hasStructured ? structuredResponse?.layout === "ficha" && structuredResponse.content.dieta : blocks.block4)}
                onClick={() => {
                  if (hasStructured && structuredResponse?.layout === "ficha") {
                    speak(`Dieta mientras lo toma. ${structuredResponse.content.dieta}`);
                    return;
                  }
                  speak(`Dieta mientras lo toma. ${blocks.block4}`);
                }}
                className="min-h-[44px] rounded-2xl border border-emerald-400/30 bg-[#0b1628] px-4 text-[12px] font-semibold text-white/90 shadow-sm hover:bg-[#0d1b31] active:bg-[#091221] disabled:opacity-40"
              >
                Dieta
              </button>
              <button
                type="button"
                disabled={!canSpeak || !(hasStructured ? structuredResponse?.layout === "ficha" && structuredResponse.content.efectos : blocks.block5)}
                onClick={() => {
                  if (hasStructured && structuredResponse?.layout === "ficha") {
                    speak(`Efectos secundarios. ${structuredResponse.content.efectos}`);
                    return;
                  }
                  speak(`Efectos secundarios. ${blocks.block5}`);
                }}
                className="min-h-[44px] rounded-2xl border border-red-400/35 bg-[#0b1628] px-4 text-[12px] font-semibold text-white/90 shadow-sm hover:bg-[#0d1b31] active:bg-[#091221] disabled:opacity-40"
              >
                Efectos
              </button>
          </>
        </div>
        ) : null
      ) : null}
      {hasStructured && structuredResponse?.layout === "ficha" ? (
        <div className="mt-3 grid gap-3">
          <div className="hidden print:block print-ficha-header">
            <div className="print-ficha-title">Ficha Médica de Orientación - Duoc UC</div>
          </div>
          <section className={`${cardBase} ${cardGlow.emerald} border-emerald-400/40`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">¿Para qué sirve?</div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
              {structuredResponse.content.para_que_sirve || '—'}
            </pre>
          </section>
          <section className={`${cardBase} ${cardGlow.sky} border-sky-400/40`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">💊 Dosis terapéutica y máxima</div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
              {structuredResponse.content.dosis || '—'}
            </pre>
          </section>
          <section className={`${cardBase} ${cardGlow.amber} border-amber-400/40`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">⚠️ Precauciones</div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
              {structuredResponse.content.precauciones || '—'}
            </pre>
            {specialConditions ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  className={`${sealBase} ${sealTone(specialConditions.pregnancy.level)}`}
                  title={specialConditions.pregnancy.message || ""}
                  onClick={() => {
                    if (!canSpeak) return;
                    const msg = specialConditions.pregnancy.message || "";
                    if (msg) speak(msg);
                  }}
                  disabled={!canSpeak}
                >
                  🤰 Embarazo
                </button>
                <button
                  type="button"
                  className={`${sealBase} ${sealTone(specialConditions.lactation.level)}`}
                  title={specialConditions.lactation.message || ""}
                  onClick={() => {
                    if (!canSpeak) return;
                    const msg = specialConditions.lactation.message || "";
                    if (msg) speak(msg);
                  }}
                  disabled={!canSpeak}
                >
                  🍼 Lactancia
                </button>
                <button
                  type="button"
                  className={`${sealBase} ${sealTone(specialConditions.driving.level)}`}
                  title={specialConditions.driving.message || ""}
                  onClick={() => {
                    if (!canSpeak) return;
                    const msg = specialConditions.driving.message || "";
                    if (msg) speak(msg);
                  }}
                  disabled={!canSpeak}
                >
                  🚗 Conducción
                </button>
              </div>
            ) : null}
          </section>
          <section className={`${cardBase} ${cardGlow.emerald} border-emerald-400/35`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">🥗 Dieta</div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
              {structuredResponse.content.dieta || '—'}
            </pre>
          </section>
          <section className={`${cardBase} ${cardGlow.red} border-red-400/45`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">🛑 Efectos secundarios</div>
            {effectsSplit.leves || effectsSplit.graves ? (
              <div className="relative mt-3 grid gap-0 sm:grid-cols-2 sm:items-stretch">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:rounded-r-none sm:border-r sm:border-red-500/30 sm:h-full">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">Leves</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
                    {effectsSplit.leves || '—'}
                  </pre>
                </div>
                <div className="rounded-2xl border border-red-300/25 bg-black/20 px-4 py-3 sm:rounded-l-none sm:border-l-0 sm:h-full">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/90">Graves (alarma)</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
                    {effectsSplit.graves || '—'}
                  </pre>
                </div>
              </div>
            ) : (
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
                {structuredResponse.content.efectos || '—'}
              </pre>
            )}
          </section>
          <div className="hidden print:block print-ficha-footer">
            Información educativa. No reemplaza la evaluación de un profesional de la salud. En caso de emergencia, acuda a urgencias.
          </div>
        </div>
      ) : blocks && !shouldUseConversational ? (
        <div className="mt-3 grid gap-3">
          <div className="hidden print:block print-ficha-header">
            <div className="print-ficha-title">Ficha Médica de Orientación - Duoc UC</div>
          </div>
          <section className={`${cardBase} ${cardGlow.emerald} border-emerald-400/40`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">¿Para qué sirve?</div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block1 || '—'}</pre>
          </section>
          {isV5 ? (
            <>
              <section className={`${cardBase} ${cardGlow.sky} border-sky-400/40`}>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">💊 Dosis terapéutica y máxima</div>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block2 || '—'}</pre>
              </section>
              <section className={`${cardBase} ${cardGlow.amber} border-amber-400/40`}>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">⚠️ Precauciones</div>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block3 || '—'}</pre>
                {specialConditions ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      className={`${sealBase} ${sealTone(specialConditions.pregnancy.level)}`}
                      title={specialConditions.pregnancy.message || ""}
                      onClick={() => {
                        if (!canSpeak) return;
                        const msg = specialConditions.pregnancy.message || "";
                        if (msg) speak(msg);
                      }}
                      disabled={!canSpeak}
                    >
                      🤰 Embarazo
                    </button>
                    <button
                      type="button"
                      className={`${sealBase} ${sealTone(specialConditions.lactation.level)}`}
                      title={specialConditions.lactation.message || ""}
                      onClick={() => {
                        if (!canSpeak) return;
                        const msg = specialConditions.lactation.message || "";
                        if (msg) speak(msg);
                      }}
                      disabled={!canSpeak}
                    >
                      🍼 Lactancia
                    </button>
                    <button
                      type="button"
                      className={`${sealBase} ${sealTone(specialConditions.driving.level)}`}
                      title={specialConditions.driving.message || ""}
                      onClick={() => {
                        if (!canSpeak) return;
                        const msg = specialConditions.driving.message || "";
                        if (msg) speak(msg);
                      }}
                      disabled={!canSpeak}
                    >
                      🚗 Conducción
                    </button>
                  </div>
                ) : null}
              </section>
              <section className={`${cardBase} ${cardGlow.emerald} border-emerald-400/35`}>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">🥗 Dieta</div>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block4 || '—'}</pre>
              </section>
              <section className={`${cardBase} ${cardGlow.red} border-red-400/45`}>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">🛑 Efectos secundarios</div>
                {effectsSplit.leves || effectsSplit.graves ? (
                  <div className="relative mt-3 grid gap-0 sm:grid-cols-2 sm:items-stretch">
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:rounded-r-none sm:border-r sm:border-red-500/30 sm:h-full">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">Leves</div>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
                        {effectsSplit.leves || '—'}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-red-300/25 bg-black/20 px-4 py-3 sm:rounded-l-none sm:border-l-0 sm:h-full">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/90">Graves (alarma)</div>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
                        {effectsSplit.graves || '—'}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block5 || '—'}</pre>
                )}
              </section>
            </>
          ) : (
            <>
              <section className={`${cardBase} ${cardGlow.amber} border-amber-400/40`}>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">⚠️ Cuidados importantes</div>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block2 || '—'}</pre>
              </section>
              <section className={`${cardBase} ${cardGlow.red} border-red-400/45`}>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">🛑 Efectos secundarios</div>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{blocks.block3 || '—'}</pre>
              </section>
            </>
          )}
          {blocks.disclaimer ? (
            <div className="rounded-3xl border border-white/10 bg-black/30 px-5 py-4 text-xs text-white/70">
              {blocks.disclaimer}
            </div>
          ) : null}
          <div className="hidden print:block print-ficha-footer">
            Información educativa. No reemplaza la evaluación de un profesional de la salud. En caso de emergencia, acuda a urgencias.
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="hidden print:block print-ficha-header">
            <div className="print-ficha-title">Ficha Médica de Orientación - Duoc UC</div>
          </div>
          <section className={`${cardBase} border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_26px_70px_-44px_rgba(148,163,184,0.18)]`}>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">Respuesta</div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">
              {conversationalText || placeholder}
            </pre>
          </section>
          {conversationalDisclaimer ? (
            <div className="rounded-3xl border border-white/10 bg-black/30 px-5 py-4 text-xs text-white/70">
              {conversationalDisclaimer}
            </div>
          ) : null}
          <div className="hidden print:block print-ficha-footer">
            Información educativa. No reemplaza la evaluación de un profesional de la salud. En caso de emergencia, acuda a urgencias.
          </div>
        </div>
      )}
    </div>
  );
}
