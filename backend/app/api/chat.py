import os
import asyncio
import json

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.app.services.ai_service import generar_respuesta_farmaceutica


router = APIRouter()


class ConsultarRequest(BaseModel):
    pregunta: str = Field(min_length=1)
    modo: str = Field(default="paciente")


class ConsultarResponse(BaseModel):
    respuesta: str


@router.post("/consultar", response_model=ConsultarResponse)
def consultar(payload: ConsultarRequest) -> ConsultarResponse:
    try:
        respuesta = generar_respuesta_farmaceutica(
            pregunta=payload.pregunta,
            modo=payload.modo,
        )
        return ConsultarResponse(respuesta=respuesta)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/chat", response_model=ConsultarResponse)
def chat(payload: ConsultarRequest) -> ConsultarResponse:
    return consultar(payload)


@router.post("/chat/stream")
async def chat_stream(payload: ConsultarRequest) -> StreamingResponse:
    async def event_gen():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        try:
            respuesta = generar_respuesta_farmaceutica(
                pregunta=payload.pregunta,
                modo=payload.modo,
            )
            for i in range(0, len(respuesta), 24):
                yield sse("chunk", {"delta": respuesta[i : i + 24]})
                await asyncio.sleep(0.005)
            yield sse("done", {})
        except Exception as exc:
            yield sse("error", {"message": str(exc)})
            yield sse("done", {})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/health/config")
def health_config() -> dict:
    def clean(value: str | None) -> str:
        if not value:
            return ""
        cleaned = value.strip().strip('"').strip("'")
        if "(" in cleaned:
            cleaned = cleaned.split("(", 1)[0].strip()
        return cleaned

    groq_key = clean(os.getenv("GROQ_API_KEY"))
    local_model = clean(os.getenv("LOCAL_EMBEDDING_MODEL")) or "sentence-transformers/all-MiniLM-L6-v2"
    local_dim = clean(os.getenv("LOCAL_EMBEDDING_DIM"))
    supabase_url = clean(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
    supabase_key = (
        clean(os.getenv("SUPABASE_SERVICE_KEY"))
        or clean(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or clean(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or clean(os.getenv("SUPABASE_ANON_KEY"))
        or clean(os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
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
