import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE() {
  return NextResponse.json({ ok: false, error: "Backend reiniciado. Admin API deshabilitada." }, { status: 501 });
}

