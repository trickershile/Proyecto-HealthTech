"""
Rutas HTTP del backend relacionadas con el chat (consulta farmacológica).

Endpoints:
- POST /consultar: respuesta completa en un solo payload JSON.
- POST /chat: alias de /consultar (compatibilidad).
- POST /chat/stream: streaming SSE (Server-Sent Events) para respuestas progresivas.
- GET /health/config: diagnóstico rápido (sin exponer secretos) de configuración env.

Seguridad:
- Todas las rutas del router requieren X-API-Key (INTERNAL_API_KEY).
"""

import asyncio
import json
import os
from typing import Any, Literal

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..assistants.pharmacy_assistant import (
    generar_respuesta_farmaceutica_structured_text,
    resolver_medicamento_info,
)
from ..config.env import clean_env_value
from ..nodes.geronto_translation.security import ApiKeyAuth, JwtAuth, RateLimiter


# Router protegido: sólo tráfico interno (gateway / servicios) con API key.
router = APIRouter(
    dependencies=[
        Depends(ApiKeyAuth(env_var="INTERNAL_API_KEY", header_name="X-API-Key")),
        Depends(JwtAuth(env_var="INTERNAL_JWT_SECRET", header_name="Authorization")),
        Depends(RateLimiter(max_requests=5, window_seconds=60)),
    ]
)


class ConsultarRequest(BaseModel):
    """
    Payload de consulta.

    - pregunta: texto del usuario (limitado a 200 chars para reducir abuso/prompt injection).
    - modo: se acepta por compatibilidad, pero el sistema opera sólo en modo paciente.
    """
    pregunta: str = Field(min_length=1, max_length=200)
    modo: str = Field(default="paciente")


class ConsultarResponse(BaseModel):
    layout: Literal["ficha", "conversacional"]
    content: dict[str, Any]


@router.post("/consultar", response_model=ConsultarResponse)
def consultar(payload: ConsultarRequest) -> ConsultarResponse:
    """
    Respuesta "no streaming": devuelve un JSON con la respuesta final.

    Errores:
    - 500: excepciones internas (se devuelven como detail para depuración en backend).
    """
    try:
        structured, _out = generar_respuesta_farmaceutica_structured_text(
            pregunta=payload.pregunta,
            modo=payload.modo,
        )
        layout = str(structured.get("layout") or "").strip()
        if layout not in {"ficha", "conversacional"}:
            layout = "conversacional"
        content = structured.get("content") if isinstance(structured.get("content"), dict) else {}
        return ConsultarResponse(layout=layout, content=content)
    except Exception as exc:
        raw = str(exc or "")
        is_rate_limit = "429" in raw or "rate limit" in raw.lower() or "too many requests" in raw.lower()
        if is_rate_limit:
            return ConsultarResponse(
                layout="conversacional",
                content={
                    "respuesta_directa": (
                        "⚠️ El sistema central de Inteligencia Artificial se encuentra temporalmente con alta demanda "
                        "(Límite de cuota alcanzado). Por seguridad y resguardo del paciente, no podemos procesar su consulta "
                        "en este milisegundo."
                    ),
                    "alerta_seguridad": "Por favor, intente nuevamente en unos minutos o consulte el vademécum impreso de su centro de salud.",
                    "pasos_a_seguir": "Si presenta una urgencia médica, acuda inmediatamente al centro de salud más cercano.",
                },
            )
        expose = (os.getenv("EXPOSE_ERRORS") or "").strip() == "1"
        raise HTTPException(status_code=500, detail=str(exc) if expose else "Error interno") from exc


@router.post("/chat", response_model=ConsultarResponse)
def chat(payload: ConsultarRequest) -> ConsultarResponse:
    """Alias de /consultar para compatibilidad con clientes existentes."""
    return consultar(payload)


