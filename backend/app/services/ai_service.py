import os
from duckduckgo_search import DDGS
import re
import unicodedata
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

try:
    from groq import Groq
except Exception:  # pragma: no cover
    Groq = None

from backend.app.services.local_embeddings import embed_text as embed_text_local


def _clean_env_value(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.strip().strip('"').strip("'")
    if "(" in cleaned:
        cleaned = cleaned.split("(", 1)[0].strip()
    return cleaned


def _get_groq_key() -> str:
    return _clean_env_value(os.getenv("GROQ_API_KEY"))


def _load_env() -> None:
    project_root = Path(__file__).resolve().parents[3]
    env_path = project_root / ".env"
    env_local_path = project_root / ".env.local"

    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    if env_local_path.exists():
        load_dotenv(dotenv_path=env_local_path, override=True)


def _get_supabase_client() -> Client:
    supabase_url = _clean_env_value(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
    supabase_key = (
        _clean_env_value(os.getenv("SUPABASE_SERVICE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_ANON_KEY"))
        or _clean_env_value(os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    )

    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Faltan credenciales de Supabase. Define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y "
            "SUPABASE_SERVICE_KEY (o SUPABASE_ANON_KEY) en tu .env/.env.local"
        )

    if not supabase_key.startswith("eyJ"):
        raise RuntimeError(
            "La key de Supabase no parece válida. Usa la `anon` o `service_role` desde Supabase (suelen empezar por `eyJ...`)."
        )

    return create_client(supabase_url, supabase_key)


def _get_groq_client() -> Any:
    if Groq is None:
        raise RuntimeError("Dependencia faltante: instala `groq` para usar Groq")

    api_key = _get_groq_key()
    if not api_key:
        raise RuntimeError("Falta GROQ_API_KEY")

    return Groq(api_key=api_key)


def _embed_query_local(text: str) -> list[float]:
    try:
        return embed_text_local(text)
    except Exception as exc:
        raise RuntimeError(f"Error generando embedding local: {exc}") from exc


def _expected_embedding_dim(supabase: Client) -> int | None:
    try:
        response = supabase.table("documentos_medicos").select("embedding").limit(1).execute()
        data = getattr(response, "data", None)
        if isinstance(data, list) and data:
            emb = data[0].get("embedding") if isinstance(data[0], dict) else None
            if isinstance(emb, list) and emb:
                return len(emb)
        return None
    except Exception:
        return None


def _generate_answer_groq(system_prompt: str, prompt: str) -> str:
    client = _get_groq_client()
    model = os.getenv("GROQ_CHAT_MODEL") or "llama-3.3-70b-versatile"
    try:
        result = client.chat.completions.create(
            model=model,
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


def _system_prompt_por_modo(modo: str) -> str:
    if modo == "alumno":
        return (
            "Eres un asistente farmacéutico para estudiantes. Responde en español, con lenguaje técnico, "
            "detallado y estructurado. Incluye siempre: clase/familia farmacológica (p. ej. AINE, "
            "antihistamínico, antibiótico), mecanismo de acción, indicaciones habituales, dosis típicas (rangos "
            "y límites), contraindicaciones, interacciones relevantes, efectos adversos (frecuentes y graves), "
            "precauciones y qué ocurre en sobredosis (signos/síntomas, riesgos y conducta general). "
            "Distingue claramente entre: (1) información del contexto recuperado y (2) conocimiento general. "
            "Si el contexto es insuficiente para algo, dilo explícitamente y no inventes datos del contexto. "
            "Si el contexto contiene el marcador [INFORMACIÓN EXTRAÍDA DE INTERNET], debes iniciar tu respuesta diciendo: "
            "'No tengo este medicamento en mi registro oficial, pero buscando en la web encontré que...'."
        )

    return (
        "Eres un asistente farmacéutico para pacientes. Responde en español con lenguaje simple, claro y "
        "tranquilizador. Evita tecnicismos; si debes usar alguno, explícalo en una frase. Prioriza: para qué "
        "sirve, cómo se usa de forma general, advertencias importantes, efectos secundarios comunes en "
        "lenguaje cotidiano, signos de alarma y cuándo consultar. No des dosis exactas si el usuario no lo "
        "pide; si pregunta por dosis, da orientación general y recomienda confirmar con médico/farmacéutico "
        "según edad, peso y antecedentes. Usa el contexto recuperado cuando exista y no inventes datos del "
        "contexto. Si el contexto contiene el marcador [INFORMACIÓN EXTRAÍDA DE INTERNET], inicia diciendo: "
        "'No tengo este medicamento en mi registro oficial, pero buscando en la web encontré que...'."
    )


def _infer_medicamento_desde_pregunta(pregunta: str) -> str:
    terms = _keywords(pregunta, limit=8)
    if not terms:
        return ""
    return terms[0]


def _buscar_en_internet(medicamento: str, modo: str) -> str:
    query = f"{medicamento} para qué sirve efectos secundarios"
    if modo == "alumno":
        query = f"{medicamento} para qué sirve efectos secundarios sobredosis"

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
                if isinstance(contenido, str) and contenido.strip():
                    if isinstance(nombre, str) and nombre.strip():
                        textos.append(f"[{nombre.strip()}]\n{contenido.strip()}")
                    else:
                        textos.append(contenido.strip())
    elif isinstance(resultados, str):
        textos.append(resultados.strip())

    contexto = "\n\n---\n\n".join(textos)
    if len(contexto) > max_chars:
        contexto = contexto[:max_chars]
    return contexto


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
    allowed = ["ambos", modo]
    terms = _keywords(pregunta)
    if not terms:
        return ""

    or_parts = []
    for t in terms:
        or_parts.append(f"contenido.ilike.*{t}*")
        or_parts.append(f"nombre_medicamento.ilike.*{t}*")

    query = (
        supabase.table("documentos_medicos")
        .select("nombre_medicamento,contenido,nivel_acceso")
        .in_("nivel_acceso", allowed)
        .or_(",".join(or_parts))
        .limit(limit)
    )

    response = query.execute()
    data = getattr(response, "data", None)
    return _extraer_contexto(data)


def _retrieve_context_recent(supabase: Client, modo: str, limit: int = 5) -> str:
    allowed = ["ambos", modo]
    response = (
        supabase.table("documentos_medicos")
        .select("nombre_medicamento,contenido,nivel_acceso")
        .in_("nivel_acceso", allowed)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    data = getattr(response, "data", None)
    return _extraer_contexto(data)


def _retrieve_context_vector(supabase: Client, pregunta: str, modo: str) -> str:
    embedding = _embed_query_local(pregunta)
    expected_dim = _expected_embedding_dim(supabase)
    if expected_dim is not None and len(embedding) != expected_dim:
        raise RuntimeError(
            f"Dimensión de embedding no coincide (local={len(embedding)} vs bd={expected_dim}). "
            "Configura LOCAL_EMBEDDING_MODEL para que coincida o re-ingesta la tabla documentos_medicos."
        )
    try:
        rpc_args = {
            "query_embedding": embedding,
            "modo": modo,
        }
        response = supabase.rpc("buscar_medicamentos", rpc_args).execute()
        data = getattr(response, "data", None)
        contexto = _extraer_contexto(data)
        if contexto.strip():
            return contexto
        raise RuntimeError("RPC sin resultados")
    except Exception as exc:
        raise RuntimeError(f"Error consultando Supabase RPC buscar_medicamentos: {exc}") from exc


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
    modo_normalizado = (modo or "paciente").strip().lower()
    if modo_normalizado not in {"paciente", "alumno"}:
        modo_normalizado = "paciente"

    _load_env()

    if not _get_groq_key():
        raise RuntimeError("Falta GROQ_API_KEY")
    supabase = _get_supabase_client()

    contexto = _retrieve_context(supabase=supabase, pregunta=pregunta, modo=modo_normalizado)
    if not contexto.strip():
        medicamento = _infer_medicamento_desde_pregunta(pregunta)
        if medicamento:
            contexto = _buscar_en_internet(medicamento=medicamento, modo=modo_normalizado)

    if not contexto.strip():
        return "Lo siento, no encontré información sobre este medicamento en mi base de datos ni en internet."

    system_prompt = _system_prompt_por_modo(modo_normalizado)

    prompt = (
        "Contexto (fuentes recuperadas):\n"
        f"{contexto if contexto else '(sin contexto recuperado)'}\n\n"
        "Pregunta del usuario:\n"
        f"{pregunta}\n\n"
        "Instrucciones: responde usando solo el contexto cuando sea posible; si el contexto es insuficiente, "
        "indícalo claramente y da recomendaciones generales seguras sin inventar información."
    )

    return _generate_answer_groq(system_prompt=system_prompt, prompt=prompt)
