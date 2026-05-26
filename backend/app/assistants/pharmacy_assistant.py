"""
Motor del asistente farmacéutico (backend).

Flujo general:
1) Normaliza/carga entorno (.env / .env.local).
2) Conecta a Supabase (fuente principal de conocimiento farmacológico/RAG).
3) Resuelve el medicamento (aliases + fuzzy matching) para mejorar recall.
4) Recupera contexto (vector search vía RPC; fallback keyword; fallback recent).
5) Genera respuesta con Groq (streaming opcional).
6) Aplica guardrails:
   - Rechazo de prompt injection.
   - Detección de emergencias.
   - Formato estricto + disclaimer (modo paciente).
   - Opcional: bloquear fallback a internet (STRICT_RAG_ONLY=1).

Nota:
- Este módulo no expone secretos; sólo los consume desde variables de entorno.
"""

import os
import json
from duckduckgo_search import DDGS
import re
import unicodedata
import threading
from typing import Any
from collections.abc import Iterator

from supabase import Client

try:
    from groq import Groq
except Exception:  # pragma: no cover
    Groq = None

from ..audit.client import AuditClient, AuditEvent
from ..config.env import clean_env_value, get_supabase_client, load_env
from ..embeddings.local_embeddings import embed_text as embed_text_local
from ..repositories.medication_index import MedicationIndex, ResolvedMedication
from ..nodes.geronto_translation.security import EmergencyDetector, PromptInjectionGuard, ProhibitedUseDetector


DISCLAIMER_TOKEN = "*Recuerde: Esta explicación automatizada es para ayudarle a entender su medicamento...*"
INTERNET_MARKER = "[INFORMACIÓN EXTRAÍDA DE INTERNET]"


def _parse_mg_amounts(text: str) -> list[float]:
    t = (text or "").lower()
    if not t.strip():
        return []
    matches = re.findall(r"(\d+(?:[.,]\d+)?)\s*(mg|g)\b", t, flags=re.I)
    out: list[float] = []
    for num_s, unit in matches:
        try:
            v = float(num_s.replace(",", "."))
        except Exception:
            continue
        if unit.lower() == "g":
            v *= 1000.0
        if v > 0:
            out.append(v)
    return out


def _parse_max_mg(text: str) -> float | None:
    t = (text or "").strip().lower()
    if not t:
        return None
    vals = _parse_mg_amounts(t)
    if not vals:
        return None
    return max(vals)


def _dose_risk_level(pregunta: str, dosis_maxima: str) -> tuple[str, str, str] | None:
    max_mg = _parse_max_mg(dosis_maxima)
    if max_mg is None:
        return None
    q = (pregunta or "").lower()
    if not re.search(r"\b(tome|tom[eé]|tomar|inger[ií]|ingeri|cuanto puedo|cuánt(o|a)s puedo|pastilla|comprimid|capsul)\b", q):
        return None
    amounts = _parse_mg_amounts(pregunta)
    if not amounts:
        return None
    asked = max(amounts)
    if asked > max_mg:
        return (
            "alert",
            "Dosis potencialmente peligrosa",
            f"⚠️ ADVERTENCIA: La dosis consultada excede el límite máximo diario. Riesgo de toxicidad. (Consultó {asked:g} mg; máximo {max_mg:g} mg).",
        )
    if asked >= max_mg * 0.9:
        return (
            "warning",
            "Dosis cerca del máximo",
            f"⚠️ Precaución: La dosis consultada está cerca del límite máximo diario. (Consultó {asked:g} mg; máximo {max_mg:g} mg).",
        )
    return None


def _special_conditions_from_row(row: dict) -> dict:
    prec = str(row.get("precauciones") or "")
    ef = str(row.get("efectos_secundarios") or "")
    contenido = str(row.get("contenido") or "")
    text = " \n ".join([prec, ef, contenido]).strip()
    t = _normalize_no_accents(text)

    def level_for(
        condition_keywords: set[str],
        alert_keywords: set[str],
        ok_keywords: set[str] | None = None,
    ) -> str:
        ok_keywords = ok_keywords or set()
        if not any(k in t for k in condition_keywords):
            return "none"
        if any(k in t for k in ok_keywords):
            return "none"
        if any(k in t for k in alert_keywords):
            return "alert"
        return "warning"

    preg_level = level_for(
        condition_keywords={"embaraz", "gestacion", "gestante", "trimestre", "feto", "fetal"},
        alert_keywords={"contraind", "prohib", "no usar", "evitar", "teratogen"},
        ok_keywords={"compatible"},
    )
    lact_level = level_for(
        condition_keywords={"lactan", "leche materna"},
        alert_keywords={"contraind", "prohib", "no usar", "evitar", "suspender"},
        ok_keywords={"compatible"},
    )
    driving_level = level_for(
        condition_keywords={"conduc", "maquin", "somnol", "sedac", "mareo", "vertigo", "no manejar"},
        alert_keywords=set(),
        ok_keywords=set(),
    )

    def msg(condition: str, level: str) -> str:
        if condition == "pregnancy":
            if level == "alert":
                return "Embarazo: evitar / contraindicado según la información disponible. Consulte a un profesional."
            if level == "warning":
                return "Embarazo: usar solo con indicación médica y control."
            return "Embarazo: sin alerta específica en los datos disponibles (ante duda, consulte)."
        if condition == "lactation":
            if level == "alert":
                return "Lactancia: evitar / no recomendado según la información disponible. Consulte a un profesional."
            if level == "warning":
                return "Lactancia: precaución. Puede pasar a la leche materna; confirme con un profesional."
            return "Lactancia: sin alerta específica en los datos disponibles (ante duda, consulte)."
        if condition == "driving":
            if level in {"alert", "warning"}:
                return "Conducción/maquinaria: puede causar somnolencia o mareos. Evite conducir si se siente afectado."
            return "Conducción/maquinaria: sin alerta específica en los datos disponibles."
        return ""

    return {
        "pregnancy": {"level": preg_level, "message": msg("pregnancy", preg_level)},
        "lactation": {"level": lact_level, "message": msg("lactation", lact_level)},
        "driving": {"level": driving_level, "message": msg("driving", driving_level)},
    }


