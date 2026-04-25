import argparse
import os
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import Client, create_client

_PROJECT_ROOT = str(Path(__file__).resolve().parents[1])
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.app.services.local_embeddings import embed_texts as embed_texts_local


def _clean_env_value(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.strip().strip('"').strip("'")
    if "(" in cleaned:
        cleaned = cleaned.split("(", 1)[0].strip()
    return cleaned


def _load_env() -> None:
    project_root = Path(__file__).resolve().parents[1]
    env_path = project_root / ".env"
    env_local_path = project_root / ".env.local"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    if env_local_path.exists():
        load_dotenv(dotenv_path=env_local_path, override=True)


def _get_supabase_client() -> Client:
    supabase_url = _clean_env_value(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
    supabase_key = (
        _clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_SERVICE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_ANON_KEY"))
        or _clean_env_value(os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    )

    if not supabase_url or not supabase_key:
        raise RuntimeError("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env/.env.local")
    if not supabase_key.startswith("eyJ"):
        raise RuntimeError("La key de Supabase no parece válida (debería empezar por eyJ)")
    return create_client(supabase_url, supabase_key)


def _normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def extraer_texto_web(url_web: str, timeout_s: int = 25, max_chars: int = 250_000) -> tuple[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
    }
    resp = requests.get(url_web, headers=headers, timeout=timeout_s)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    for selector in ["nav", "footer", "header", "aside"]:
        for tag in soup.find_all(selector):
            tag.decompose()

    title = "Artículo Web"
    if soup.title and soup.title.string:
        title = _normalize_spaces(soup.title.string)

    parts: list[str] = []
    for p in soup.find_all("p"):
        txt = _normalize_spaces(p.get_text(" "))
        if len(txt) >= 30:
            parts.append(txt)

    if not parts:
        container = soup.find("main") or soup.find("article")
        if container:
            txt = _normalize_spaces(container.get_text(" "))
            if txt:
                parts = [txt]

    text = _normalize_spaces("\n\n".join(parts))
    if not text:
        raise RuntimeError("No se pudo extraer texto útil de la página")
    if len(text) > max_chars:
        text = text[:max_chars]
    return title, text


def _split_text(text: str, chunk_size: int = 900, chunk_overlap: int = 100) -> list[str]:
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except Exception:
        return [text]

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    chunks = [c.strip() for c in splitter.split_text(text) if c.strip()]
    return chunks or [text]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--nombre", default="")
    parser.add_argument("--nivel", default="ambos", choices=["ambos", "paciente", "alumno"])
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--chunk-size", type=int, default=900)
    parser.add_argument("--chunk-overlap", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    _load_env()
    supabase = _get_supabase_client()

    title, raw_text = extraer_texto_web(args.url)
    nombre = args.nombre.strip() or title
    chunks = _split_text(raw_text, chunk_size=args.chunk_size, chunk_overlap=args.chunk_overlap)
    texts = [f"{c}\n\nFuente: {args.url}" for c in chunks]

    if args.dry_run:
        print(nombre)
        print(f"chunks={len(texts)}")
        print(texts[0][:800])
        return 0

    inserted = 0
    for i in range(0, len(texts), args.batch_size):
        batch_texts = texts[i : i + args.batch_size]
        vectors = embed_texts_local(batch_texts)
        payloads: list[dict[str, object]] = []
        for t, v in zip(batch_texts, vectors, strict=True):
            payloads.append(
                {
                    "nombre_medicamento": nombre,
                    "contenido": t,
                    "nivel_acceso": args.nivel,
                    "embedding": v,
                }
            )
        supabase.table("documentos_medicos").insert(payloads).execute()
        inserted += len(payloads)
        print(f"insertados={inserted}/{len(texts)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

