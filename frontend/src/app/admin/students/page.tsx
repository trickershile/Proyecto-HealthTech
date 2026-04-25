"use client";

import Link from "next/link";

export default function AdminStudentsPage() {
  return (
    <main className="min-h-screen bg-black text-slate-200 p-6">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-light tracking-wide">Alumnos</div>
            <div className="text-xs text-white/60">Modo demo (solo visual).</div>
          </div>
          <Link href="/admin" className="text-xs text-cyan-200 hover:underline">
            Volver
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-5 text-sm text-white/70">
          Aquí se listarán solicitudes de verificación y acciones Aprobar/Rechazar cuando reconstruyamos el backend.
        </div>
      </div>
    </main>
  );
}

