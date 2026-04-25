"use client";
import { useState, useCallback } from "react";

export const useQuantumSearch = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const search = useCallback(async (query: string) => {
    setIsSearching(true);
    try {
      // 1. Buscar en medicamentos
      const medRes = await fetch(`/api/medications?q=${query}`);
      const meds = await medRes.json();
      
      // 2. Analizar con IA
      const analysisRes = await fetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: { "Content-Type": "application/json" }
      });
      const analysis = await analysisRes.json();
      
      console.log("Análisis de IA:", analysis);
      setResults(meds);
    } catch (error) {
      console.error("Error en la búsqueda cuántica:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  return { isSearching, results, search };
};
