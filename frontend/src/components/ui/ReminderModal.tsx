"use client";

import { useEffect, useMemo, useState } from "react";

import { buildMedicationReminderIcs, downloadIcs, type ReminderUnit } from "@/lib/ics";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultMedicationName: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const toLocalDatetimeValue = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

export default function ReminderModal({ open, onClose, defaultMedicationName }: Props) {
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5);
    d.setSeconds(0, 0);
    return d;
  }, []);

  const [medicationName, setMedicationName] = useState(defaultMedicationName);
  const [startValue, setStartValue] = useState(toLocalDatetimeValue(defaultStart));
  const [interval, setInterval] = useState(8);
  const [unit, setUnit] = useState<ReminderUnit>("hours");
  const [durationDays, setDurationDays] = useState(7);

  useEffect(() => {
    if (!open) return;
    setMedicationName(defaultMedicationName);
  }, [defaultMedicationName, open]);

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-950/85 shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/70">Recordatorio de toma</div>
          <div className="mt-2 text-lg font-semibold text-white">Agregar al calendario</div>
          <div className="mt-1 text-sm text-white/60">Se descargará un archivo .ics para abrir el calendario del teléfono o PC.</div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/60">Medicamento</div>
            <input
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Ej: Loratadina"
            />
          </label>

          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/60">Hora de inicio</div>
            <input
              type="datetime-local"
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/60">Frecuencia</div>
              <input
                type="number"
                min={1}
                value={interval}
                onChange={(e) => setInterval(Math.max(1, Number(e.target.value || 1)))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/60">Unidad</div>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value === "days" ? "days" : "hours")}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </label>
          </div>

          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/60">Duración (días)</div>
            <input
              type="number"
              min={1}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value || 1)))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white/80 hover:border-white/20"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              const start = new Date(startValue);
              if (Number.isNaN(start.getTime())) return;
              const ics = buildMedicationReminderIcs({
                medicationName: medicationName.trim() || defaultMedicationName || "Medicamento",
                startLocal: start,
                interval,
                unit,
                durationDays,
              });
              downloadIcs(ics, `recordatorio-${medicationName || defaultMedicationName || "medicamento"}`);
              onClose();
            }}
            className="min-h-[44px] rounded-2xl bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 active:bg-sky-800"
          >
            Descargar .ics
          </button>
        </div>
      </div>
    </div>
  );
}
