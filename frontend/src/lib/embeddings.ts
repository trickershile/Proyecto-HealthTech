const hfToken = process.env.HF_TOKEN ?? process.env.NEXT_PUBLIC_HF_TOKEN ?? "";
const model = process.env.HF_EMBEDDING_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2";
const expectedDim = Number(process.env.HF_EMBEDDING_DIM ?? "384");
const fallbackModels =
  (process.env.HF_EMBEDDING_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .concat([
      "thenlper/gte-small",
      "BAAI/bge-small-en-v1.5",
      "intfloat/e5-small-v2",
      "intfloat/multilingual-e5-small",
    ]);

let lastEmbeddingError: string | null = null;

export function getLastEmbeddingError() {
  return lastEmbeddingError;
}

export async function embedText(text: string): Promise<number[] | null> {
  const input = String(text ?? "").trim();
  if (!input) return null;
  if (!hfToken) return null;

  lastEmbeddingError = null;

  const callModel = async (modelId: string) => {
    const url = `https://router.huggingface.co/hf-inference/models/${modelId}`;
    const payload = { inputs: input, options: { wait_for_model: true } };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const output = await res.json();
          const vector = Array.isArray(output) && Array.isArray(output[0])
            ? (output as number[][])[0]
            : (output as number[]);

          if (Number.isFinite(expectedDim) && expectedDim > 0 && vector.length !== expectedDim) {
            lastEmbeddingError = `Unexpected embedding dim for ${modelId}: ${vector.length} (expected ${expectedDim})`;
            return null;
          }

          const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
          if (!Number.isFinite(norm) || norm <= 0) return vector;
          return vector.map((v) => v / norm);
        }

        const errText = await res.text();
        lastEmbeddingError = `${res.status} ${String(errText).slice(0, 300)}`;
        if (res.status !== 503) return null;
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        lastEmbeddingError = String((e as any)?.message ?? e);
        return null;
      }
    }

    return null;
  };

  const modelsToTry = [model, ...fallbackModels].filter(Boolean);
  for (const m of modelsToTry) {
    const out = await callModel(m);
    if (out) return out;
  }

  return null;
}
