"""
Índice local en memoria para resolver nombres de medicamentos (normalización + fuzzy matching).

Objetivo:
- Antes de hacer RAG/vector search, intentar "entender" qué medicamento quiso decir el usuario,
  incluso con errores ortográficos o sinónimos (aliases).

Fuentes:
- SUPABASE_RAG_TABLE: tabla RAG (lee nombre_medicamento).
- SUPABASE_ALIAS_TABLE: tabla de aliases opcional (alias -> medicamento o alias -> medicamento_id).
- SUPABASE_MED_TABLE: tabla de medicamentos (para resolver medicamento_id -> nombre).

Cache:
- TTL configurable con MED_INDEX_TTL_SECONDS.
- Umbral de similitud con MED_INDEX_MIN_SCORE.
"""

from __future__ import annotations

import os
import threading
import time
import heapq
from dataclasses import dataclass

from supabase import Client

from ..matching.fuzzy_matcher import FuzzyMatcher, MatchResult


@dataclass(frozen=True)
class ResolvedMedication:
    """
    Resultado de resolución de un medicamento.

    - raw_query: texto original detectado (token) del usuario.
    - resolved_name: nombre canónico (como está en la tabla RAG).
    - score: 0..1 de similitud (1.0 en caso de alias exacto).
    - via: "alias" o "fuzzy".
    """
    raw_query: str
    resolved_name: str
    score: float
    via: str


