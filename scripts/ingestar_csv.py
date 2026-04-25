import csv
import os
import sys
import argparse
from pathlib import Path

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


def _embed_local(text: str) -> list[float]:
    raise RuntimeError("No usar")


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
        _clean_env_value(os.getenv("SUPABASE_SERVICE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_KEY"))
        or _clean_env_value(os.getenv("SUPABASE_ANON_KEY"))
        or _clean_env_value(os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    )
    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Faltan credenciales. Define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y "
            "SUPABASE_SERVICE_KEY (o SUPABASE_ANON_KEY) en .env/.env.local"
        )

    if not supabase_key.startswith("eyJ"):
        raise RuntimeError(
            "La key de Supabase no parece válida. Usa la `anon` o `service_role` desde Supabase (suelen empezar por `eyJ...`)."
        )
    return create_client(supabase_url, supabase_key)


def procesar_mi_csv(ruta_archivo: str):
    raise RuntimeError("Llama a `main()`")


def _iter_rows(path: Path) -> list[list[str]]:
    with path.open("rb") as fb:
        header = fb.read(4)

    if header.startswith(b"PK\x03\x04"):
        try:
            from openpyxl import load_workbook
        except Exception as exc:
            raise RuntimeError(
                "El archivo parece ser un Excel (.xlsx) aunque tenga extensión .csv. "
                "Instala openpyxl (por ejemplo: py -m pip install openpyxl) o exporta el archivo a CSV real."
            ) from exc

        import tempfile

        with path.open("rb") as fb:
            raw = fb.read()

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name

        wb = load_workbook(filename=tmp_path, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows: list[list[str]] = []
        for row in ws.iter_rows(values_only=True):
            rows.append(["" if v is None else str(v) for v in row])
        return rows

    sample = path.read_bytes()[:4096]
    try:
        sample_text = sample.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        sample_text = sample.decode("latin-1", errors="replace")
        encoding = "latin-1"

    try:
        dialect = csv.Sniffer().sniff(sample_text, delimiters=[",", ";", "\t", "|"])
    except Exception:
        dialect = csv.excel

    with path.open("r", encoding=encoding, newline="") as f:
        reader = csv.reader(f, dialect)
        return list(reader)


def _build_contenido(nombre: str, laboratorio: str, principio_activo: str, tipo_receta: str) -> str:
    return (
        f"El medicamento {nombre} tiene como principio activo {principio_activo}. "
        f"Es fabricado por el laboratorio {laboratorio}. "
        f"Condición de venta: {tipo_receta}."
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ruta", nargs="?", default="scripts/medicamentos.csv")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=50)
    args = parser.parse_args()

    ruta_archivo = args.ruta
    print(f"Abriendo archivo: {ruta_archivo}...")

    path = Path(ruta_archivo)
    if not path.exists():
        raise FileNotFoundError(f"No existe el archivo: {path}")

    _load_env()
    supabase: Client = _get_supabase_client()

    rows = _iter_rows(path)

    if not rows:
        print("CSV vacío")
        return

    data_rows = rows[1:] if len(rows) > 1 else []
    if args.offset:
        data_rows = data_rows[args.offset :]
    if args.limit and args.limit > 0:
        data_rows = data_rows[: args.limit]

    print(f"Se van a procesar {len(data_rows)} medicamentos.\n")

    batch_items: list[dict[str, object]] = []
    batch_texts: list[str] = []
    inserted = 0

    def flush_batch() -> None:
        nonlocal inserted
        nonlocal batch_items
        nonlocal batch_texts
        if not batch_items:
            return
        vectors = embed_texts_local(batch_texts)
        payloads: list[dict[str, object]] = []
        for item, vec in zip(batch_items, vectors, strict=True):
            payloads.append(
                {
                    "nombre_medicamento": item["nombre_medicamento"],
                    "contenido": item["contenido"],
                    "nivel_acceso": item["nivel_acceso"],
                    "embedding": vec,
                }
            )

        supabase.table("documentos_medicos").insert(payloads).execute()
        inserted += len(payloads)
        batch_items = []
        batch_texts = []

    for index, row in enumerate(data_rows, start=1):
        try:
            # Según tu archivo, estas son las posiciones de los datos:
            if len(row) <= 11:
                raise ValueError("Fila con columnas insuficientes")

            nombre = str(row[1]).strip()
            laboratorio = str(row[2]).strip()
            principio_activo = str(row[7]).strip()
            tipo_receta = str(row[11]).strip()

            texto_contenido = _build_contenido(nombre, laboratorio, principio_activo, tipo_receta)

            print(f"Procesando: {nombre}...")

            datos_insertar = {
                "nombre_medicamento": nombre,
                "contenido": texto_contenido,
                "nivel_acceso": "ambos",
            }

            batch_items.append(datos_insertar)
            batch_texts.append(texto_contenido)
            if len(batch_items) >= args.batch_size:
                flush_batch()
                print(f"  ✅ Insertados: {inserted}")
            
        except Exception as e:
            print(f"  ❌ Error en la fila {index}: {e}")

    flush_batch()
    print(f"\n🎉 ¡Carga finalizada! Total insertados: {inserted}")
    return 0

    print("\n🎉 ¡Prueba finalizada! Revisa tu tabla en Supabase.")

if __name__ == "__main__":
    raise SystemExit(main())
