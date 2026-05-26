/**
 * API Gateway (Next.js) para streaming del chat.
 *
 * Por qué existe:
 * - El navegador NO debe conocer ni enviar la INTERNAL_API_KEY.
 * - Esta ruta corre en el servidor de Next y reenvía al backend FastAPI agregando X-API-Key.
 * - Devuelve el body SSE tal cual, para que el cliente pueda "ir armando" la respuesta.
 *
 * Flujo:
 * 1) Valida payload (pregunta <= 200 chars).
 * 2) Hace fetch al backend (/chat/stream) con X-API-Key.
 * 3) Retorna Response con Content-Type text/event-stream.
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Bucket = { resetAt: number; count: number };

const buckets: Map<string, Bucket> = new Map();

function b64urlEncode(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}

function signJwtHS256(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${b64urlEncode(sig)}`;
}

function loadParentEnvIfMissing(keys: string[]) {
  // En monorepo, Next corre dentro de /frontend y no siempre carga el .env.local del root.
  // Esto intenta leer ../.env.local sólo si faltan keys.
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  const envPath = path.join(process.cwd(), "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    if (!k) continue;
    if (!missing.includes(k)) continue;
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function readJsonBody(request: Request): Promise<any> {
  // Evita fallos de request.json() en algunos clientes/headers: lee text y luego parsea.
  const raw = await request.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    loadParentEnvIfMissing([
      "INTERNAL_API_KEY",
      "INTERNAL_JWT_SECRET",
      "EXPOSE_ERRORS",
      "BACKEND_URL",
      "NEXT_PUBLIC_BACKEND_URL",
    ]);
  }
  const backendBaseUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const apiKey = process.env.INTERNAL_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ error: "Falta INTERNAL_API_KEY en el servidor" }, { status: 500 });
  }

  const windowSeconds = Number(process.env.GATEWAY_RATE_LIMIT_WINDOW_SECONDS || "60");
  const maxRequests = Number(process.env.GATEWAY_RATE_LIMIT_MAX_REQUESTS || "5");
  const xff = request.headers.get("x-forwarded-for") || "";
  const clientIp = (xff.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim() || "unknown";
  const now = Date.now();
  const winMs = Math.max(5, Math.min(600, Number.isFinite(windowSeconds) ? windowSeconds : 60)) * 1000;
  const max = Math.max(5, Math.min(600, Number.isFinite(maxRequests) ? maxRequests : 60));
  const bucket = buckets.get(clientIp);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(clientIp, { resetAt: now + winMs, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > max) {
      return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
    }
  }

  const payload = await readJsonBody(request);

  // Validación mínima (también existe validación en el backend).
  const pregunta = String(payload?.pregunta ?? "").trim();
  if (!pregunta) {
    return NextResponse.json({ error: "pregunta requerida" }, { status: 400 });
  }
  if (pregunta.length > 200) {
    return NextResponse.json({ error: "pregunta demasiado larga (máx 200 caracteres)" }, { status: 400 });
  }

  const modo = "paciente";

  const controller = new AbortController();
  const timeoutMs = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS || "120000");
  const safeTimeout = Math.max(5000, Math.min(120000, Number.isFinite(timeoutMs) ? timeoutMs : 30000));
  const timer = setTimeout(() => controller.abort(), safeTimeout);

  // Reenvía al backend agregando la API key interna.
  let upstream: Response;
  try {
    const jwtSecret = String(process.env.INTERNAL_JWT_SECRET || "").trim();
    const nowSec = Math.floor(Date.now() / 1000);
    const jwt = jwtSecret
      ? signJwtHS256({ iat: nowSec, exp: nowSec + 60, aud: "healthtech-backend" }, jwtSecret)
      : "";
    upstream = await fetch(`${backendBaseUrl}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        ...(xff ? { "x-forwarded-for": xff } : {}),
        ...(request.headers.get("x-real-ip") ? { "x-real-ip": request.headers.get("x-real-ip") as string } : {}),
      },
      body: JSON.stringify({ pregunta, modo }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ error: "No se pudo conectar al backend" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    const expose = String(process.env.EXPOSE_ERRORS || "").trim() === "1";
    const text = await upstream.text().catch(() => "");
    const safe = text.length > 240 ? text.slice(0, 240) + "…" : text;
    const publicMsg =
      upstream.status >= 500
        ? "Error interno"
        : upstream.status === 429
          ? "Rate limit excedido"
          : "Solicitud inválida";
    return NextResponse.json({ error: expose ? (safe || publicMsg) : publicMsg }, { status: upstream.status });
  }

  if (!upstream.body) {
    return NextResponse.json({ error: "Respuesta sin cuerpo" }, { status: 502 });
  }

  // Devuelve el stream SSE tal cual. El cliente parsea frames "event:" + "data:".
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
