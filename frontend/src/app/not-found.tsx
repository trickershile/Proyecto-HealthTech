export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="text-[10px] uppercase tracking-[0.42em] text-white/60">Duoc UC</div>
        <div className="mt-3 text-3xl font-semibold tracking-tight">Página no encontrada</div>
        <div className="mt-3 text-sm text-white/60">Revise la dirección o vuelva al inicio.</div>
        <a
          href="/"
          className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-3xl bg-sky-700 px-6 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 active:bg-sky-800"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
