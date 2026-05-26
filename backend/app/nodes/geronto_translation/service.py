from __future__ import annotations

import os
import re
import unicodedata

from .llm import LlmClient
from .models import MedicationPayload, RiskContext
from .security import EmergencyDetector, PromptInjectionGuard


class AccessibilityFormatter:
    def __init__(self, max_words_per_line: int = 15) -> None:
        self._max_words_per_line = max_words_per_line

    def format(self, text: str) -> str:
        raw = (text or "").strip()
        if not raw:
            return ""
        lines = [ln.strip() for ln in raw.splitlines()]
        out_lines: list[str] = []
        for ln in lines:
            if not ln:
                out_lines.append("")
                continue
            prefix = ""
            content = ln
            if ln.startswith(("- ", "• ")):
                prefix = ln[:2]
                content = ln[2:].strip()
            wrapped = self._wrap_words(content)
            if prefix:
                out_lines.append(prefix + wrapped[0])
                for extra in wrapped[1:]:
                    out_lines.append("  " + extra)
            else:
                out_lines.extend(wrapped)
        return "\n".join(out_lines).strip()

    def _wrap_words(self, text: str) -> list[str]:
        words = re.findall(r"\S+", text)
        if not words:
            return [""]
        lines: list[str] = []
        current: list[str] = []
        for w in words:
            if len(current) >= self._max_words_per_line:
                lines.append(" ".join(current))
                current = [w]
            else:
                current.append(w)
        if current:
            lines.append(" ".join(current))
        return lines


DISCLAIMER_TOKEN = "*Recuerde: Esta explicación automatizada es para ayudarle a entender su medicamento...*"


class SafetyGuardrails:
    def __init__(
        self,
        injection_guard: PromptInjectionGuard | None = None,
        emergency_detector: EmergencyDetector | None = None,
    ) -> None:
        self._guard = injection_guard or PromptInjectionGuard()
        self._emergency = emergency_detector or EmergencyDetector()

    def validate(self, user_question: str, risk: RiskContext | None) -> None:
        self._guard.validate(user_question)
        if risk:
            self._guard.validate(" ".join(risk.sintomas))

    def is_emergency(self, user_question: str, risk: RiskContext | None) -> bool:
        if self._emergency.is_emergency(user_question):
            return True
        if risk and self._emergency.is_emergency(" ".join(risk.sintomas)):
            return True
        return False

    def emergency_response(self) -> str:
        return "🚨 Alerta de seguridad: Llame a urgencias de su país ahora mismo.\n\n" + DISCLAIMER_TOKEN

    def rejection_response(self) -> str:
        return (
            "Su mensaje contiene instrucciones que el sistema no puede aceptar por seguridad.\n\n"
            + DISCLAIMER_TOKEN
        )


