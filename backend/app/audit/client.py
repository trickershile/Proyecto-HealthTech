from __future__ import annotations

import json
import os
import threading
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class AuditEvent:
    event_type: str
    medication: str = ""
    resolved_medication: str = ""
    resolved_via: str = ""
    fuzzy_score: float | None = None
    mode: str = ""
    emergency: bool = False
    session_hash: str = ""


class AuditClient:
    def __init__(self) -> None:
        self._url = (os.getenv("AUDIT_NODE_URL") or "").strip()
        self._key = (os.getenv("AUDIT_API_KEY") or "").strip()

    def enabled(self) -> bool:
        return bool(self._url and self._key)

    def send_async(self, event: AuditEvent) -> None:
        if not self.enabled():
            return
        t = threading.Thread(target=self._send, args=(event,), daemon=True)
        t.start()

    def _send(self, event: AuditEvent) -> None:
        try:
            payload = {
                "event_type": event.event_type,
                "medication": event.medication,
                "resolved_medication": event.resolved_medication,
                "resolved_via": event.resolved_via,
                "fuzzy_score": event.fuzzy_score,
                "mode": event.mode,
                "emergency": event.emergency,
                "session_hash": event.session_hash,
            }
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url=self._url.rstrip("/") + "/v1/audit/event",
                data=data,
                headers={"Content-Type": "application/json", "X-API-Key": self._key},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5) as _:
                return
        except Exception:
            return

