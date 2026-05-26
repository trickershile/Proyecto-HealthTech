import os
from typing import Any


_model: Any | None = None
_model_name: str | None = None


def _get_model_name() -> str:
    return os.getenv("LOCAL_EMBEDDING_MODEL") or "sentence-transformers/all-MiniLM-L6-v2"


def _expected_dim() -> int | None:
    raw = os.getenv("LOCAL_EMBEDDING_DIM")
    if not raw:
        return None
    raw = raw.strip()
    if raw.isdigit():
        return int(raw)
    return None


def _get_device() -> str:
    return os.getenv("LOCAL_EMBEDDING_DEVICE") or "cpu"


def _get_model() -> Any:
    global _model
    global _model_name

    name = _get_model_name()
    if _model is not None and _model_name == name:
        return _model

    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Dependencia faltante: instala `sentence-transformers`") from exc

    model = SentenceTransformer(name, device=_get_device())
    _model = model
    _model_name = name
    return model


def embedding_dim() -> int:
    model = _get_model()
    dim_new = getattr(model, "get_embedding_dimension", None)
    if callable(dim_new):
        return int(dim_new())
    dim_old = getattr(model, "get_sentence_embedding_dimension", None)
    if callable(dim_old):
        return int(dim_old())
    sample = embed_text("ping")
    return len(sample)


def embed_text(text: str) -> list[float]:
    model = _get_model()
    vec = model.encode(
        text or "",
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    out = [float(x) for x in vec.tolist()]
    expected = _expected_dim()
    if expected is not None and len(out) != expected:
        raise RuntimeError(f"Dimensión local inesperada: {len(out)} (esperada {expected}).")
    return out


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    vecs = model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    out: list[list[float]] = []
    expected = _expected_dim()
    for i in range(len(texts)):
        vec = vecs[i].tolist()
        out_vec = [float(x) for x in vec]
        if expected is not None and len(out_vec) != expected:
            raise RuntimeError(f"Dimensión local inesperada: {len(out_vec)} (esperada {expected}).")
        out.append(out_vec)
    return out

