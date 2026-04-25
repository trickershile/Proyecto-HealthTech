import { NextResponse } from "next/server";

export const runtime = "nodejs";

type HudResponse = {
  response: string;
  state: "alert" | "warning" | "talking";
  hudData: {
    biometrics: { hr: string; bp: string; spo2: string };
    molecular: { item1: string; item2: string; item3: string };
  };
};

export async function POST(request: Request) {
  let message = "";
  let mode = "patient";
  try {
    const body = await request.json().catch(() => ({} as any));
    message = String(body?.message ?? "");
    mode = body?.mode === "student" ? "student" : "patient";
  } catch {}

  const payload: HudResponse = {
    response:
      mode === "student"
        ? `Modo demo (backend reiniciado). Pregunta recibida: ${message || "(vacía)"}.`
        : `Modo demo (backend reiniciado). Cuéntame más: ${message || "(vacía)"}.`,
    state: "talking",
    hudData: {
      biometrics: { hr: "72 BPM", bp: "120/80", spo2: "98%" },
      molecular: {
        item1: "BACKEND: DEMO",
        item2: "FUENTE: N/A",
        item3: "ACCION: reconstrucción",
      },
    },
  };

  return NextResponse.json(payload);
}

