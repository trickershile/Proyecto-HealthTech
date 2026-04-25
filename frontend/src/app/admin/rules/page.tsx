"use client";

import { useState } from "react";
import Link from "next/link";

type Rule = { keyword: string; tags: string };

export default function AdminRulesPage() {
  const [keyword, setKeyword] = useState("");
  const [tags, setTags] = useState("");
  const [items, setItems] = useState<Rule[]>([
    { keyword: "fiebre", tags: "antipiretico, analgesico" },
    { keyword: "alergia", tags: "antihistaminico" },
  ]);

  const add = () => {
    const k = keyword.trim();
    const t = tags.trim();
    if (!k || !t) return;
    setItems((prev) => [{ keyword: k, tags: t }, ...prev]);
    setKeyword("");
    setTags("");
  };

  return (
    <main className="min-h-screen bg-black text-slate-200 p-6">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-light tracking-wide">Reglas (síntomas)</div>
            <div className="text-xs text-white/60">Modo demo (solo visual).</div>
          </div>
          <Link href="/admin" className="text-xs text-cyan-200 hover:underline">
            Volver
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <div className="text-sm text-white/80">Crear regla</div>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
                placeholder="keyword (ej. fiebre)"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
                placeholder="tags (ej. antipiretico,analgesico)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <button
                type="button"
                onClick={add}
                className="w-full rounded-2xl bg-cyan-500/15 border border-cyan-400/20 px-4 py-3 text-sm text-cyan-200 hover:bg-cyan-500/20"
              >
                Agregar (demo)
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <div className="text-sm text-white/80">Reglas</div>
            <div className="mt-4 space-y-2">
              {items.map((r, idx) => (
                <div key={`${r.keyword}-${idx}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-sm text-white/90">{r.keyword}</div>
                  <div className="mt-1 text-xs text-white/60">{r.tags}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

