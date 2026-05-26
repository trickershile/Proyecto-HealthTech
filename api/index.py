from backend.app.main import app as backend_app

class _StripPrefix:
    def __init__(self, app, prefix: str):
        self._app = app
        self._prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path") or ""
            if path.startswith(self._prefix):
                scope = dict(scope)
                scope["path"] = path[len(self._prefix) :] or "/"
                scope["root_path"] = (scope.get("root_path") or "") + self._prefix
        await self._app(scope, receive, send)


app = _StripPrefix(backend_app, "/api")
