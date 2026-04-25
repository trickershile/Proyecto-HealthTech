"use client";

import { useEffect, useRef } from 'react';

type Props = {
  label?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export default function AssistantOutputBox({
  label = 'Respuesta del asistente',
  value,
  placeholder = 'Aquí verás la respuesta del asistente…',
  disabled = false,
  className = ''
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [value]);

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.32em] text-white/60">{label}</div>
      </div>
      <textarea
        ref={ref}
        value={value}
        readOnly
        disabled={disabled}
        placeholder={placeholder}
        onScroll={(e) => {
          const el = e.currentTarget;
          const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = remaining < 24;
        }}
        className="mt-3 h-44 sm:h-52 md:h-60 w-full resize-none rounded-3xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white/85 placeholder:text-white/35 shadow-[0_0_60px_rgba(15,23,42,0.25)] focus:outline-none focus:ring-2 focus:ring-sky-400/30"
        rows={6}
      />
    </div>
  );
}
