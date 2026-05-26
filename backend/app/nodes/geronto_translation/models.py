from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class MedicationPayload(BaseModel):
    categoria: str = Field(default="")
    medicamento: str = Field(min_length=1)
    para_que_sirve: str = Field(default="")
    precauciones: str = Field(default="")
    efectos_secundarios: str = Field(default="")
    dieta_especial: str = Field(default="")
    record_found: bool = True


class RiskContext(BaseModel):
    edad: int | None = Field(default=None, ge=0, le=130)
    sintomas: list[str] = Field(default_factory=list)


class TranslateRequest(BaseModel):
    medications: list[MedicationPayload] = Field(min_length=1)
    user_question: str = Field(default="")
    risk: RiskContext | None = None
    locale: Literal["es"] = "es"

    @model_validator(mode="before")
    @classmethod
    def _normalize_input(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        if "medications" in data:
            return data
        if "medication" not in data:
            return data
        med = data.get("medication")
        out = dict(data)
        if isinstance(med, list):
            out["medications"] = med
        else:
            out["medications"] = [med]
        return out


class TranslateResponse(BaseModel):
    output_text: str
    emergency: bool = False