def _normalize_no_accents(text: str) -> str:
    # Normaliza para comparar sin tildes (sirve para reconocer el marker aunque cambie mayúsculas/minúsculas).
    t = unicodedata.normalize("NFKD", text or "")
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return t.casefold()


def _context_has_internet_marker(contexto: str) -> bool:
    # Detecta si el contexto recuperado trae el marcador de "internet".
    return _normalize_no_accents(INTERNET_MARKER) in _normalize_no_accents(contexto or "")


def _strip_internet_marker_prefix(output: str) -> str:
    # Si el modelo "alucina" el marker al inicio, lo removemos cuando el contexto NO vino de internet.
    text = (output or "").lstrip()
    if not text:
        return text
    first_line, sep, rest = text.partition("\n")
    if _normalize_no_accents(first_line).strip() == _normalize_no_accents(INTERNET_MARKER):
        return rest.lstrip()
    return (output or "")


def _get_groq_key() -> str:
    # Lee la API key de Groq (no se imprime ni se loguea).
    return clean_env_value(os.getenv("GROQ_API_KEY"))


def _get_groq_client() -> Any:
    # Construye cliente Groq. Falla rápido si falta la dependencia o la API key.
    if Groq is None:
        raise RuntimeError("Dependencia faltante: instala `groq` para usar Groq")

    api_key = _get_groq_key()
    if not api_key:
        raise RuntimeError("Falta GROQ_API_KEY")

    return Groq(api_key=api_key)


def _groq_temperature() -> float:
    raw = (os.getenv("GROQ_TEMPERATURE") or "").strip() or "0.1"
    try:
        v = float(raw)
    except Exception:
        v = 0.1
    return max(0.0, min(1.0, v))


def _embed_query_local(text: str) -> list[float]:
    try:
        return embed_text_local(text)
    except Exception as exc:
        raise RuntimeError(f"Error generando embedding local: {exc}") from exc


def _rag_table_name() -> str:
    # Tabla RAG (por defecto documentos_medicos; en v2: documentos_medicos_v2).
    name = clean_env_value(os.getenv("SUPABASE_RAG_TABLE")) or "documentos_medicos"
    return name


def _rag_rpc_name() -> str:
    # RPC vector search (por defecto buscar_medicamentos; en v2: buscar_medicamentos_v2).
    name = clean_env_value(os.getenv("SUPABASE_RAG_RPC")) or "buscar_medicamentos"
    return name


def _expected_embedding_dim(supabase: Client) -> int | None:
    # Intenta inferir la dimensión del embedding en BD leyendo un registro.
    table = _rag_table_name()
    try:
        response = supabase.table(table).select("embedding").limit(1).execute()
        data = getattr(response, "data", None)
        if isinstance(data, list) and data:
            emb = data[0].get("embedding") if isinstance(data[0], dict) else None
            if isinstance(emb, list) and emb:
                return len(emb)
        return None
    except Exception:
        return None


