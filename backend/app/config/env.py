from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client


def clean_env_value(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.strip().strip('"').strip("'")
    if "(" in cleaned:
        cleaned = cleaned.split("(", 1)[0].strip()
    return cleaned


def project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _is_cloud_runtime() -> bool:
    return bool(
        (os.getenv("RENDER") or "").strip()
        or (os.getenv("RENDER_SERVICE_ID") or "").strip()
        or (os.getenv("RAILWAY_ENVIRONMENT") or "").strip()
        or (os.getenv("VERCEL") or "").strip()
        or (os.getenv("VERCEL_ENV") or "").strip()
        or (os.getenv("K_SERVICE") or "").strip()
    )


def load_env() -> None:
    if _is_cloud_runtime():
        return
    root = project_root()
    env_path = root / ".env"
    env_local_path = root / ".env.local"

    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    if env_local_path.exists():
        load_dotenv(dotenv_path=env_local_path, override=True)


def get_supabase_client() -> Client:
    supabase_url = clean_env_value(os.getenv("SUPABASE_URL")).rstrip("/")
    supabase_key = clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Faltan credenciales de Supabase. Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY."
        )

    if not supabase_key.startswith("eyJ"):
        raise RuntimeError(
            "La key de Supabase no parece válida. Usa la `anon` o `service_role` desde Supabase (suelen empezar por `eyJ...`)."
        )

    return create_client(supabase_url, supabase_key)
