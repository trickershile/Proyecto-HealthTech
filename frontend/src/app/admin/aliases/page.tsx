"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AliasRow = { alias: string; medicamento: string };

export default function AdminAliasesPage() {
  const [alias, setAlias] = useState("");
  const [med, setMed] = useState("");
  const [items, setItems] = useState<AliasRow[]>([
    { alias: "acetaminofen", medicamento: "paracetamol" },
    { alias: "ventolin", medicamento: "salbutamol" },
  ]);

  const canAdd = useMemo(() => alias.trim() && med.trim(), [alias, med]);

  const add = () => {
    if (!canAdd) return;
    setItems((prev) => [{ alias: alias.trim(), medicamento: med.trim() }, ...prev]);
    setAlias("");
    setMed("");
  };

  return (
    <main className="min-h-screen bg-black text-slate-200 p-6">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-light tracking-wide">Aliases</div>
            <div className="text-xs text-white/60">Modo demo (solo visual).</div>
          </div>
          <Link href="/admin" className="text-xs text-cyan-200 hover:underline">
            Volver
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <div className="text-sm text-white/80">Crear alias</div>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
                placeholder="alias (ej. tylenol)"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
                placeholder="medicamento (ej. paracetamol)"
                value={med}
                onChange={(e) => setMed(e.target.value)}
              />
              <button
                type="button"
                onClick={add}
                className="w-full rounded-2xl bg-cyan-500/15 border border-cyan-400/20 px-4 py-3 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
                disabled={!canAdd}
              >
                Agregar (demo)
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <div className="text-sm text-white/80">Aliases</div>
            <div className="mt-4 space-y-2">
              {items.map((a, idx) => (
                <div key={`${a.alias}-${idx}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-sm text-white/90">{a.alias}</div>
                  <div className="mt-1 text-xs text-white/60">→ {a.medicamento}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

