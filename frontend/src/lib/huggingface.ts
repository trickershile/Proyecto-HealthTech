import { HfInference } from "@huggingface/inference";

if (!process.env.NEXT_PUBLIC_HF_TOKEN) {
  console.warn("NEXT_PUBLIC_HF_TOKEN is not defined. AI analysis will be disabled.");
}

export const hf = new HfInference(process.env.NEXT_PUBLIC_HF_TOKEN);

export const analyzeQuery = async (query: string) => {
  try {
    const response = await hf.textGeneration({
      model: "mistralai/Mistral-7B-Instruct-v0.2",
      inputs: `Analiza los posibles riesgos de este medicamento: ${query}. Responde de forma concisa.`,
      parameters: { max_new_tokens: 100, temperature: 0.7 }
    });
    return response.generated_text;
  } catch (error) {
    console.error("Error calling Hugging Face:", error);
    return null;
  }
};
