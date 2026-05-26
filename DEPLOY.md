## Despliegue (Docker)

### 1) Preparar variables de entorno

- Copie `Proyecto-HealthTech/.env.example` a `Proyecto-HealthTech/.env.local`
- Complete al menos:
  - `INTERNAL_API_KEY`
  - `INTERNAL_JWT_SECRET`
  - `GROQ_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ALLOWED_ORIGINS` (URL pública del frontend)

### 2) Levantar servicios

Desde `Proyecto-HealthTech/`:

```bash
docker compose up -d --build
```

Servicios:
- Frontend: `http://<IP_SERVIDOR>:3000`
- Backend: `http://<IP_SERVIDOR>:8000`

### 3) Recomendación para producción

- Ponga un reverse proxy (Caddy / Nginx) delante del frontend y backend.
- Active HTTPS antes de usar `ENABLE_HSTS=1`.