class MedicationIndex:
    def __init__(self, supabase: Client) -> None:
        self._supabase = supabase
        self._lock = threading.Lock()
        self._names: list[str] = []
        self._aliases: dict[str, str] = {}
        self._loaded_at = 0.0
        # TTL de cache del índice (segundos). Evita consultar Supabase en cada pregunta.
        self._ttl_seconds = int(os.getenv("MED_INDEX_TTL_SECONDS") or "900")
        # Umbral mínimo para aceptar un match fuzzy.
        self._min_score = float(os.getenv("MED_INDEX_MIN_SCORE") or "0.84")
        # Tablas configurables vía entorno (útil cuando migras a v2).
        self._rag_table = (os.getenv("SUPABASE_RAG_TABLE") or "documentos_medicos").strip()
        self._alias_table = (os.getenv("SUPABASE_ALIAS_TABLE") or "").strip()
        self._med_table = (os.getenv("SUPABASE_MED_TABLE") or "medicamentos").strip()
        self._matcher = FuzzyMatcher()

    def refresh(self) -> int:
        """
        Refresca el índice desde Supabase.

        Devuelve la cantidad de nombres únicos cargados.
        """
        names: list[str] = []
        aliases: dict[str, str] = {}

        # 1) Cargar nombres "canónicos" desde la tabla RAG.
        resp = self._supabase.table(self._rag_table).select("nombre_medicamento").limit(10000).execute()
        data = getattr(resp, "data", None)
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict):
                    v = row.get("nombre_medicamento")
                    if isinstance(v, str) and v.strip():
                        names.append(v.strip())

        # 2) Opcional: cargar aliases.
        #    Soporta dos esquemas:
        #    - alias + medicamento (texto ya resuelto)
        #    - alias + medicamento_id (luego resolvemos el id contra medicamentos.nombre)
        if self._alias_table:
            try:
                adata = None
                for sel in ("alias,medicamento,medicamento_id", "alias,medicamento"):
                    try:
                        aresp = self._supabase.table(self._alias_table).select(sel).limit(20000).execute()
                        adata = getattr(aresp, "data", None)
                        break
                    except Exception:
                        continue
                id_to_aliases: dict[int, list[str]] = {}
                if isinstance(adata, list):
                    for row in adata:
                        if not isinstance(row, dict):
                            continue
                        alias = row.get("alias")
                        med = row.get("medicamento")
                        med_id = row.get("medicamento_id")
                        if isinstance(alias, str) and alias.strip() and isinstance(med, str) and med.strip():
                            aliases[self._norm(alias)] = med.strip()
                            continue
                        if isinstance(alias, str) and alias.strip() and isinstance(med_id, int):
                            id_to_aliases.setdefault(med_id, []).append(alias.strip())

                # Resolver medicamento_id -> medicamentos.nombre
                if id_to_aliases:
                    ids = list(id_to_aliases.keys())[:5000]
                    mresp = self._supabase.table(self._med_table).select("id,nombre").in_("id", ids).limit(5000).execute()
                    mdata = getattr(mresp, "data", None)
                    if isinstance(mdata, list):
                        for row in mdata:
                            if not isinstance(row, dict):
                                continue
                            mid = row.get("id")
                            nombre = row.get("nombre")
                            if not isinstance(mid, int) or not isinstance(nombre, str) or not nombre.strip():
                                continue
                            for a in id_to_aliases.get(mid, []):
                                aliases[self._norm(a)] = nombre.strip()
            except Exception:
                pass

        # 3) De-duplicar nombres por forma normalizada.
        uniq = []
        seen = set()
        for n in names:
            key = self._norm(n)
            if not key or key in seen:
                continue
            seen.add(key)
            uniq.append(n)

        with self._lock:
            self._names = uniq
            self._aliases = aliases
            self._loaded_at = time.time()
        return len(uniq)

    def ensure_loaded(self) -> None:
        """Carga (o recarga) el índice si está vacío o expiró el TTL."""
        with self._lock:
            loaded_at = self._loaded_at
        if loaded_at and (time.time() - loaded_at) < self._ttl_seconds:
            return
        self.refresh()

    def resolve(self, query: str) -> ResolvedMedication | None:
        """
        Intenta resolver un texto (token) a un medicamento conocido.

        Estrategia:
        1) Alias exacto (normalizado).
        2) Mejor match fuzzy sobre la lista de nombres.
        """
        raw = (query or "").strip()
        if not raw:
            return None
        self.ensure_loaded()
        qnorm = self._norm(raw)

        with self._lock:
            alias_target = self._aliases.get(qnorm)
            names = list(self._names)

        # Alias exacto (sin costo adicional).
        if alias_target:
            return ResolvedMedication(raw_query=raw, resolved_name=alias_target, score=1.0, via="alias")

        # Fuzzy matching (SequenceMatcher con normalización).
        match: MatchResult | None = self._matcher.best_match(raw, names)
        if match is None:
            return None
        if match.score < self._min_score:
            return None
        return ResolvedMedication(raw_query=raw, resolved_name=match.value, score=float(match.score), via="fuzzy")

    def suggest(self, query: str, limit: int = 5) -> list[ResolvedMedication]:
        raw = (query or "").strip()
        if not raw or limit <= 0:
            return []
        self.ensure_loaded()
        qnorm = self._norm(raw)

        with self._lock:
            alias_target = self._aliases.get(qnorm)
            names = list(self._names)

        if alias_target:
            return [ResolvedMedication(raw_query=raw, resolved_name=alias_target, score=1.0, via="alias")]

        q = self._matcher._normalize(raw)
        if not q:
            return []

        threshold = max(0.0, self._min_score - 0.08)
        heap: list[tuple[float, str]] = []
        for c in names:
            c_norm = self._matcher._normalize(c)
            if not c_norm:
                continue
            score = float(self._matcher._score(q, c_norm))
            if score < threshold:
                continue
            if len(heap) < limit:
                heapq.heappush(heap, (score, c))
                continue
            if score > heap[0][0]:
                heapq.heapreplace(heap, (score, c))

        heap.sort(key=lambda x: x[0], reverse=True)
        return [ResolvedMedication(raw_query=raw, resolved_name=name, score=score, via="fuzzy") for score, name in heap]

    def _norm(self, s: str) -> str:
        """Normaliza texto para comparación (delegado al matcher)."""
        return self._matcher._normalize(s)
