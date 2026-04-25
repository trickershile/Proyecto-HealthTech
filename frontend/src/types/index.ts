export interface Medication {
  id: number;
  nombre: string;
  principioActivo: string;
  nivelRiesgo: "low" | "medium" | "high";
  ram: string[];
  interacciones: string[];
}

export interface AnalysisResult {
  query: string;
  medication?: Medication;
  ai_analysis: string;
  status: "success" | "warning" | "error";
}
