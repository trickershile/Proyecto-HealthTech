"use client";
import React from 'react';
import StatusBadge from '../ui/StatusBadge';
import { Pill, Info, AlertTriangle } from 'lucide-react';

interface MedicationResultProps {
  nombre: string;
  principioActivo: string;
  nivelRiesgo: "low" | "medium" | "high";
  ram: string[];
}

const MedicationResult: React.FC<MedicationResultProps> = ({ nombre, principioActivo, nivelRiesgo, ram }) => {
  return (
    <div className="w-full bg-black/40 border border-white/5 rounded-3xl p-6 backdrop-blur-2xl hover:border-purple-500/20 transition-all duration-500 group">
      <div className="flex items-start justify-between">
        <div className="flex gap-4 min-w-0">
          <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
            <Pill className="text-purple-400 h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-white group-hover:text-purple-300 transition-colors whitespace-normal break-words">
              {nombre}
            </h3>
            <p className="text-sm text-gray-400 mt-1 uppercase tracking-widest whitespace-normal break-words">
              {principioActivo}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <StatusBadge 
            type={nivelRiesgo === "low" ? "Seguro" : "PRM"} 
            severity={nivelRiesgo === "high" ? "alto" : nivelRiesgo === "medium" ? "medio" : "bajo"} 
          />
        </div>
      </div>
      
      <div className="mt-4">
        <p className="text-xs text-gray-500 uppercase tracking-tighter mb-2">Reacciones Adversas (RAM):</p>
        <div className="flex flex-wrap gap-2">
          {ram.slice(0, 3).map((r, i) => (
            <span key={i} className="text-[10px] bg-white/5 px-2 py-1 rounded-md text-gray-400">{r}</span>
          ))}
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-medium text-gray-300 transition-all">
          <Info size={16} /> Ver Detalles
        </button>
        <button className="flex items-center justify-center gap-2 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl text-sm font-medium text-red-400 transition-all">
          <AlertTriangle size={16} /> Contraindicaciones
        </button>
      </div>
    </div>
  );
};

export default MedicationResult;
