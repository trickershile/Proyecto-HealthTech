"use client";
import React, { useState } from 'react';
import { Search, Mic } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isListening?: boolean;
  onVoiceClick?: () => void;
  mode?: 'paciente' | 'alumno';
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isListening = false, onVoiceClick, mode = 'paciente' }) => {
  const [query, setQuery] = useState("");
  const isAlumno = mode === 'alumno';

  const idleIconColor = isAlumno ? 'text-slate-400 group-focus-within:text-slate-200' : 'text-slate-400 group-focus-within:text-emerald-200';
  const listeningIconColor = isAlumno ? 'text-slate-200 animate-pulse' : 'text-emerald-300 animate-pulse';
  const inputBase = isAlumno
    ? 'bg-black/60 border-white/10 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-slate-500/40 focus:border-slate-400/60'
    : 'bg-white/5 border-emerald-500/15 text-slate-100 placeholder-emerald-100/45 focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-400/40';
  const inputListening = isAlumno
    ? 'border-slate-400/50 ring-2 ring-slate-500/25'
    : 'border-emerald-400/50 ring-2 ring-emerald-500/25';
  const micIdle = isAlumno ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-emerald-200';
  const micListening = isAlumno ? 'text-slate-200 animate-bounce' : 'text-emerald-300 animate-bounce';

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
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        className={`block w-full pl-10 pr-12 py-3 border rounded-2xl focus:outline-none backdrop-blur-xl transition-all ${inputBase} ${isListening ? inputListening : ''}`}
        placeholder={isListening ? "Escuchando..." : "¿Qué medicamento buscas?"}
      />
      
      <button
        type="button"
        className="absolute inset-y-0 right-0 pr-3 flex items-center"
        onClick={onVoiceClick}
      >
        <Mic className={`h-5 w-5 ${isListening ? micListening : micIdle} transition-colors`} />
      </button>
    </form>
  );
};

export default React.memo(SearchBar);
