import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: false, error: "Backend reiniciado. Admin API deshabilitada." }, { status: 501 });
}

