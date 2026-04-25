import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    
    // Aquí iría la lógica de Hugging Face
    return NextResponse.json({
      analysis: `Analizando la consulta: ${query}`,
      status: "success"
    });
  } catch (error) {
    return NextResponse.json({ error: "Error en el análisis" }, { status: 500 });
  }
}
