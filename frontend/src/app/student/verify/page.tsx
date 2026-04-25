"use client";

import { useState } from "react";
import Link from "next/link";

export default function StudentVerifyPage() {
  const [fullName, setFullName] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"demo" | "pending">("demo");
  const [message, setMessage] = useState("");

  const submit = async () => {
    setMessage("");
    await new Promise((r) => setTimeout(r, 450));
    setStatus("pending");
    setMessage("Modo demo: solicitud registrada visualmente (backend reiniciado).");
  };

  return (
    <main className="min-h-screen bg-black text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-light tracking-wide">Verificación de Alumno</h1>
          <Link href="/" className="text-xs text-cyan-200 hover:underline">
            Volver
          </Link>
        </div>

        <div className="mt-2 text-xs text-white/60">Estado: {status === "pending" ? "Pendiente" : "Demo"}</div>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-white/70">Nombre completo</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/70">Certificado de alumno regular (PDF o imagen)</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
            {fileName ? <div className="text-[11px] text-white/50">{fileName}</div> : null}
          </div>

          {message ? <div className="text-xs text-cyan-200">{message}</div> : null}

          <button
            onClick={submit}
            className="w-full rounded-2xl bg-cyan-500/15 border border-cyan-400/20 px-4 py-3 text-sm text-cyan-200 hover:bg-cyan-500/20"
          >
            Enviar solicitud
          </button>
        </div>

        <div className="mt-6 text-xs text-white/50">
          Este apartado queda solo visual. La verificación real se reimplementará cuando reconstruyamos el backend.
        </div>
      </div>
    </main>
  );
}

