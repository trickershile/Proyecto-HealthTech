import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "50"), 1), 200);

  let medications: any[] = [];
  try {
    const filePath = path.join(process.cwd(), "..", "data", "medications.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    medications = Array.isArray(parsed) ? parsed : [];
  } catch {
    medications = [];
  }

  const filtered = q
    ? medications.filter((m) => {
        const nombre = String((m as any)?.nombre ?? "").toLowerCase();
        const principio = String((m as any)?.principioActivo ?? "").toLowerCase();
        return nombre.includes(q) || principio.includes(q);
      })
    : medications;

  const res = NextResponse.json(filtered.slice(0, limit));
  res.headers.set("x-data-source", "local-demo");
  return res;
}
