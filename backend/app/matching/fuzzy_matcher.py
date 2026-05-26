from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher


@dataclass(frozen=True)
class MatchResult:
    value: str
    score: float


class FuzzyMatcher:
    def __init__(self) -> None:
        pass

    def best_match(self, query: str, candidates: list[str]) -> MatchResult | None:
        q = self._normalize(query)
        if not q:
            return None
        best_value = ""
        best_score = 0.0
        for c in candidates:
            c_norm = self._normalize(c)
            if not c_norm:
                continue
            score = self._score(q, c_norm)
            if score > best_score:
                best_score = score
                best_value = c
        if not best_value:
            return None
        return MatchResult(value=best_value, score=best_score)

    def _score(self, a: str, b: str) -> float:
        direct = SequenceMatcher(a=a, b=b).ratio()
        ta = self._token_sort(a)
        tb = self._token_sort(b)
        token = SequenceMatcher(a=ta, b=tb).ratio()
        return max(direct, token)

    def _token_sort(self, s: str) -> str:
        toks = [t for t in re.split(r"\s+", s) if t]
        toks.sort()
        return " ".join(toks)

    def _normalize(self, s: str) -> str:
        raw = (s or "").strip().lower()
        if not raw:
            return ""
        raw = "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")
        raw = re.sub(r"[^a-z0-9\s]+", " ", raw)
        raw = re.sub(r"\s+", " ", raw).strip()
        return raw