def _generate_answer_groq(system_prompt: str, prompt: str) -> str:
    # Llamada "no streaming" a Groq.
    client = _get_groq_client()
    model = os.getenv("GROQ_CHAT_MODEL") or "llama3-8b-8192"
    try:
        result = client.chat.completions.create(
            model=model,
            temperature=_groq_temperature(),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        content = result.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Respuesta vacía del modelo")
        return content.strip()
    except Exception as exc:
        raise RuntimeError(f"Error generando respuesta con Groq: {exc}") from exc


def _generate_answer_groq_stream(system_prompt: str, prompt: str) -> Iterator[str]:
    # Llamada streaming a Groq. Produce fragmentos de texto (deltas).
    client = _get_groq_client()
    model = os.getenv("GROQ_CHAT_MODEL") or "llama3-8b-8192"
    try:
        stream = client.chat.completions.create(
            model=model,
            temperature=_groq_temperature(),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            stream=True,
        )
        for chunk in stream:
            choices = getattr(chunk, "choices", None)
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            piece = getattr(delta, "content", None) if delta is not None else None
            if isinstance(piece, str) and piece:
                yield piece
    except Exception as exc:
        raise RuntimeError(f"Error generando respuesta en streaming con Groq: {exc}") from exc


def _extract_json_object(text: str) -> dict | None:
    raw = (text or "").strip()
    if not raw:
        return None
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        raw = m.group(0)
    try:
        parsed = json.loads(raw)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _normalize_structured_response(raw: str) -> dict:
    parsed = _extract_json_object(raw)
    if not parsed:
        return {
            "layout": "conversacional",
            "content": {"respuesta_directa": (raw or "").strip(), "alerta_seguridad": "", "pasos_a_seguir": ""},
        }
    layout = str(parsed.get("layout") or "").strip().lower()
    if layout not in {"ficha", "conversacional"}:
        layout = "conversacional"
    content = parsed.get("content")
    if not isinstance(content, dict):
        content = {}
    if layout == "ficha":
        return {
            "layout": "ficha",
            "content": {
                "para_que_sirve": str(content.get("para_que_sirve") or "").strip(),
                "dosis": str(content.get("dosis") or "").strip(),
                "precauciones": str(content.get("precauciones") or "").strip(),
                "dieta": str(content.get("dieta") or "").strip(),
                "efectos": str(content.get("efectos") or "").strip(),
            },
        }
    return {
        "layout": "conversacional",
        "content": {
            "respuesta_directa": str(content.get("respuesta_directa") or "").strip(),
            "alerta_seguridad": str(content.get("alerta_seguridad") or "").strip(),
            "pasos_a_seguir": str(content.get("pasos_a_seguir") or "").strip(),
        },
    }


def _render_structured_response(payload: dict) -> str:
    layout = str(payload.get("layout") or "").strip().lower()
    content = payload.get("content")
    if not isinstance(content, dict):
        content = {}
    if layout == "ficha":
        para = str(content.get("para_que_sirve") or "").strip()
        dosis = str(content.get("dosis") or "").strip()
        prec = str(content.get("precauciones") or "").strip()
        dieta = str(content.get("dieta") or "").strip()
        efectos = str(content.get("efectos") or "").strip()
        return (
            "## ¿Para qué sirve el medicamento?\n"
            f"{para}\n\n"
            "## 💊 Dosis terapéutica y máxima (límites)\n"
            f"{dosis}\n\n"
            "## ⚠️ Precauciones (uso diario)\n"
            f"{prec}\n\n"
            "## 🥗 Dieta mientras lo toma\n"
            f"{dieta}\n\n"
            "## 🛑 Efectos secundarios (Leves y Graves)\n"
            f"{efectos}"
        ).strip()

    respuesta = str(content.get("respuesta_directa") or "").strip()
    alerta = str(content.get("alerta_seguridad") or "").strip()
    pasos = str(content.get("pasos_a_seguir") or "").strip()
    parts: list[str] = []
    if respuesta:
        parts.append(respuesta)
    if alerta:
        parts.append("⚠️ " + alerta)
    if pasos:
        parts.append("Pasos a seguir:\n" + pasos)
    return "\n\n".join(parts).strip()


def _system_prompt_por_modo(modo: str) -> str:
    return (
        "Usted es un asistente farmacéutico para pacientes mayores.\n"
        "Reglas obligatorias:\n"
        "- Use tono formal: \"Usted\".\n"
        "- Use lenguaje simple. Traduya jerga (ej.: \"somnolencia\" → \"sensación de sueño\").\n"
        "- No invente datos fuera del contexto proporcionado.\n"
        "- No calcule ni recomiende una dosis personalizada. Si el contexto trae límites (dosis terapéutica/máxima), preséntelos como referencia y enfatice no excederlos.\n"
        "- Regla de contingencia clínica: si el usuario pregunta por un síntoma cotidiano (ej.: dolor de cabeza, fiebre, resfrío) y el contexto recuperado corresponde a un medicamento crónico que NO está indicado para ese malestar (p. ej. antihipertensivos como valsartán), entonces aclare de inmediato que ese medicamento NO es para ese síntoma y mencione para qué es (según el contexto). Puede sugerir alternativas genéricas de venta libre en Chile para el malestar consultado: Paracetamol 500 mg o Ibuprofeno 400 mg. Agregue siempre: \"No se automedique si toma medicamentos para la presión sin antes consultar a su médico de cabecera\".\n"
        "- Si hay mareos o sueño: incluya 'levántese despacio de su silla'.\n"
        "- Sea breve: use frases cortas, 1 idea por línea y evite repeticiones.\n"
        "La salida DEBE ser siempre un objeto JSON válido y nada más.\n"
        "Formato obligatorio (siempre):\n"
        "{\n"
        "  \"layout\": \"ficha\" | \"conversacional\",\n"
        "  \"content\": { ... }\n"
        "}\n"
        "Usted decide autónomamente el layout:\n"
        "- layout=\"ficha\" SOLO si el usuario pide explícitamente datos técnicos, dosis o especificaciones de UN medicamento del catálogo.\n"
        "  En ese caso, content debe contener estas claves (todas string):\n"
        "  {\"para_que_sirve\":\"...\",\"dosis\":\"...\",\"precauciones\":\"...\",\"dieta\":\"...\",\"efectos\":\"...\"}\n"
        "- Para CUALQUIER otra pregunta, use layout=\"conversacional\".\n"
        "  En ese caso, content debe contener estas claves (todas string):\n"
        "  {\"respuesta_directa\":\"...\",\"alerta_seguridad\":\"...\",\"pasos_a_seguir\":\"...\"}\n"
        "No use Markdown fuera de strings. No incluya texto antes o después del JSON."
    )


def _infer_medicamento_desde_pregunta(pregunta: str) -> str:
    terms = _keywords(pregunta, limit=8)
    if not terms:
        return ""
    return terms[0]


def _buscar_en_internet(medicamento: str, modo: str) -> str:
    query = f"{medicamento} para qué sirve efectos secundarios"

    try:
        results = DDGS().text(query, max_results=2)
        textos: list[str] = []
        for r in results:
            body = r.get("body") if isinstance(r, dict) else None
            href = r.get("href") if isinstance(r, dict) else None
            if isinstance(body, str) and body.strip():
                if isinstance(href, str) and href.strip():
                    textos.append(f"{body.strip()} (fuente: {href.strip()})")
                else:
                    textos.append(body.strip())
        contexto = "\n\n".join(textos).strip()
        if not contexto:
            return ""
        return f"[INFORMACIÓN EXTRAÍDA DE INTERNET]:\n{contexto}"
    except Exception:
        return ""


def _extraer_contexto(resultados: Any, max_chars: int = 8000) -> str:
    textos: list[str] = []

    if isinstance(resultados, dict) and "data" in resultados:
        resultados = resultados["data"]

    if isinstance(resultados, list):
        for row in resultados:
            if isinstance(row, dict):
                contenido = row.get("contenido") or row.get("texto") or row.get("content")
                nombre = row.get("nombre_medicamento") or row.get("nombre")
                categoria = row.get("categoria")
                para = row.get("para_que_sirve")
                dosis_habitual = row.get("dosis_habitual")
                dosis_maxima = row.get("dosis_maxima")
                prec = row.get("precauciones")
                ef = row.get("efectos_secundarios")
                dieta = row.get("dieta_especial")
                if isinstance(contenido, str) and contenido.strip():
                    parts: list[str] = []
                    if isinstance(categoria, str) and categoria.strip():
                        parts.append(f"Categoría: {categoria.strip()}")
                    if isinstance(para, str) and para.strip():
                        parts.append(f"Para qué sirve: {para.strip()}")
                    if isinstance(dosis_habitual, str) and dosis_habitual.strip():
                        parts.append(f"Dosis habitual: {dosis_habitual.strip()}")
                    if isinstance(dosis_maxima, str) and dosis_maxima.strip():
                        parts.append(f"Dosis máxima: {dosis_maxima.strip()}")
                    if isinstance(prec, str) and prec.strip():
                        parts.append(f"Precauciones: {prec.strip()}")
                    if isinstance(ef, str) and ef.strip():
                        parts.append(f"Efectos secundarios: {ef.strip()}")
                    if isinstance(dieta, str) and dieta.strip():
                        parts.append(f"Dieta especial: {dieta.strip()}")
                    head = "\n".join(parts).strip()
                    body = contenido.strip()
                    combined = f"{head}\n\n{body}".strip() if head else body
                    if isinstance(nombre, str) and nombre.strip():
                        textos.append(f"[{nombre.strip()}]\n{combined}")
                    else:
                        textos.append(combined)
    elif isinstance(resultados, str):
        textos.append(resultados.strip())

    contexto = "\n\n---\n\n".join(textos)
    if len(contexto) > max_chars:
        contexto = contexto[:max_chars]
    return contexto


def _split_comparison_query(pregunta: str) -> tuple[str, str] | None:
    raw = (pregunta or "").strip()
    if not raw:
        return None
    q = raw.lower()
    parts = re.split(r"\b(?:vs\.?|versus|contra)\b", raw, maxsplit=1, flags=re.I)
    if len(parts) == 2:
        a = parts[0].strip(" ?¡¿,.;:-")
        b = parts[1].strip(" ?¡¿,.;:-")
        if a and b:
            return (a, b)
    m = re.search(r"\bcompar(ar|ame|ación)\b", q)
    if m:
        m2 = re.search(r"\bcompar(?:ar|ame|ación)?\s+(.*?)\s+(?:con|vs|versus)\s+(.*)$", raw, flags=re.I)
        if m2:
            a = (m2.group(1) or "").strip(" ?¡¿,.;:-")
            b = (m2.group(2) or "").strip(" ?¡¿,.;:-")
            if a and b:
                return (a, b)
    return None


def _extract_interactions(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    lines = re.split(r"[\n\.]", t)
    picked: list[str] = []
    for line in lines:
        ln = line.strip()
        if not ln:
            continue
        ln_norm = _normalize_no_accents(ln)
        if "interacc" in ln_norm or "a i n e" in ln_norm or "aspirin" in ln_norm:
            picked.append(ln)
        if len(picked) >= 3:
            break
    return ". ".join(picked).strip()


def _keywords(pregunta: str, limit: int = 6) -> list[str]:
    tokens = re.findall(r"[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]+", (pregunta or "").lower())
    stop = {
        "para",
        "que",
        "como",
        "con",
        "sin",
        "una",
        "uno",
        "unos",
        "unas",
        "del",
        "las",
        "los",
        "por",
        "porque",
        "cuando",
        "donde",
        "cual",
        "cuales",
        "cuanto",
        "cuantos",
        "cuanta",
        "cuantas",
        "este",
        "esta",
        "esto",
        "eso",
        "esa",
        "ese",
        "soy",
        "tengo",
        "me",
        "mi",
        "mis",
        "tu",
        "tus",
        "su",
        "sus",
        "de",
        "la",
        "el",
        "y",
        "o",
        "a",
        "en",
        "un",
        "dime",
        "mg",
        "ml",
        "ui",
        "comprimidos",
        "comprimido",
        "recubiertos",
        "recubierto",
        "pelicula",
        "capsulas",
        "capsula",
        "solucion",
        "inyectable",
        "suspension",
        "oral",
        "polvo",
        "perfusion",
        "jeringa",
        "precargada",
        "liberacion",
        "prolongada",
        "condicion",
        "venta",
    }
    filtered: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        if len(t) < 4:
            continue

        t_norm = "".join(ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn")
        if t_norm in stop:
            continue
        if t_norm in seen:
            continue
        seen.add(t_norm)
        filtered.append(t)
        if len(filtered) >= limit:
            break
    return filtered


def _retrieve_context_keyword(supabase: Client, pregunta: str, modo: str, limit: int = 10) -> str:
    table = _rag_table_name()
    allowed = ["ambos", modo]
    terms = _keywords(pregunta)
    if not terms:
        return ""

    or_parts = []
    for t in terms:
        or_parts.append(f"contenido.ilike.*{t}*")
        or_parts.append(f"nombre_medicamento.ilike.*{t}*")

    select_base = "nombre_medicamento,categoria,para_que_sirve,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
    select_with_dose = (
        "nombre_medicamento,categoria,para_que_sirve,dosis_habitual,dosis_maxima,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
    )
    for sel in (select_with_dose, select_base):
        try:
            query = (
                supabase.table(table)
                .select(sel)
                .in_("nivel_acceso", allowed)
                .or_(",".join(or_parts))
                .limit(limit)
            )
            response = query.execute()
            data = getattr(response, "data", None)
            return _extraer_contexto(data)
        except Exception:
            continue
    return ""


def _retrieve_context_recent(supabase: Client, modo: str, limit: int = 5) -> str:
    table = _rag_table_name()
    allowed = ["ambos", modo]
    select_base = "nombre_medicamento,categoria,para_que_sirve,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
    select_with_dose = (
        "nombre_medicamento,categoria,para_que_sirve,dosis_habitual,dosis_maxima,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
    )
    for sel in (select_with_dose, select_base):
        try:
            response = (
                supabase.table(table)
                .select(sel)
                .in_("nivel_acceso", allowed)
                .order("id", desc=True)
                .limit(limit)
                .execute()
            )
            data = getattr(response, "data", None)
            return _extraer_contexto(data)
        except Exception:
            continue
    return ""


def _retrieve_context_vector(supabase: Client, pregunta: str, modo: str) -> str:
    embedding = _embed_query_local(pregunta)
    expected_dim = _expected_embedding_dim(supabase)
    if expected_dim is not None and len(embedding) != expected_dim:
        raise RuntimeError(
            f"Dimensión de embedding no coincide (local={len(embedding)} vs bd={expected_dim}). "
            f"Configura LOCAL_EMBEDDING_MODEL para que coincida o re-ingesta la tabla {_rag_table_name()}."
        )
    try:
        rpc_name = _rag_rpc_name()
        rpc_args = {
            "query_embedding": embedding,
            "modo": modo,
        }
        response = supabase.rpc(rpc_name, rpc_args).execute()
        data = getattr(response, "data", None)
        contexto = _extraer_contexto(data)
        if contexto.strip():
            return contexto
        raise RuntimeError("RPC sin resultados")
    except Exception as exc:
        raise RuntimeError(f"Error consultando Supabase RPC {_rag_rpc_name()}: {exc}") from exc


def _retrieve_context(supabase: Client, pregunta: str, modo: str) -> str:
    try:
        contexto_vec = _retrieve_context_vector(supabase=supabase, pregunta=pregunta, modo=modo)
        terms = _keywords(pregunta, limit=8)
        hay_match = False
        ctx_lower = contexto_vec.lower()
        for t in terms:
            if t in ctx_lower:
                hay_match = True
                break
        if hay_match:
            return contexto_vec
    except Exception:
        pass

    try:
        contexto = _retrieve_context_keyword(supabase=supabase, pregunta=pregunta, modo=modo, limit=12)
        if contexto.strip():
            return contexto
    except Exception:
        pass

    try:
        return _retrieve_context_recent(supabase=supabase, modo=modo, limit=5)
    except Exception:
        return ""


def generar_respuesta_farmaceutica(pregunta: str, modo: str) -> str:
    # Función de conveniencia: mantiene compatibilidad con rutas existentes.
    return _assistant_instance().answer(pregunta=pregunta, modo=modo)


def generar_respuesta_farmaceutica_structured(pregunta: str, modo: str) -> dict:
    return _assistant_instance().answer_structured(pregunta=pregunta, modo=modo)


def generar_respuesta_farmaceutica_structured_text(pregunta: str, modo: str) -> tuple[dict, str]:
    inst = _assistant_instance()
    payload = inst.answer_structured(pregunta=pregunta, modo=modo)
    text = inst._enforce_disclaimer(_render_structured_response(payload))
    return payload, text


def generar_respuesta_farmaceutica_stream(
    pregunta: str, modo: str
) -> Iterator[str]:
    return _assistant_instance().answer_stream(pregunta=pregunta, modo=modo)


def resolver_medicamento(pregunta: str) -> str:
    resolved = _assistant_instance()._resolve_medication(pregunta)
    return resolved.resolved_name if resolved else ""


_DISAMBIGUATION_FORMS = {
    "jarabe",
    "suspension",
    "suspensión",
    "gotas",
    "solucion",
    "solución",
    "comprimido",
    "comprimidos",
    "tableta",
    "tabletas",
    "capsula",
    "cápsula",
    "capsulas",
    "cápsulas",
    "crema",
    "pomada",
    "gel",
    "spray",
    "parche",
    "inyectable",
    "ampolla",
    "aerosol",
}


def _norm_simple(text: str) -> str:
    raw = (text or "").strip().lower()
    if not raw:
        return ""
    raw = "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")
    raw = re.sub(r"[^a-z0-9\s]+", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw


def _presentation_base(name: str) -> str:
    n = _norm_simple(name)
    if not n:
        return ""
    toks = n.split()
    kept: list[str] = []
    for t in toks:
        if t in _DISAMBIGUATION_FORMS:
            continue
        if t in {"mg", "ml", "ui", "mcg", "g", "kg", "l"}:
            continue
        if t.isdigit():
            continue
        if re.match(r"^\d+(?:mg|ml|ui|mcg|g)$", t):
            continue
        kept.append(t)
    return kept[0] if kept else toks[0]


def resolver_medicamento_info(pregunta: str, modo: str) -> dict:
    inst = _assistant_instance()
    resolved = inst._resolve_medication(pregunta)
    modo_normalizado = inst._normalize_mode(modo)
    rag_similarity = inst._estimate_rag_similarity(pregunta=pregunta, modo=modo_normalizado)

    fuzzy_score = float(resolved.score) if resolved else None
    nombre_medicamento = resolved.resolved_name if resolved else ""
    categoria = ""
    risk_level = "none"
    risk_title = ""
    risk_message = ""
    special_conditions = None
    if inst._emergency.is_emergency(pregunta):
        risk_level = "alert"
        risk_title = "Síntomas de alarma"
        risk_message = "Su consulta menciona un síntoma de urgencia. Busque ayuda médica ahora."
    elif inst._prohibited.is_prohibited(pregunta):
        risk_level = "warning"
        risk_title = "Consulta no permitida"
        risk_message = "Por seguridad, esta solicitud no se puede procesar."
    elif resolved:
        row = inst._fetch_medication_row(name=resolved.resolved_name, modo=modo_normalizado)
        if row and isinstance(row.get("categoria"), str) and str(row.get("categoria") or "").strip():
            categoria = str(row.get("categoria") or "").strip()
        if row and isinstance(row.get("dosis_maxima"), str) and str(row.get("dosis_maxima") or "").strip():
            risk = _dose_risk_level(pregunta=pregunta, dosis_maxima=str(row.get("dosis_maxima") or ""))
            if risk:
                risk_level, risk_title, risk_message = risk
        special_conditions = _special_conditions_from_row(row) if isinstance(row, dict) else None
    disambiguation_options: list[str] = []
    disambiguation_question = ""
    if resolved:
        try:
            suggestions = inst._index.suggest(resolved.raw_query, limit=6)
            if len(suggestions) >= 2:
                top = suggestions[0]
                base = _presentation_base(top.resolved_name)
                opts: list[str] = []
                seen = set()
                for s in suggestions:
                    if _presentation_base(s.resolved_name) != base:
                        continue
                    if s.score < top.score - 0.04:
                        continue
                    if s.resolved_name.casefold() in seen:
                        continue
                    seen.add(s.resolved_name.casefold())
                    opts.append(s.resolved_name)
                if len(opts) >= 2:
                    disambiguation_options = opts[:5]
                    base_display = (top.resolved_name.split()[0] if top.resolved_name else base).strip()
                    disambiguation_question = (
                        f"Detecté más de una presentación de {base_display}. ¿Cuál está usando?"
                    )
        except Exception:
            disambiguation_options = []
            disambiguation_question = ""

    confidence = "baja"
    if resolved and rag_similarity is not None:
        if fuzzy_score >= 0.9 and rag_similarity >= 0.78:
            confidence = "alta"
        elif fuzzy_score >= 0.82 and rag_similarity >= 0.7:
            confidence = "media"
        else:
            confidence = "baja"
    elif resolved:
        if fuzzy_score >= 0.9:
            confidence = "alta"
        elif fuzzy_score >= 0.82:
            confidence = "media"
        else:
            confidence = "baja"

    return {
        "resolved_medication": nombre_medicamento,
        "nombre_medicamento": nombre_medicamento,
        "categoria": categoria,
        "resolved_via": resolved.via if resolved else "",
        "fuzzy_score": fuzzy_score,
        "rag_similarity": rag_similarity,
        "confidence": confidence,
        "risk_level": risk_level,
        "risk_title": risk_title,
        "risk_message": risk_message,
        "special_conditions": special_conditions,
        "needs_disambiguation": bool(disambiguation_options),
        "disambiguation_question": disambiguation_question,
        "disambiguation_options": disambiguation_options,
    }


def refresh_medication_cache() -> int:
    # Permite refrescar el índice (nombres/aliases) sin reiniciar el backend.
    return _assistant_instance().refresh_cache()


_ASSISTANT: "PharmacyAssistant | None" = None
_ASSISTANT_LOCK = threading.Lock()


def _assistant_instance() -> "PharmacyAssistant":
    # Singleton: crea una sola instancia para reutilizar cliente Supabase y cache del índice.
    global _ASSISTANT
    with _ASSISTANT_LOCK:
        if _ASSISTANT is not None:
            return _ASSISTANT
        load_env()
        supabase = get_supabase_client()
        audit = AuditClient()
        index = MedicationIndex(supabase=supabase)
        _ASSISTANT = PharmacyAssistant(supabase=supabase, audit=audit, index=index)
        return _ASSISTANT


class PharmacyAssistant:
    def __init__(self, supabase: Client, audit: AuditClient, index: MedicationIndex) -> None:
        self._supabase = supabase
        self._audit = audit
        self._index = index
        self._audit_supabase_table = (os.getenv("AUDIT_SUPABASE_TABLE") or "").strip()
        self._interactions_table = (os.getenv("SUPABASE_INTERACTIONS_TABLE") or "interacciones_medicamentos").strip()
        # Guardrails: bloquea prompt injection y detecta emergencias para responder con seguridad.
        self._guard = PromptInjectionGuard()
        self._emergency = EmergencyDetector()
        self._prohibited = ProhibitedUseDetector()

    def refresh_cache(self) -> int:
        return self._index.refresh()

    def answer_structured(self, pregunta: str, modo: str) -> dict:
        try:
            self._guard.validate(pregunta)
        except Exception:
            self._audit.send_async(AuditEvent(event_type="guardrail_reject", mode=modo))
            return {
                "layout": "conversacional",
                "content": {
                    "respuesta_directa": "Su mensaje contiene instrucciones que el sistema no puede aceptar por seguridad.",
                    "alerta_seguridad": "",
                    "pasos_a_seguir": "",
                },
            }
        if self._emergency.is_emergency(pregunta):
            self._audit.send_async(AuditEvent(event_type="emergency", mode=modo, emergency=True))
            return {
                "layout": "conversacional",
                "content": {
                    "respuesta_directa": "🚨 Alerta de seguridad: Llame a urgencias de su país ahora mismo.",
                    "alerta_seguridad": "",
                    "pasos_a_seguir": "",
                },
            }
        if self._prohibited.is_prohibited(pregunta):
            self._audit.send_async(AuditEvent(event_type="prohibited", mode=modo))
            return {
                "layout": "conversacional",
                "content": {
                    "respuesta_directa": "Por seguridad, no puedo ayudar con solicitudes relacionadas con uso recreativo o actividades ilícitas.",
                    "alerta_seguridad": "",
                    "pasos_a_seguir": "",
                },
            }

        modo_normalizado = "paciente"
        if not _get_groq_key():
            raise RuntimeError("Falta GROQ_API_KEY")

        resolved = self._resolve_medication(pregunta)
        if resolved:
            row = self._fetch_medication_row(name=resolved.resolved_name, modo=modo_normalizado)
            if row and isinstance(row.get("dosis_maxima"), str):
                risk = _dose_risk_level(pregunta=pregunta, dosis_maxima=str(row.get("dosis_maxima") or ""))
                if risk and risk[0] == "alert":
                    self._audit.send_async(AuditEvent(event_type="dose_risk", mode=modo, emergency=True))
                    return {
                        "layout": "conversacional",
                        "content": {
                            "respuesta_directa": (
                                "🚨 Alerta de seguridad: La dosis mencionada podría ser peligrosa.\n"
                                "Si Usted ya la tomó o tiene síntomas, busque ayuda de urgencia ahora."
                            ),
                            "alerta_seguridad": "",
                            "pasos_a_seguir": "",
                        },
                    }
        contexto = self._retrieve_context_with_resolution(pregunta=pregunta, modo=modo_normalizado, resolved=resolved)
        if not contexto.strip():
            # 4) Fallback opcional a internet (apagado con STRICT_RAG_ONLY=1).
            strict = (os.getenv("STRICT_RAG_ONLY") or "").strip() == "1"
            if not strict:
                if resolved:
                    contexto = _buscar_en_internet(medicamento=resolved.resolved_name, modo=modo_normalizado)
                else:
                    medicamento = _infer_medicamento_desde_pregunta(pregunta)
                    if medicamento:
                        contexto = _buscar_en_internet(medicamento=medicamento, modo=modo_normalizado)

        if not contexto.strip():
            return {
                "layout": "conversacional",
                "content": {
                    "respuesta_directa": "Lo siento, no encontré información suficiente en mi base de datos ni en internet para responder con seguridad.",
                    "alerta_seguridad": "",
                    "pasos_a_seguir": "",
                },
            }

        # 5) Generación con LLM (Groq) usando el contexto recuperado.
        system_prompt = _system_prompt_por_modo(modo_normalizado)
        prompt = self._build_prompt(
            contexto=contexto,
            pregunta=pregunta,
            resolved_medication=(resolved.resolved_name if resolved else ""),
        )
        raw = _generate_answer_groq(system_prompt=system_prompt, prompt=prompt)
        if not _context_has_internet_marker(contexto):
            raw = _strip_internet_marker_prefix(raw)
        payload = _normalize_structured_response(raw)
        rendered = _render_structured_response(payload)
        if modo_normalizado == "paciente" and (os.getenv("RAG_OUTPUT_STRICT") or "").strip() == "1":
            if not self._output_matches_context(output=rendered, contexto=contexto):
                payload = {
                    "layout": "conversacional",
                    "content": {
                        "respuesta_directa": "No tengo datos suficientes en mi registro para responder con seguridad.",
                        "alerta_seguridad": "",
                        "pasos_a_seguir": "",
                    },
                }
        self._audit_query(modo=modo_normalizado, pregunta=pregunta, resolved=resolved, emergency=False)
        return payload

    def answer(self, pregunta: str, modo: str) -> str:
        payload = self.answer_structured(pregunta=pregunta, modo=modo)
        text = _render_structured_response(payload)
        return self._enforce_disclaimer(text)

    def answer_stream(self, pregunta: str, modo: str) -> Iterator[str]:
        payload = self.answer_structured(pregunta=pregunta, modo=modo)
        out = self._enforce_disclaimer(_render_structured_response(payload))
        for i in range(0, len(out), 24):
            yield out[i : i + 24]

    def _normalize_mode(self, modo: str) -> str:
        return "paciente"

    def _build_prompt(self, contexto: str, pregunta: str, resolved_medication: str) -> str:
        resolved_name = str(resolved_medication or "").strip()
        return (
            "Contexto (fuentes recuperadas):\n"
            f"{contexto if contexto else '(sin contexto recuperado)'}\n\n"
            "Pregunta del usuario:\n"
            f"{pregunta}\n\n"
            "Medicamento detectado por el sistema (puede estar vacío):\n"
            f"{resolved_name}\n\n"
            "Instrucciones:\n"
            "- Responde en español.\n"
            "- Tu salida DEBE ser el JSON con {layout, content} según el formato indicado en el system prompt. No incluyas texto fuera del JSON.\n"
            "- Usa la información del contexto. Si el contexto tiene campos (Para qué sirve, Dosis habitual/terapéutica, Dosis máxima, Precauciones, Dieta especial, Efectos secundarios), priorízalos.\n"
            "- Si el usuario pregunta por su caso personal (por ejemplo: 'tengo hipertensión', 'estoy embarazada', 'tomo anticoagulantes', 'puedo tomar X'), no des un sí/no tajante: resume lo que dice el contexto y pide datos mínimos (edad, embarazo/lactancia, riñón/hígado, otros medicamentos, alergias).\n"
            "- No inventes datos (por ejemplo dosis) si no aparecen en el contexto.\n"
            "- Si el contexto es insuficiente, indícalo claramente y entrega recomendaciones generales seguras."
        )

    def _output_matches_context(self, output: str, contexto: str) -> bool:
        out = (output or "").lower()
        terms = _keywords(contexto or "", limit=8)
        if not terms:
            return True
        for t in terms:
            if t.lower() in out:
                return True
        return False

    def _enforce_disclaimer(self, text: str) -> str:
        t = (text or "").strip()
        if not t.endswith(DISCLAIMER_TOKEN):
            t = t.rstrip() + "\n\n" + DISCLAIMER_TOKEN
        return t

    def _resolve_medication(self, pregunta: str) -> ResolvedMedication | None:
        candidates = _keywords(pregunta, limit=8)
        if not candidates:
            return None
        best: ResolvedMedication | None = None
        try:
            for c in candidates:
                resolved = self._index.resolve(c)
                if resolved is None:
                    continue
                if best is None or resolved.score > best.score:
                    best = resolved
            return best
        except Exception:
            return None

    def _retrieve_context_with_resolution(self, pregunta: str, modo: str, resolved: ResolvedMedication | None) -> str:
        ctx_parts: list[str] = []
        if resolved:
            try:
                ctx_name = self._retrieve_by_name(name=resolved.resolved_name, modo=modo, limit=8)
                if ctx_name.strip():
                    ctx_parts.append(ctx_name.strip())
            except Exception:
                pass
        try:
            ctx_vec = _retrieve_context(supabase=self._supabase, pregunta=pregunta, modo=modo)
            if ctx_vec.strip():
                ctx_parts.append(ctx_vec.strip())
        except Exception:
            pass
        combined = "\n\n---\n\n".join([c for c in ctx_parts if c])
        return combined.strip()

    def _retrieve_by_name(self, name: str, modo: str, limit: int = 10) -> str:
        table = _rag_table_name()
        allowed = ["ambos", modo]
        select_base = "nombre_medicamento,categoria,para_que_sirve,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
        select_with_dose = (
            "nombre_medicamento,categoria,para_que_sirve,dosis_habitual,dosis_maxima,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
        )
        for sel in (select_with_dose, select_base):
            try:
                q = (
                    self._supabase.table(table)
                    .select(sel)
                    .in_("nivel_acceso", allowed)
                    .or_(f"nombre_medicamento.ilike.*{name}*")
                    .limit(limit)
                )
                resp = q.execute()
                data = getattr(resp, "data", None)
                return _extraer_contexto(data)
            except Exception:
                continue
        return ""

    def _compare_if_applicable(self, pregunta: str, modo: str) -> str:
        pair = _split_comparison_query(pregunta)
        if not pair:
            return ""
        a_raw, b_raw = pair
        ra = self._resolve_medication(a_raw)
        rb = self._resolve_medication(b_raw)
        if not ra or not rb:
            return ""
        if ra.resolved_name.casefold() == rb.resolved_name.casefold():
            return ""
        a = ra.resolved_name
        b = rb.resolved_name

        row_a = self._fetch_medication_row(name=a, modo=modo)
        row_b = self._fetch_medication_row(name=b, modo=modo)
        if not row_a and not row_b:
            return ""

        def val(row: dict[str, Any] | None, key: str) -> str:
            if not row:
                return "—"
            v = row.get(key)
            return str(v).strip() if isinstance(v, str) and v.strip() else "—"

        prec_a = val(row_a, "precauciones")
        prec_b = val(row_b, "precauciones")

        inter_a = _extract_interactions(prec_a)
        inter_b = _extract_interactions(prec_b)
        inter_db = self._fetch_interaction(a=a, b=b)

        lines: list[str] = []
        lines.append(f"Comparación basada sólo en mi base farmacológica (sin internet).")
        if inter_db:
            sev = inter_db.get("severidad") or ""
            nota = inter_db.get("nota") or ""
            fuente = inter_db.get("fuente") or ""
            parts = []
            if isinstance(sev, str) and sev.strip():
                parts.append(f"Severidad: {sev.strip()}")
            if isinstance(nota, str) and nota.strip():
                parts.append(nota.strip())
            if isinstance(fuente, str) and fuente.strip():
                parts.append(f"Fuente: {fuente.strip()}")
            if parts:
                lines.append("Interacción registrada: " + " | ".join(parts))
        lines.append("")
        lines.append(f"| Campo | {a} | {b} |")
        lines.append("|---|---|---|")
        lines.append(f"| Para qué sirve | {val(row_a,'para_que_sirve')} | {val(row_b,'para_que_sirve')} |")
        lines.append(f"| Dosis habitual | {val(row_a,'dosis_habitual')} | {val(row_b,'dosis_habitual')} |")
        lines.append(f"| Dosis máxima | {val(row_a,'dosis_maxima')} | {val(row_b,'dosis_maxima')} |")
        lines.append(f"| Precauciones | {prec_a} | {prec_b} |")
        lines.append(f"| Efectos secundarios | {val(row_a,'efectos_secundarios')} | {val(row_b,'efectos_secundarios')} |")
        lines.append(f"| Interacciones (extraídas) | {inter_a or '—'} | {inter_b or '—'} |")
        out = "\n".join(lines).strip()
        if modo == "paciente":
            out = self._enforce_disclaimer(out)
        return out

    def _fetch_interaction(self, a: str, b: str) -> dict[str, Any] | None:
        table = (self._interactions_table or "").strip()
        if not table:
            return None
        try:
            a_clean = str(a or "").strip()
            b_clean = str(b or "").strip()
            if not a_clean or not b_clean:
                return None
            resp = (
                self._supabase.table(table)
                .select("med_a,med_b,severidad,fuente,nota")
                .or_(
                    f"and(med_a.ilike.*{a_clean}*,med_b.ilike.*{b_clean}*),and(med_a.ilike.*{b_clean}*,med_b.ilike.*{a_clean}*)"
                )
                .limit(1)
                .execute()
            )
            data = getattr(resp, "data", None)
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return data[0]
            return None
        except Exception:
            return None

    def _estimate_rag_similarity(self, pregunta: str, modo: str) -> float | None:
        try:
            embedding = _embed_query_local(pregunta)
            expected_dim = _expected_embedding_dim(self._supabase)
            if expected_dim is not None and len(embedding) != expected_dim:
                return None
            rpc_name = _rag_rpc_name()
            base_args: dict[str, Any] = {"query_embedding": embedding, "modo": modo}
            for rpc_args in (
                {**base_args, "match_count": 1},
                base_args,
            ):
                try:
                    resp = self._supabase.rpc(rpc_name, rpc_args).execute()
                    data = getattr(resp, "data", None)
                    if isinstance(data, list) and data and isinstance(data[0], dict):
                        sim = data[0].get("similarity")
                        if isinstance(sim, (int, float)):
                            return float(sim)
                    return None
                except Exception:
                    continue
            return None
        except Exception:
            return None

    def _fetch_medication_row(self, name: str, modo: str) -> dict[str, Any] | None:
        table = _rag_table_name()
        allowed = ["ambos", modo]
        select_base = "nombre_medicamento,categoria,para_que_sirve,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
        select_with_dose = (
            "nombre_medicamento,categoria,para_que_sirve,dosis_habitual,dosis_maxima,precauciones,efectos_secundarios,dieta_especial,contenido,nivel_acceso"
        )
        for sel in (select_with_dose, select_base):
            try:
                resp = (
                    self._supabase.table(table)
                    .select(sel)
                    .in_("nivel_acceso", allowed)
                    .or_(f"nombre_medicamento.ilike.*{name}*")
                    .limit(1)
                    .execute()
                )
                data = getattr(resp, "data", None)
                if isinstance(data, list) and data and isinstance(data[0], dict):
                    return data[0]
            except Exception:
                continue
        return None

    def _audit_query(self, modo: str, pregunta: str, resolved: ResolvedMedication | None, emergency: bool) -> None:
        raw_med = _infer_medicamento_desde_pregunta(pregunta)
        ev = AuditEvent(
            event_type="query",
            medication=raw_med,
            resolved_medication=(resolved.resolved_name if resolved else ""),
            resolved_via=(resolved.via if resolved else ""),
            fuzzy_score=(resolved.score if resolved else None),
            mode=modo,
            emergency=emergency,
            session_hash="",
        )
        self._audit.send_async(ev)
        if self._audit_supabase_table:
            self._audit_supabase_async(ev)

    def _audit_supabase_async(self, ev: AuditEvent) -> None:
        if not self._audit_supabase_table:
            return

        def run() -> None:
            try:
                self._supabase.table(self._audit_supabase_table).insert(
                    {
                        "event_type": ev.event_type,
                        "medication": ev.medication,
                        "resolved_medication": ev.resolved_medication,
                        "resolved_via": ev.resolved_via,
                        "fuzzy_score": ev.fuzzy_score,
                        "mode": ev.mode,
                        "emergency": ev.emergency,
                    }
                ).execute()
            except Exception:
                return

        t = threading.Thread(target=run, daemon=True)
        t.start()
