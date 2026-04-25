"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 450));
      router.push("/admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-light tracking-wide">Login Admin</h1>
          <Link href="/" className="text-xs text-cyan-200 hover:underline">
            Volver
          </Link>
        </div>
        <div className="mt-2 text-xs text-white/60">Modo demo (solo visual). La seguridad real se reimplementará en el nuevo backend.</div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-white/70">Email</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/70">Contraseña</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <div className="text-xs text-red-300">{error}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-cyan-500/15 border border-cyan-400/20 px-4 py-3 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
          >
            {loading ? "Procesando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}

