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


def load_env() -> None:
    root = project_root()
    env_path = root / ".env"
    env_local_path = root / ".env.local"

    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    if env_local_path.exists():
        load_dotenv(dotenv_path=env_local_path, override=True)


def get_supabase_client() -> Client:
    supabase_url = clean_env_value(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")).rstrip("/")
    supabase_key = (
        clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or clean_env_value(os.getenv("SUPABASE_SERVICE_KEY"))
        or clean_env_value(os.getenv("SUPABASE_KEY"))
        or clean_env_value(os.getenv("SUPABASE_ANON_KEY"))
        or clean_env_value(os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    )

    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Faltan credenciales de Supabase. Define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y "
            "SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY) en tu .env/.env.local"
        )

    if not supabase_key.startswith("eyJ"):
        raise RuntimeError(
            "La key de Supabase no parece válida. Usa la `anon` o `service_role` desde Supabase (suelen empezar por `eyJ...`)."
        )

    return create_client(supabase_url, supabase_key)

