from __future__ import annotations

import os
from typing import Protocol

try:
    from groq import Groq
except Exception:  # pragma: no cover
    Groq = None


class LlmClient(Protocol):
    def generate(self, system_prompt: str, user_prompt: str) -> str: ...


class GroqLlmClient:
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        if Groq is None:
            raise RuntimeError("Dependencia faltante: instala `groq`")
        self._api_key = api_key or (os.getenv("GROQ_API_KEY") or "")
        if not self._api_key:
            raise RuntimeError("Falta GROQ_API_KEY")
        self._model = model or (os.getenv("GROQ_CHAT_MODEL") or "llama-3.3-70b-versatile")
        self._client = Groq(api_key=self._api_key)

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        result = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = result.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Respuesta vacía del modelo")
        return content.strip()

