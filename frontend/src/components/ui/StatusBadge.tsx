"use client";
import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface StatusBadgeProps {
  type: "RAM" | "PRM" | "Seguro";
  severity?: "bajo" | "medio" | "alto";
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ type, severity = "bajo" }) => {
  const getColors = () => {
    if (type === "Seguro") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (severity === "alto") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (severity === "medio") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider backdrop-blur-sm ${getColors()}`}>
      {type === "Seguro" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
      {type} {severity !== "bajo" && `- ${severity}`}
    </div>
  );
};

export default StatusBadge;
