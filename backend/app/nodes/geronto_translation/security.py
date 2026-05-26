from __future__ import annotations

import base64
import hmac
import json
import os
import re
import threading
import time

from fastapi import HTTPException, Request, status


class ApiKeyAuth:
    def __init__(self, env_var: str = "INTERNAL_API_KEY", header_name: str = "X-API-Key") -> None:
        self._env_var = env_var
        self._header_name = header_name

    def __call__(self, request: Request) -> None:
        expected = os.getenv(self._env_var) or ""
        if not expected:
            try:
                from ...config.env import load_env

                load_env()
            except Exception:
                pass
            expected = os.getenv(self._env_var) or ""
            if not expected:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Falta configurar {self._env_var}",
                )
        received = request.headers.get(self._header_name) or ""
        if not received or not hmac.compare_digest(received, expected):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")


class PromptInjectionGuard:
    def __init__(self) -> None:
        self._patterns: list[re.Pattern[str]] = [
            re.compile(r"ignore\s+(all|previous)\s+instructions", re.IGNORECASE),
            re.compile(r"system\s+prompt", re.IGNORECASE),
            re.compile(r"developer\s+message", re.IGNORECASE),
            re.compile(r"act\s+as\s+", re.IGNORECASE),
            re.compile(r"bypass|jailbreak|do\s+anything\s+now", re.IGNORECASE),
        ]

    def validate(self, text: str) -> None:
        t = (text or "").strip()
        if not t:
            return
        for p in self._patterns:
            if p.search(t):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Entrada rechazada por posibles instrucciones maliciosas",
                )


def _b64url_decode(raw: str) -> bytes:
    s = (raw or "").strip()
    if not s:
        return b""
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


class JwtAuth:
    def __init__(
        self,
        env_var: str = "INTERNAL_JWT_SECRET",
        header_name: str = "Authorization",
        max_clock_skew_seconds: int = 20,
    ) -> None:
        self._env_var = env_var
        self._header_name = header_name
        self._skew = max(0, int(max_clock_skew_seconds))

    def __call__(self, request: Request) -> None:
        secret = os.getenv(self._env_var) or ""
        if not secret:
            return
        raw = (request.headers.get(self._header_name) or "").strip()
        if not raw.lower().startswith("bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
        token = raw.split(" ", 1)[1].strip()
        parts = token.split(".")
        if len(parts) != 3:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), signing_input, digestmod="sha256").digest()
        try:
            received_sig = _b64url_decode(sig_b64)
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
        if not hmac.compare_digest(received_sig, expected_sig):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
        try:
            payload = json.loads(_b64url_decode(payload_b64).decode("utf-8") or "{}")
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
        exp = payload.get("exp")
        now = int(time.time())
        if isinstance(exp, (int, float)):
            if now > int(exp) + self._skew:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")


class RateLimiter:
    def __init__(self, max_requests: int = 5, window_seconds: int = 60) -> None:
        self._max = max(1, int(max_requests))
        self._window = max(1, int(window_seconds))
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def __call__(self, request: Request) -> None:
        xff = (request.headers.get("x-forwarded-for") or "").strip()
        ip = (xff.split(",")[0].strip() if xff else "") or (request.headers.get("x-real-ip") or "").strip()
        if not ip:
            ip = request.client.host if request.client else "unknown"
        now = time.time()
        cutoff = now - float(self._window)
        with self._lock:
            arr = self._hits.get(ip, [])
            arr = [t for t in arr if t >= cutoff]
            if len(arr) >= self._max:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit excedido")
            arr.append(now)
            self._hits[ip] = arr


class ProhibitedUseDetector:
    def __init__(self) -> None:
        self._patterns: list[re.Pattern[str]] = [
            re.compile(r"\bfabric(ar|ar)?\s+(drogas?|cocaina|coca[ií]na|hero[ií]na|metanfetamina)\b", re.IGNORECASE),
            re.compile(r"\bcocin(ar|ar)?\s+(metanfetamina|cristal)\b", re.IGNORECASE),
            re.compile(r"\bextra(er|er)?\s+(dmt|d\.m\.t)\b", re.IGNORECASE),
            re.compile(r"\bmezcla(s)?\s+para\s+(alucinar|colocarse)\b", re.IGNORECASE),
            re.compile(r"\bcomo\s+(colocarme|drogarme)\b", re.IGNORECASE),
        ]

    def is_prohibited(self, text: str) -> bool:
        t = (text or "").strip()
        if not t:
            return False
        return any(p.search(t) for p in self._patterns)


class EmergencyDetector:
    def __init__(self) -> None:
        self._patterns: list[re.Pattern[str]] = [
            re.compile(r"\bsobredosis\b", re.IGNORECASE),
            re.compile(r"\basfixi(a|o)\b", re.IGNORECASE),
            re.compile(r"\bno\s+puedo\s+respirar\b", re.IGNORECASE),
            re.compile(r"\bdificultad\s+para\s+respirar\b", re.IGNORECASE),
            re.compile(r"\binconsciente\b|\bdesmayo\b", re.IGNORECASE),
            re.compile(r"\bdolor\s+pecho\b|\bopresi[oó]n\s+pecho\b", re.IGNORECASE),
            re.compile(r"\bconvulsi[oó]n\b", re.IGNORECASE),
        ]

    def is_emergency(self, text: str) -> bool:
        t = (text or "").strip()
        if not t:
            return False
        return any(p.search(t) for p in self._patterns)
