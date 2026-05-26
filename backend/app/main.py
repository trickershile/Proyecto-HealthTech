"""
Backend principal (FastAPI) del proyecto.

Responsabilidades:
- Cargar variables de entorno desde .env / .env.local (útil en monorepo y Docker).
- Exponer la API (routers) de chat y administración.
- Aplicar CORS estricto para el frontend.
- Endurecer seguridad con headers HTTP (CSP, HSTS, etc.).
- Aplicar rate limit básico por IP para mitigar abuso.
"""

import os
import time
from collections import deque

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .api.chat_routes import router as chat_router
from .config.env import load_env
from .observability.metrics import record_request, render_prometheus


load_env()

# Instancia de la aplicación FastAPI.
app = FastAPI()

# Endpoints (routers) del backend.
app.include_router(chat_router)

# CORS: sólo permitir orígenes explícitos del frontend (separados por coma).
_origins_raw = os.getenv("ALLOWED_ORIGINS") or "http://localhost:3000,http://127.0.0.1:3000"
frontend_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware de headers de seguridad.

    Se aplican como defaults (setdefault) para no pisar respuestas que ya traen
    un header específico en una ruta particular.
    """
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Embedder-Policy", "require-corp")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "img-src 'self' data: blob:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self' https: http: ws: wss:;",
        )
        if (os.getenv("ENABLE_HSTS") or "").strip() == "1":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limit simple en memoria por IP.

    - Ventana deslizante (segundos): RATE_LIMIT_WINDOW_SECONDS (default 60).
    - Máximo de requests por ventana: RATE_LIMIT_MAX_REQUESTS (default 5).

    Importante: es "best effort" (en memoria). En múltiples réplicas no se comparte.
    """
    def __init__(self, app):
        super().__init__(app)
        self._window = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS") or "60")
        self._max = int(os.getenv("RATE_LIMIT_MAX_REQUESTS") or "5")
        self._max_keys = int(os.getenv("RATE_LIMIT_MAX_KEYS") or "5000")
        self._buckets: dict[str, deque[float]] = {}
        self._last_seen: dict[str, float] = {}
        self._last_cleanup = 0.0

    async def dispatch(self, request: Request, call_next):
        ip = (request.headers.get("x-forwarded-for") or request.client.host or "").split(",")[0].strip()
        key = ip or "unknown"
        now = time.time()
        window_start = now - self._window
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = deque()
            self._buckets[key] = bucket
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        bucket.append(now)
        self._last_seen[key] = now

        if (now - self._last_cleanup) >= self._window or len(self._buckets) > self._max_keys:
            self._cleanup(window_start=window_start)
            self._last_cleanup = now
        if len(bucket) > self._max:
            return Response(status_code=429, content="Rate limit excedido")
        return await call_next(request)

    def _cleanup(self, window_start: float) -> None:
        keys = list(self._buckets.keys())
        for k in keys:
            last = self._last_seen.get(k) or 0.0
            if last < window_start:
                self._buckets.pop(k, None)
                self._last_seen.pop(k, None)


app.add_middleware(SecurityHeadersMiddleware)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        status = 500
        try:
            response: Response = await call_next(request)
            status = response.status_code
            return response
        finally:
            end = time.perf_counter()
            route = request.scope.get("route")
            path = getattr(route, "path", None) or request.url.path
            record_request(method=request.method, path=path, status=status, duration_seconds=end - start)


app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware)


@app.get("/metrics")
def metrics() -> Response:
    return Response(content=render_prometheus(), media_type="text/plain; version=0.0.4; charset=utf-8")



@app.get("/ping")
def ping() -> dict:
    """
    Endpoint mínimo de salud.
    Sirve para comprobar que el proceso está vivo y responde.
    """
    return {"status": "ok"}


@app.get("/debug/env")
def debug_env() -> dict:
    if (os.getenv("EXPOSE_ERRORS") or "").strip() != "1":
        return {"status": "disabled"}
    return {
        "internal_api_key_present": bool(os.getenv("INTERNAL_API_KEY") or ""),
        "internal_jwt_secret_present": bool(os.getenv("INTERNAL_JWT_SECRET") or ""),
        "supabase_url_present": bool(os.getenv("SUPABASE_URL") or ""),
        "groq_api_key_present": bool(os.getenv("GROQ_API_KEY") or ""),
    }
