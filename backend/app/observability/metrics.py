import os
import time
import threading

_lock = threading.Lock()
_started_at = time.time()
_req_total: dict[tuple[str, str, str], int] = {}
_dur_sum: dict[tuple[str, str], float] = {}
_dur_count: dict[tuple[str, str], int] = {}


def record_request(method: str, path: str, status: int, duration_seconds: float) -> None:
    m = (method or "").upper() or "UNKNOWN"
    p = (path or "").strip() or "/"
    s = str(status)
    d = max(0.0, float(duration_seconds or 0.0))
    with _lock:
        _req_total[(m, p, s)] = _req_total.get((m, p, s), 0) + 1
        _dur_sum[(m, p)] = _dur_sum.get((m, p), 0.0) + d
        _dur_count[(m, p)] = _dur_count.get((m, p), 0) + 1


def render_prometheus() -> str:
    ns = (os.getenv("METRICS_NAMESPACE") or "healthtech").strip() or "healthtech"
    now = time.time()
    uptime = max(0.0, now - _started_at)
    lines: list[str] = []
    lines.append(f"# HELP {ns}_uptime_seconds Uptime del proceso en segundos.")
    lines.append(f"# TYPE {ns}_uptime_seconds gauge")
    lines.append(f"{ns}_uptime_seconds {uptime:.3f}")
    lines.append(f"# HELP {ns}_http_requests_total Total de requests HTTP.")
    lines.append(f"# TYPE {ns}_http_requests_total counter")
    lines.append(f"# HELP {ns}_http_request_duration_seconds Duración de requests HTTP en segundos.")
    lines.append(f"# TYPE {ns}_http_request_duration_seconds summary")
    with _lock:
        for (m, p, s), v in sorted(_req_total.items()):
            mp = _escape_label(m)
            pp = _escape_label(p)
            sp = _escape_label(s)
            lines.append(f'{ns}_http_requests_total{{method="{mp}",path="{pp}",status="{sp}"}} {v}')
        for (m, p), c in sorted(_dur_count.items()):
            mp = _escape_label(m)
            pp = _escape_label(p)
            s = _dur_sum.get((m, p), 0.0)
            lines.append(f'{ns}_http_request_duration_seconds_sum{{method="{mp}",path="{pp}"}} {s:.6f}')
            lines.append(f'{ns}_http_request_duration_seconds_count{{method="{mp}",path="{pp}"}} {c}')
    return "\n".join(lines).rstrip() + "\n"


def _escape_label(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')

