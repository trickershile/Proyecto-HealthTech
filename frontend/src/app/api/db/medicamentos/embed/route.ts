import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Backend reiniciado. Endpoint deshabilitado en modo demo." },
    { status: 501 }
  );
}

