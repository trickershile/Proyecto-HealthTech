export const runtime = "nodejs";

type OllamaGenerateResult = { response?: string };

export async function ollamaGenerate(opts: {
  baseUrl?: string;
  model: string;
  prompt: string;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  timeoutMs?: number;
}): Promise<string> {
  const baseUrl = (opts.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/+$/, "");
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : 25_000;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        stream: false,
        options: {
          temperature: opts.temperature ?? 0.2,
          top_p: opts.top_p ?? 0.9,
          num_predict: opts.num_predict ?? 420,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama error ${res.status}: ${text.slice(0, 160)}`);
    }

    const json = (await res.json().catch(() => ({}))) as OllamaGenerateResult;
    return String(json?.response ?? "");
  } finally {
    clearTimeout(t);
  }
}

