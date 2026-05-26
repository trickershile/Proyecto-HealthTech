"use client";

import { useEffect } from "react";
import { Square, Volume2 } from "lucide-react";

type StructuredConversationalContent = {
  respuesta_directa: string;
  alerta_seguridad: string;
  pasos_a_seguir: string;
};

type StructuredResponse = { layout: "conversacional"; content: StructuredConversationalContent };

type Props = {
  open: boolean;
  onClose: () => void;
  text: string;
  structuredResponse?: StructuredResponse | null;
  voice?: {
    speak: (text: string, onEnd?: () => void) => void;
    stop: () => void;
    isSpeaking: boolean;
  };
};

export default function AnswerModal({ open, onClose, text, structuredResponse = null, voice }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const content = structuredResponse?.content;
  const parts: string[] = [];
  const r = String(content?.respuesta_directa || "").trim();
  const a = String(content?.alerta_seguridad || "").trim();
  const p = String(content?.pasos_a_seguir || "").trim();
  if (r) parts.push(r);
  if (a) parts.push(`⚠️ ${a}`);
  if (p) parts.push(`Pasos a seguir:\n${p}`);
  const finalText = (parts.join("\n\n").trim() || String(text || "").trim()).trim();

  const speak = voice?.speak;
  const stop = voice?.stop;
  const isSpeaking = voice?.isSpeaking ?? false;

  const exportTxt = () => {
    const blob = new Blob([finalText + "\n"], { type: "text/plain;charset=utf-8" });
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
    const escapeHtml = (s: string) =>
      (s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Respuesta</title><style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px;color:#0f172a}
      h1{font-size:16px;margin:0 0 12px}
      pre{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5}
      @page{margin:18mm}
    </style></head><body><h1>Respuesta</h1><pre>${escapeHtml(finalText)}</pre></body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Cerrar modal" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/85 shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/70">Respuesta</div>
            <div className="mt-2 text-lg font-semibold text-white">Modo conversacional</div>
            <div className="mt-1 text-sm text-white/60">Para dudas, olvidos, interacciones o síntomas.</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={exportTxt}
              className="min-h-[44px] rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white/80 hover:border-white/20"
            >
              TXT
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="min-h-[44px] rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white/80 hover:border-white/20"
            >
              PDF
            </button>
            {speak && stop ? (
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking) {
                    stop();
                    return;
                  }
                  if (!finalText) return;
                  speak(finalText);
                }}
                className={`min-h-[44px] rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition-colors ${
                  isSpeaking ? "bg-red-600 hover:bg-red-500 active:bg-red-700" : "bg-sky-700 hover:bg-sky-600 active:bg-sky-800"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {isSpeaking ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  <span>{isSpeaking ? "Detener" : "Escuchar"}</span>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white/80 hover:border-white/20"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <section className="rounded-3xl border-2 border-white/10 bg-[#0b1628] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_26px_70px_-44px_rgba(148,163,184,0.18)]">
            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white font-sans">{finalText || "—"}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}
