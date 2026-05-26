from __future__ import annotations

from fastapi import Depends, FastAPI

from .llm import GroqLlmClient
from .models import TranslateRequest, TranslateResponse
from .security import ApiKeyAuth
from .service import ChatbotOrchestrator, ResponseFormatter, SafetyGuardrails


def _build_app() -> FastAPI:
    app = FastAPI(title="Gerontological Translation AI Node", version="1.0.0")
    auth = ApiKeyAuth()

    def build_orchestrator() -> ChatbotOrchestrator:
        llm = GroqLlmClient()
        formatter = ResponseFormatter()
        guardrails = SafetyGuardrails()
        return ChatbotOrchestrator(llm=llm, guardrails=guardrails, formatter=formatter)

    @app.post("/v1/translate", response_model=TranslateResponse, dependencies=[Depends(auth)])
    def translate(payload: TranslateRequest) -> TranslateResponse:
        orch = build_orchestrator()
        output, emergency = orch.handle(
            medications=payload.medications,
            user_question=payload.user_question,
            risk=payload.risk,
        )
        return TranslateResponse(output_text=output, emergency=emergency)

    @app.get("/health", dependencies=[Depends(auth)])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = _build_app()
