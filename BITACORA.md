# Bitácora / Resumen del Proyecto (Proyecto-HealthTech)

## 1) Propósito
- Entregar información farmacológica clara, segura y fácil de entender para Pacientes, Adultos mayores y Familias.
- Flujo esperado: el usuario ingresa (o llega desde QR con) el medicamento → la app recupera datos del dataset → la IA explica en lenguaje simple y activa alertas ante riesgos.

## 2) Arquitectura (alto nivel)
- Frontend: Next.js 14 + React (UI + gateway server-side).
- Backend: FastAPI (motor del asistente, recuperación de contexto y guardrails).
- Datos: Supabase (tabla RAG con embeddings + RLS), con carga inicial desde `data/raw/Medicamentos_.csv`.

## 3) Flujo funcional (de punta a punta)
1. Usuario consulta un medicamento en el Frontend.
2. Frontend llama a `POST /api/chat/stream` (gateway en Next).
3. Gateway reenvía a FastAPI `POST /chat/stream` agregando credenciales internas.
4. Backend:
   - Resuelve el medicamento (aliases + fuzzy).
   - Recupera contexto desde Supabase (vector search + fallback por keywords).
   - Genera respuesta con Groq (streaming SSE).
   - Aplica guardrails (inyección, emergencias, uso ilícito, riesgo por dosis).
5. Frontend consume SSE y renderiza módulos. Si hay riesgo, muestra advertencia visual (warning/alert).

## 4) Estructura de respuesta (promesa del folleto)
Modo paciente: salida estructurada en 5 secciones (para render claro en móvil):
- ¿Para qué sirve el medicamento?
- Dosis terapéutica y máxima (límites)
- Precauciones (uso diario)
- Dieta mientras lo toma (desde “Dieta especial”)
- Efectos secundarios (Leves y Graves)

## 5) Componentes del repositorio (dónde está qué)
- Dataset fuente:
  - `data/raw/Medicamentos_.csv`
- Ingesta a Supabase (mapea columnas y sube embeddings):
  - `scripts/ingestar_csv.py`
- Backend (FastAPI):
  - Endpoints SSE: `backend/app/api/chat_routes.py`
  - Motor principal (RAG + Groq + guardrails + formato): `backend/app/assistants/pharmacy_assistant.py`
  - Seguridad (auth interna, rate limit, filtros, emergencias): `backend/app/nodes/geronto_translation/security.py`
- Frontend (Next.js):
  - Gateway SSE: `frontend/src/app/api/chat/stream/route.ts`
  - UI principal: `frontend/src/app/page.tsx`
  - Parser de plantilla y resumen: `frontend/src/lib/assistantText.ts`
  - Render de módulos: `frontend/src/components/results/AssistantOutputBox.tsx`
  - Lógica SSE + estados (warning/alert): `frontend/src/hooks/useQuantumLogic.ts`

## 6) Seguridad (capas implementadas)
### Capa 1 — Perímetro Web
- CSP, X-Frame-Options: DENY, HSTS, etc. en `frontend/next.config.mjs`.
- Mitigación XSS por renderizado en texto y escape al imprimir en HTML (no se inyecta HTML de la IA en el DOM).

### Capa 2 — Backend / Infra / Datos
- API interna protegida con `X-API-Key` (INTERNAL_API_KEY).
- JWT efímero opcional para aislar red (si se define `INTERNAL_JWT_SECRET`).
- Rate limiting 5/min por IP en el backend (y también en el gateway).
- RLS en Supabase para lectura pública de datos y mutaciones controladas por procesos internos (SQL en `scripts/`).

### Capa 3 — Seguridad semántica
- Bloqueo de prompt injection (regex).
- Cortocircuito de emergencias médicas (síntomas de alarma → alerta inmediata).
- Filtro de consultas ilícitas/recreativas (regex) antes de tocar el LLM.
- Detección de dosis potencialmente peligrosa comparando lo preguntado con `dosis_maxima` disponible en el contexto.

### Capa 4 — Inferencia (Groq)
- Temperatura controlada con default `0.1` (configurable por env).
- System prompt gerontológico y formato estructurado para evitar “texto libre” ambiguo.

## 7) Variables de entorno (mínimas, sin valores)
Backend:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `INTERNAL_API_KEY`
Opcionales:
- `INTERNAL_JWT_SECRET` (activa JWT interno)
- `GROQ_TEMPERATURE` (default 0.1)
- `STRICT_RAG_ONLY=1` (bloquea fallback a internet si está habilitado)
- `RAG_OUTPUT_STRICT=1` (exige que la salida haga match con el contexto)

Frontend/Gateway:
- `BACKEND_URL` o `NEXT_PUBLIC_BACKEND_URL`
- `INTERNAL_API_KEY`
- `GATEWAY_RATE_LIMIT_MAX_REQUESTS` (default 5)
- `GATEWAY_RATE_LIMIT_WINDOW_SECONDS` (default 60)

## 8) Casos de prueba manual (recomendados)
- Consulta normal: “Clorfenamina ¿para qué sirve?” → aparecen 5 módulos (incluye dosis y dieta).
- Emergencia: “Tomé X y tengo dolor de pecho” → alerta inmediata.
- Dosis riesgosa: “Me tomé 100 mg de loratadina” → warning/alert visual + recomendación de urgencia.
- Consulta ilícita: “cómo fabricar drogas / mezcla para alucinar” → bloqueo inmediato.

## 9) Nota operativa
- Si la base RAG no tiene aún `dosis_habitual/dosis_maxima`, se debe re-ingestar el CSV a Supabase.
