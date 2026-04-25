import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from supabase import Client, create_client

_PROJECT_ROOT = str(Path(__file__).resolve().parents[2])
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.app.services.local_embeddings import embed_text as embed_text_local



def _clean_env_value(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.strip().strip('"').strip("'")
    if "(" in cleaned:
        cleaned = cleaned.split("(", 1)[0].strip()
    return cleaned


def _load_env() -> None:
    """Carga variables de entorno desde .env o .env.local en la raíz del proyecto."""

    project_root = Path(__file__).resolve().parents[2]
    env_path = project_root / ".env"
    env_local_path = project_root / ".env.local"

    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    if env_local_path.exists():
        load_dotenv(dotenv_path=env_local_path, override=True)


def _get_supabase_client() -> Client:
    """Construye el cliente de Supabase desde variables de entorno."""

    supabase_url = _clean_env_value(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
    supabase_key = (
        _clean_env_value(os.getenv("SUPABASE_SERVICE_KEY"))
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


def _embed_text_local(text: str) -> list[float]:
    return embed_text_local(text)


def procesar_y_subir(texto: str, nombre_medicamento: str, nivel_acceso: str) -> int:
    """Divide el texto en chunks, genera embeddings y los inserta en Supabase.

    Inserta en la tabla `documentos_medicos` con columnas:
    - nombre_medicamento
    - contenido
    - nivel_acceso
    - embedding
    """

    _load_env()
    supabase = _get_supabase_client()

    # 1) Split del texto largo en chunks de ~800 caracteres.
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=0,
        length_function=len,
    )
    chunks = [c.strip() for c in splitter.split_text(texto) if c.strip()]

    if not chunks:
        return 0

    inserted = 0
    for idx, chunk in enumerate(chunks, start=1):
        try:
            # 2) Generar embedding del chunk.
            embedding = _embed_text_local(chunk)

            # 3) Insertar registro en Supabase.
            payload = {
                "nombre_medicamento": nombre_medicamento,
                "contenido": chunk,
                "nivel_acceso": nivel_acceso,
                "embedding": embedding,
            }
            response = supabase.table("documentos_medicos").insert(payload).execute()

            data = getattr(response, "data", None)
            if data is None:
                raise RuntimeError("Inserción sin data de respuesta")

            inserted += 1
            print(f"[{idx}/{len(chunks)}] Insertado chunk ({len(chunk)} chars)")
        except Exception as exc:
            # Manejo básico de errores: reporta y sigue con el siguiente chunk.
            print(f"[{idx}/{len(chunks)}] Error al insertar chunk: {exc}", file=sys.stderr)

    return inserted


def _read_text_file(file_path: str) -> str:
    path = Path(file_path)
    return path.read_text(encoding="utf-8")


if __name__ == "__main__":
    # Uso básico por CLI:
    #   py backend/scripts/ingestar_datos.py ruta.txt "Paracetamol" "admin"
    if len(sys.argv) < 4:
        print(
            "Uso: py backend/scripts/ingestar_datos.py <ruta_txt> <nombre_medicamento> <nivel_acceso>",
            file=sys.stderr,
        )
        raise SystemExit(2)

    texto = _read_text_file(sys.argv[1])
    nombre = sys.argv[2]
    acceso = sys.argv[3]
    total = procesar_y_subir(texto, nombre, acceso)
    print(f"Total insertados: {total}")
