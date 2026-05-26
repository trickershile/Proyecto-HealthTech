# Docker

## Requisitos
- Docker Desktop
- Archivo `.env.local` en la raíz del repo (mismo nivel que `docker-compose.yml`)

## Producción local (build + start)
```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000/ping

## Desarrollo (hot reload)
```bash
docker compose -f docker-compose.dev.yml up --build
```

Notas:
- El frontend usa polling de filesystem (útil en Windows/WSL/Docker Desktop). Puedes desactivarlo con `WATCHPACK_POLLING=false` en `.env.local`.