class ResponseFormatter:
    def __init__(self, accessibility: AccessibilityFormatter | None = None) -> None:
        self._access = accessibility or AccessibilityFormatter(max_words_per_line=15)
        self._jargon = {
            "somnolencia": "sensación de sueño",
            "cefalea": "dolor de cabeza",
            "mareo": "sensación de mareo",
            "náuseas": "ganas de vomitar",
            "nauseas": "ganas de vomitar",
            "vómitos": "vómitos",
            "vomitos": "vómitos",
            "hipotensión": "presión baja",
            "hipotension": "presión baja",
            "hipertensión": "presión alta",
            "hipertension": "presión alta",
        }

    def missing_record(self, medicamento: str) -> str:
        name = (medicamento or "").strip() or "(sin nombre)"
        text = (
            "## ¿Para qué sirve este medicamento?\n"
            f"- No tengo registro validado de: {name}.\n\n"
            "## ⚠️ Cuidados importantes que debe tener (Precauciones).\n"
            "- Consulte a su médico o farmacéutico antes de usarlo.\n\n"
            "## 🛑 Efectos secundarios (A qué debe estar atento).\n"
            "Leves:\n"
            "- (sin datos en el registro)\n\n"
            "Graves:\n"
            "- Si tiene dificultad para respirar, desmayo o dolor fuerte, busque ayuda.\n\n"
            + DISCLAIMER_TOKEN
        )
        return self._access.format(text)

    def format_groups(self, groups: list["_MedicationGroup"], risk: RiskContext | None) -> str:
        b1_lines: list[str] = []
        b2_lines: list[str] = []
        mild_lines: list[str] = []
        severe_lines: list[str] = []

        for g in groups:
            meds_label = ", ".join(g.medicamentos)
            if meds_label:
                b1_lines.append(f"- Medicamentos: {meds_label}.")
                b2_lines.append(f"- Medicamentos: {meds_label}.")
                mild_lines.append(f"- Medicamentos: {meds_label}.")
                severe_lines.append(f"- Medicamentos: {meds_label}.")

            if g.para_que_sirve:
                b1_lines.append(f"- {self._plain(g.para_que_sirve)}")
            else:
                b1_lines.append("- (sin dato de uso en el registro)")

            if g.precauciones:
                b2_lines.append(f"- {self._plain(g.precauciones)}")
            else:
                b2_lines.append("- (sin precauciones registradas)")

            mild, severe = self._split_effects(g.efectos_secundarios)
            if mild:
                mild_lines.append(f"- {self._plain(mild)}")
            else:
                mild_lines.append("- (sin efectos leves registrados)")
            if severe:
                severe_lines.append(f"- {self._plain(severe)}")
            else:
                severe_lines.append("- Si nota algo grave, busque atención médica.")

        fall_warning_needed = self._needs_fall_warning(groups, risk)
        if fall_warning_needed:
            b2_lines.append("- Si siente mareo o sueño, levántese despacio de su silla.")

        text = (
            "## ¿Para qué sirve este medicamento?\n"
            + "\n".join(b1_lines).strip()
            + "\n\n"
            + "## ⚠️ Cuidados importantes que debe tener (Precauciones).\n"
            + "\n".join(b2_lines).strip()
            + "\n\n"
            + "## 🛑 Efectos secundarios (A qué debe estar atento).\n"
            + "Leves:\n"
            + "\n".join(mild_lines).strip()
            + "\n\n"
            + "Graves:\n"
            + "\n".join(severe_lines).strip()
            + "\n\n"
            + DISCLAIMER_TOKEN
        )
        return self._access.format(self._plain(text))

    def enforce(self, text: str) -> str:
        t = (text or "").strip()
        if not t.endswith(DISCLAIMER_TOKEN):
            t = t.rstrip() + "\n\n" + DISCLAIMER_TOKEN
        return self._access.format(self._plain(t))

    def _plain(self, text: str) -> str:
        out = text or ""
        for k, v in self._jargon.items():
            out = re.sub(rf"\b{re.escape(k)}\b", v, out, flags=re.IGNORECASE)
        return out

    def _split_effects(self, text: str) -> tuple[str, str]:
        raw = (text or "").strip()
        if not raw:
            return "", ""
        m = re.search(r"\bGraves?\s*:\s*", raw, flags=re.IGNORECASE)
        if not m:
            return raw, ""
        mild = raw[: m.start()].strip(" -;\n\t")
        severe = raw[m.end() :].strip(" -;\n\t")
        return mild, severe

    def _needs_fall_warning(self, groups: list["_MedicationGroup"], risk: RiskContext | None) -> bool:
        triggers = ["mareo", "somnolencia", "sedación", "sedacion", "aturdimiento", "vértigo", "vertigo"]
        for g in groups:
            combined = " ".join([g.precauciones, g.efectos_secundarios, g.para_que_sirve]).lower()
            for tr in triggers:
                tr_norm = self._norm(tr)
                if tr_norm and tr_norm in self._norm(combined):
                    return True
        if risk:
            for s in risk.sintomas:
                if "mareo" in (s or "").lower() or "vértigo" in (s or "").lower() or "vertigo" in (s or "").lower():
                    return True
        return False

    def _norm(self, s: str) -> str:
        return "".join(ch for ch in unicodedata.normalize("NFD", s or "") if unicodedata.category(ch) != "Mn").lower()


class _MedicationGroup:
    def __init__(
        self,
        categoria: str,
        medicamentos: list[str],
        para_que_sirve: str,
        precauciones: str,
        efectos_secundarios: str,
        dieta_especial: str,
    ) -> None:
        self.categoria = categoria
        self.medicamentos = medicamentos
        self.para_que_sirve = para_que_sirve
        self.precauciones = precauciones
        self.efectos_secundarios = efectos_secundarios
        self.dieta_especial = dieta_especial


