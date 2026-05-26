from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Literal

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from ..geronto_translation.security import ApiKeyAuth


class AuditEvent(BaseModel):
    ts: int = Field(default_factory=lambda: int(time.time()))
    event_type: Literal["query", "emergency", "guardrail_reject", "admin_refresh"] = "query"
    medication: str = Field(default="")
    resolved_medication: str = Field(default="")
    resolved_via: str = Field(default="")
    fuzzy_score: float | None = None
    mode: str = Field(default="")
    emergency: bool = False
    session_hash: str = Field(default="")


class AuditService:
    def __init__(self) -> None:
        self._salt = (os.getenv("AUDIT_SALT") or "audit").encode("utf-8")

    def anonymize_session(self, raw: str) -> str:
        r = (raw or "").strip()
        if not r:
            return ""
        h = hashlib.sha256(self._salt + r.encode("utf-8")).hexdigest()
        return h[:24]

    def write(self, event: AuditEvent) -> None:
        payload = event.model_dump()
        print(json.dumps(payload, ensure_ascii=False))


def _build_app() -> FastAPI:
    app = FastAPI(title="Audit Node", version="1.0.0")
    auth = ApiKeyAuth(env_var="AUDIT_API_KEY", header_name="X-API-Key")
    service = AuditService()

    @app.post("/v1/audit/event", dependencies=[Depends(auth)])
    def ingest(event: AuditEvent) -> dict:
        if event.session_hash:
            event.session_hash = service.anonymize_session(event.session_hash)
        service.write(event)
        return {"status": "ok"}

    @app.get("/health", dependencies=[Depends(auth)])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = _build_app()