@router.post("/chat/stream")
async def chat_stream(payload: ConsultarRequest) -> StreamingResponse:
    """
    Streaming SSE.

    Formato SSE:
    - event: chunk  data: {"delta": "..."}   (fragmentos de texto)
    - event: error  data: {"message": "..."} (si ocurre un error)
    - event: done   data: {"nombre_medicamento": "...", "categoria": "...", "risk_level": "..."} (cierre)
    """
    async def event_gen():
        # Serializa cada evento SSE en el formato exacto (líneas "event:" y "data:").
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        layout_meta: str = ""
        try:
            yield sse("step", {"title": "Resolviendo medicamento"})
            info = resolver_medicamento_info(payload.pregunta, payload.modo)
            yield sse("meta", info)
            final_meta = {
                "nombre_medicamento": str(info.get("nombre_medicamento") or info.get("resolved_medication") or "").strip(),
                "categoria": str(info.get("categoria") or "").strip(),
                "risk_level": str(info.get("risk_level") or "").strip() or "none",
                "layout": "",
                "content": {},
            }
            if info.get("needs_disambiguation"):
                layout_meta = "conversacional"
                final_meta["layout"] = layout_meta
                yield sse("meta", {"layout": layout_meta})
                yield sse("step", {"title": "Necesito una aclaración"})
                question = str(info.get("disambiguation_question") or "¿Cuál presentación está usando?").strip()
                opts = info.get("disambiguation_options")
                lines = [question]
                if isinstance(opts, list) and opts:
                    lines.append("")
                    lines.append("Opciones:")
                    for o in opts[:5]:
                        if isinstance(o, str) and o.strip():
                            lines.append(f"- {o.strip()}")
                yield sse("chunk", {"delta": "\n".join(lines).strip()})
                yield sse("done", final_meta)
                return
            yield sse("step", {"title": "Buscando en base farmacológica"})
            yield sse("step", {"title": "Generando respuesta"})
            structured, out = await run_in_threadpool(
                generar_respuesta_farmaceutica_structured_text,
                payload.pregunta,
                payload.modo,
            )
            layout_meta = str(structured.get("layout") or "").strip()
            if layout_meta not in {"ficha", "conversacional"}:
                layout_meta = "conversacional"
            final_meta["layout"] = layout_meta
            final_meta["content"] = structured.get("content") if isinstance(structured.get("content"), dict) else {}
            yield sse("meta", {"layout": layout_meta})
            for i in range(0, len(out), 24):
                yield sse("chunk", {"delta": out[i : i + 24]})
                await asyncio.sleep(0)
            yield sse("step", {"title": "Finalizando"})
            yield sse("done", final_meta)
        except Exception as exc:
            raw = str(exc or "")
            is_rate_limit = "429" in raw or "rate limit" in raw.lower() or "too many requests" in raw.lower()
            fallback_message = (
                "⚠️ El sistema central de Inteligencia Artificial se encuentra temporalmente con alta demanda "
                "(Límite de cuota alcanzado). Por seguridad y resguardo del paciente, no podemos procesar su consulta "
                "en este milisegundo. Por favor, intente nuevamente en unos minutos o consulte el vademécum impreso "
                "de su centro de salud."
            )
            safe_message = fallback_message if is_rate_limit else "Ocurrió un problema temporal al procesar su consulta. Por favor, intente nuevamente en unos minutos."
            layout_meta = "conversacional"
            info_dict = locals().get("info") if isinstance(locals().get("info"), dict) else {}
            yield sse("meta", {"layout": layout_meta})
            yield sse("step", {"title": "Alta demanda"})
            yield sse("chunk", {"delta": safe_message})
            yield sse(
                "done",
                {
                    "nombre_medicamento": str(
                        info_dict.get("nombre_medicamento") or info_dict.get("resolved_medication") or ""
                    ).strip(),
                    "categoria": str(info_dict.get("categoria") or "").strip(),
                    "risk_level": str(info_dict.get("risk_level") or "").strip() or "none",
                    "layout": layout_meta,
                    "content": {
                        "respuesta_directa": safe_message,
                        "alerta_seguridad": "",
                        "pasos_a_seguir": "",
                    },
                },
            )

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            # Evita caches y buffering (útil en proxies).
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/health/config")
def health_config() -> dict:
    """
    Diagnóstico de configuración sin filtrar secretos:
    - Informa si existen keys (bool) y si "parecen" válidas por formato.
    - Informa modelo/dimensión de embeddings locales.

    Esto ayuda a detectar rápidamente por qué "no consulta la base" (p.ej. falta SUPABASE_URL).
    """
    groq_key = clean_env_value(os.getenv("GROQ_API_KEY"))
    local_model = clean_env_value(os.getenv("LOCAL_EMBEDDING_MODEL")) or "sentence-transformers/all-MiniLM-L6-v2"
    local_dim = clean_env_value(os.getenv("LOCAL_EMBEDDING_DIM"))
    supabase_url = clean_env_value(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
    supabase_key = (
        clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or clean_env_value(os.getenv("SUPABASE_SERVICE_KEY"))
        or clean_env_value(os.getenv("SUPABASE_ANON_KEY"))
        or clean_env_value(os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    )

    try:
        import sentence_transformers  # noqa: F401

        st_present = True
    except Exception:
        st_present = False

    return {
        "groq_present": bool(groq_key),
        "groq_format_ok": (groq_key.startswith("gsk_") or groq_key.startswith("sk-")) and len(groq_key) >= 20,
        "local_embeddings_present": st_present,
        "local_embedding_model": local_model,
        "local_embedding_dim": int(local_dim) if local_dim.isdigit() else None,
        "supabase_url_present": bool(supabase_url),
        "supabase_url_format_ok": supabase_url.startswith("https://") and ".supabase.co" in supabase_url,
        "supabase_key_present": bool(supabase_key),
        "supabase_key_looks_jwt": supabase_key.startswith("eyJ"),
        "security_warning_next_public_service_key": bool(os.getenv("NEXT_PUBLIC_SUPABASE_SERVICE_KEY")),
    }