class ChatbotOrchestrator:
    def __init__(self, llm: LlmClient, guardrails: SafetyGuardrails, formatter: ResponseFormatter) -> None:
        self._llm = llm
        self._guardrails = guardrails
        self._formatter = formatter
        self._use_llm = (os.getenv("GERONTO_LLM_ENABLED") or "").strip() == "1"

    def handle(
        self,
        medications: list[MedicationPayload],
        user_question: str,
        risk: RiskContext | None,
    ) -> tuple[str, bool]:
        try:
            self._guardrails.validate(user_question=user_question, risk=risk)
        except Exception:
            return self._guardrails.rejection_response(), False

        if self._guardrails.is_emergency(user_question=user_question, risk=risk):
            return self._guardrails.emergency_response(), True

        meds = medications or []
        missing = [m for m in meds if not getattr(m, "record_found", True)]
        if missing and len(meds) == 1:
            return self._formatter.missing_record(meds[0].medicamento), False

        groups = self._group(meds)
        if not groups:
            return self._formatter.missing_record("(sin registro)"), False

        if not self._use_llm:
            return self._formatter.format_groups(groups=groups, risk=risk), False

        system_prompt = self._system_prompt()
        user_prompt = self._user_prompt(groups=groups, user_question=user_question, risk=risk)
        raw = self._llm.generate(system_prompt=system_prompt, user_prompt=user_prompt)
        return self._formatter.enforce(raw), False

    def _group(self, meds: list[MedicationPayload]) -> list[_MedicationGroup]:
        by_key: dict[str, _MedicationGroup] = {}
        for m in meds:
            if not getattr(m, "record_found", True):
                continue
            name = (m.medicamento or "").strip()
            if not name:
                continue
            categoria = (m.categoria or "").strip()
            para = (m.para_que_sirve or "").strip()
            prec = (m.precauciones or "").strip()
            efectos = (m.efectos_secundarios or "").strip()
            dieta = (m.dieta_especial or "").strip()
            key = self._key(categoria, para, prec, efectos, dieta)
            existing = by_key.get(key)
            if existing is None:
                by_key[key] = _MedicationGroup(
                    categoria=categoria,
                    medicamentos=[name],
                    para_que_sirve=para,
                    precauciones=prec,
                    efectos_secundarios=efectos,
                    dieta_especial=dieta,
                )
            else:
                if name not in existing.medicamentos:
                    existing.medicamentos.append(name)
        return list(by_key.values())

    def _key(self, categoria: str, para: str, prec: str, efectos: str, dieta: str) -> str:
        return "|".join([self._norm(categoria), self._norm(para), self._norm(prec), self._norm(efectos), self._norm(dieta)])

    def _norm(self, s: str) -> str:
        raw = (s or "").strip().lower()
        return "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")

    def _system_prompt(self) -> str:
        return (
            "Usted es un chatbot para personas mayores.\n"
            "Reglas estrictas de salida:\n"
            "1) Use exactamente este template Markdown con 3 bloques:\n"
            "## ¿Para qué sirve este medicamento?\n"
            "## ⚠️ Cuidados importantes que debe tener (Precauciones).\n"
            "## 🛑 Efectos secundarios (A qué debe estar atento).\n"
            "Dentro del bloque 3 divida en 'Leves' y 'Graves'.\n"
            "2) Máximo 15 palabras por línea.\n"
            "3) Use tono formal: \"Usted\".\n"
            "4) No agregue información fuera del JSON provisto.\n"
            "5) Traduya jerga a lenguaje simple.\n"
            "6) Si hay mareos o sueño: incluya 'levántese despacio de su silla'.\n"
            f"7) Termine con el token exacto: {DISCLAIMER_TOKEN}\n"
        )

    def _user_prompt(self, groups: list[_MedicationGroup], user_question: str, risk: RiskContext | None) -> str:
        lines: list[str] = []
        lines.append("Contexto JSON validado (no inventar):")
        for g in groups:
            meds_label = ", ".join(g.medicamentos)
            lines.append(f"- Medicamentos: {meds_label}")
            if g.categoria:
                lines.append(f"  Categoría: {g.categoria}")
            if g.para_que_sirve:
                lines.append(f"  Para qué sirve: {g.para_que_sirve}")
            if g.precauciones:
                lines.append(f"  Precauciones: {g.precauciones}")
            if g.efectos_secundarios:
                lines.append(f"  Efectos secundarios: {g.efectos_secundarios}")
            if g.dieta_especial:
                lines.append(f"  Dieta especial: {g.dieta_especial}")
        if risk:
            lines.append(f"Edad: {risk.edad}" if risk.edad is not None else "Edad: (no indicada)")
            lines.append(f"Síntomas: {', '.join(risk.sintomas)}" if risk.sintomas else "Síntomas: (no indicados)")
        lines.append("")
        lines.append("Pregunta del usuario:")
        lines.append((user_question or "").strip() or "(sin pregunta)")
        return "\n".join(lines).strip()
