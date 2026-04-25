import base64
import json
from pathlib import Path


def _clean_value(value: str) -> str:
    cleaned = value.strip().strip('"').strip("'")
    if "(" in cleaned:
        cleaned = cleaned.split("(", 1)[0].strip()
    return cleaned


def _parse_env_lines(text: str) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        items.append((k.strip(), _clean_value(v)))
    return items


def _decode_jwt_role(token: str) -> str:
    parts = token.split(".")
    if len(parts) < 2:
        return ""
    payload_b64 = parts[1]
    padding = "=" * (-len(payload_b64) % 4)
    try:
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes.decode("utf-8", errors="replace"))
        role = payload.get("role")
        return str(role) if role else ""
    except Exception:
        return ""


def main() -> int:
    project_root = Path(__file__).resolve().parents[2]
    env_path = project_root / ".env.local"
    if not env_path.exists():
        raise FileNotFoundError(str(env_path))

    items = _parse_env_lines(env_path.read_text(encoding="utf-8", errors="replace"))
    env = {k: v for k, v in items}

    candidates: list[str] = []
    for key in [
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_SERVICE_KEY",
    ]:
        val = env.get(key)
        if val and val.startswith("eyJ"):
            candidates.append(val)

    anon_token = ""
    service_role_token = ""
    for token in candidates:
        role = _decode_jwt_role(token)
        if role == "anon" and not anon_token:
            anon_token = token
        if role == "service_role" and not service_role_token:
            service_role_token = token

    updates: dict[str, str] = {}
    if anon_token:
        updates["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = anon_token
        updates["SUPABASE_ANON_KEY"] = anon_token
    if service_role_token:
        updates["SUPABASE_SERVICE_ROLE_KEY"] = service_role_token

    if "NEXT_PUBLIC_SUPABASE_SERVICE_KEY" in env:
        env.pop("NEXT_PUBLIC_SUPABASE_SERVICE_KEY", None)

    for k, v in updates.items():
        env[k] = v

    lines_out: list[str] = []
    for k in [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]:
        if env.get(k):
            lines_out.append(f"{k}={env[k]}")

    for k, v in sorted(env.items()):
        if k in {
            "SUPABASE_URL",
            "SUPABASE_ANON_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        }:
            continue
        lines_out.append(f"{k}={v}")

    env_path.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    print("Updated .env.local keys:", ", ".join(sorted(updates.keys())) or "(none)")
    if not anon_token:
        print("Warning: could not detect anon JWT in .env.local")
    if not service_role_token:
        print("Warning: could not detect service_role JWT in .env.local")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
