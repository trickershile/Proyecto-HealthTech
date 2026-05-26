"use client";
import React, { useState } from 'react';
import { Search, Mic } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isListening?: boolean;
  onVoiceClick?: () => void;
  showMic?: boolean;
  showCounter?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  isListening = false,
  onVoiceClick,
  showMic = true,
  showCounter = true,
}) => {
  const [query, setQuery] = useState("");
  const maxLen = 200;

  const idleIconColor = 'text-slate-400 group-focus-within:text-emerald-200';
  const listeningIconColor = 'text-emerald-300 animate-pulse';
  const inputBase =
    'bg-white/5 border-emerald-500/15 text-slate-100 placeholder-emerald-100/45 focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-400/40';
  const inputListening = 'border-emerald-400/50 ring-2 ring-emerald-500/25';
  const micIdle = 'text-slate-400 hover:text-emerald-200';
  const micListening = 'text-emerald-300 animate-bounce';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative group w-full">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className={`h-5 w-5 ${isListening ? listeningIconColor : idleIconColor} transition-colors`} />
      </div>
      
      <input
        type="text"
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value.slice(0, maxLen))}
        className={`block w-full pl-10 pr-12 py-4 border rounded-2xl focus:outline-none backdrop-blur-xl transition-all ${inputBase} ${isListening ? inputListening : ''}`}
        placeholder={isListening ? "Escuchando..." : "Ej: ¿Para qué sirve la Loratadina? o ingrese un medicamento..."}
        maxLength={maxLen}
        aria-label="Pregunta farmacológica"
      />

      {showCounter ? (
        <div className="absolute inset-y-0 right-10 pr-2 flex items-center pointer-events-none text-[10px] text-white/45 tabular-nums">
          {maxLen - query.length}
        </div>
      ) : null}
      
      {showMic ? (
        <button
          type="button"
          className="absolute inset-y-0 right-0 pr-3 flex items-center"
          onClick={onVoiceClick}
          aria-label={isListening ? "Detener micrófono" : "Hablar por micrófono"}
        >
          <Mic className={`h-5 w-5 ${isListening ? micListening : micIdle} transition-colors`} />
        </button>
      ) : null}
    </form>
  );
};

export default React.memo(SearchBar);
