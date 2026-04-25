"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY');
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      router.replace('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black text-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8">
          <Link href="/" className="text-sm text-sky-300 hover:text-sky-200 transition-colors">
            ← Volver al inicio
          </Link>
        </div>

        <div className="grid gap-10 lg:grid-cols-2 items-start">
          <div className="hidden lg:block">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-2xl">
              <div className="text-xs uppercase tracking-[0.34em] text-white/60">Acceso seguro</div>
              <h1 className="mt-3 text-3xl font-light tracking-wide">Iniciar sesión</h1>
              <p className="mt-4 text-sm text-white/65 leading-relaxed">
                Accede a tu cuenta para continuar. Tu experiencia se adapta automáticamente según tu rol: Admin, Alumno o Paciente.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Admin</div>
                  <div className="mt-2 text-xs text-white/60">Gestión y control.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Alumno</div>
                  <div className="mt-2 text-xs text-white/60">Aprendizaje guiado.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Paciente</div>
                  <div className="mt-2 text-xs text-white/60">Asistencia clara.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-2xl shadow-[0_0_60px_rgba(15,23,42,0.35)]">
            <div className="text-xs uppercase tracking-[0.34em] text-white/60">Login</div>
            <h2 className="mt-3 text-2xl font-light tracking-wide">Bienvenido/a</h2>

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs text-white/60 uppercase tracking-[0.22em]">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                  placeholder="tu@email.com"
                  aria-label="Email"
                />
              </div>

              <div>
                <label className="block text-xs text-white/60 uppercase tracking-[0.22em]">Contraseña</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                  placeholder="••••••••"
                  aria-label="Contraseña"
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-sky-400/90 px-4 py-3 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-300 disabled:opacity-50 disabled:hover:bg-sky-400/90"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <div className="mt-6 text-sm text-white/60">
              ¿No tienes cuenta?{' '}
              <Link href="/registro" className="text-sky-300 hover:text-sky-200 transition-colors">
                Regístrate
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
