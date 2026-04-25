"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-black text-slate-200 p-6">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-light tracking-wide">Panel Admin</div>
            <div className="text-xs text-white/60">Modo demo (solo visual). Backend en reconstrucción.</div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:text-white">
              Home
            </Link>
            <button
              type="button"
              onClick={() => router.push("/admin/login")}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:text-white"
            >
              Salir
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <div className="text-sm text-white/90">Medicamentos</div>
            <div className="mt-1 text-xs text-white/50">Crear/editar campos (demo)</div>
          </div>
          <Link href="/admin/rules" className="rounded-3xl border border-white/10 bg-black/30 p-5 hover:border-cyan-400/20">
            <div className="text-sm text-white/90">Reglas (síntomas)</div>
            <div className="mt-1 text-xs text-white/50">Keyword → tags (demo)</div>
          </Link>
          <Link href="/admin/aliases" className="rounded-3xl border border-white/10 bg-black/30 p-5 hover:border-cyan-400/20">
            <div className="text-sm text-white/90">Aliases</div>
            <div className="mt-1 text-xs text-white/50">Sinónimos / marcas (demo)</div>
          </Link>
          <Link href="/admin/students" className="rounded-3xl border border-white/10 bg-black/30 p-5 hover:border-cyan-400/20">
            <div className="text-sm text-white/90">Alumnos</div>
            <div className="mt-1 text-xs text-white/50">Aprobación/verificación (demo)</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
