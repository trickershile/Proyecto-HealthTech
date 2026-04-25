"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type RolInicial = 'alumno' | 'paciente';

export default function RegistroPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<RolInicial>('paciente');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const okEmail = email.trim().length > 3;
    const okName = nombre.trim().length >= 2;
    const okPass = password.length >= 6 && password === password2;
    return okEmail && okName && okPass && !loading;
  }, [email, nombre, password, password2, loading]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY');
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            nombre: nombre.trim(),
            rol,
          },
        },
      });

      if (authError) throw authError;

      if (!data.session) {
        setSuccessMsg('Cuenta creada. Revisa tu correo para confirmar el registro y luego inicia sesión.');
        return;
      }

      setSuccessMsg('Cuenta creada. Redirigiendo…');
      router.replace('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la cuenta.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black text-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <Link href="/" className="text-sm text-sky-300 hover:text-sky-200 transition-colors">
            ← Volver al inicio
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-2xl shadow-[0_0_60px_rgba(15,23,42,0.35)]">
          <div className="text-xs uppercase tracking-[0.34em] text-white/60">Registro</div>
          <h1 className="mt-3 text-3xl font-light tracking-wide">Crea tu cuenta</h1>
          <p className="mt-3 text-sm text-white/65 leading-relaxed">
            Elige tu rol inicial y completa tus datos. Tu perfil se crea automáticamente en la base de datos.
          </p>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {successMsg ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {successMsg}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
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

            <div className="sm:col-span-2">
              <label className="block text-xs text-white/60 uppercase tracking-[0.22em]">Nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                type="text"
                autoComplete="name"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                placeholder="Tu nombre"
                aria-label="Nombre"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-white/60 uppercase tracking-[0.22em]">Rol inicial</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRol('alumno')}
                  className={`rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    rol === 'alumno'
                      ? 'border-sky-400/40 bg-sky-400/10 text-white'
                      : 'border-white/10 bg-black/30 text-white/75 hover:bg-white/[0.04]'
                  }`}
                  aria-label="Soy Alumno"
                >
                  Soy Alumno
                </button>
                <button
                  type="button"
                  onClick={() => setRol('paciente')}
                  className={`rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    rol === 'paciente'
                      ? 'border-sky-400/40 bg-sky-400/10 text-white'
                      : 'border-white/10 bg-black/30 text-white/75 hover:bg-white/[0.04]'
                  }`}
                  aria-label="Soy Paciente"
                >
                  Soy Paciente
                </button>
              </div>
              <div className="mt-2 text-xs text-white/45">
                Admin se asigna manualmente.
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/60 uppercase tracking-[0.22em]">Contraseña</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                placeholder="••••••••"
                aria-label="Contraseña"
              />
            </div>

            <div>
              <label className="block text-xs text-white/60 uppercase tracking-[0.22em]">Confirmar contraseña</label>
              <input
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                type="password"
                autoComplete="new-password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                placeholder="••••••••"
                aria-label="Confirmar contraseña"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-sky-400/90 px-4 py-3 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-300 disabled:opacity-50 disabled:hover:bg-sky-400/90"
              >
                {loading ? 'Creando…' : 'Crear cuenta'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-sm text-white/60">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-sky-300 hover:text-sky-200 transition-colors">
              Inicia sesión
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
