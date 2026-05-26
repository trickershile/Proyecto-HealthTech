export type TemplateBlocks = {
  block1: string;
  block2: string;
  block3: string;
  block4?: string;
  block5?: string;
  disclaimer: string;
};

export function parse3BlockTemplate(text: string): TemplateBlocks | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const disclaimerMatchAll = raw.match(/\*Recuerde:([\s\S]*)\*$/);
  const disclaimerAll = disclaimerMatchAll ? disclaimerMatchAll[0].trim() : "";
  const content = (disclaimerAll ? raw.replace(disclaimerAll, "") : raw).trim();

  const h1v5 = "## ¿Para qué sirve el medicamento?";
  const h2v5 = "## 💊 Dosis terapéutica y máxima (límites)";
  const h3v5 = "## ⚠️ Precauciones (uso diario)";
  const h4v5 = "## 🥗 Dieta mientras lo toma";
  const h5v5 = "## 🛑 Efectos secundarios (Leves y Graves)";

  const j1 = content.indexOf(h1v5);
  const j2 = content.indexOf(h2v5);
  const j3 = content.indexOf(h3v5);
  const j4 = content.indexOf(h4v5);
  const j5 = content.indexOf(h5v5);
  if (j1 !== -1 && j2 !== -1 && j3 !== -1 && j4 !== -1 && j5 !== -1 && j1 < j2 && j2 < j3 && j3 < j4 && j4 < j5) {
    const block1 = content.slice(j1 + h1v5.length, j2).trim();
    const block2 = content.slice(j2 + h2v5.length, j3).trim();
    const block3 = content.slice(j3 + h3v5.length, j4).trim();
    const block4 = content.slice(j4 + h4v5.length, j5).trim();
    const block5 = content.slice(j5 + h5v5.length).trim();
    return { block1, block2, block3, block4, block5, disclaimer: disclaimerAll };
  }

  const h1Legacy = "## ¿Para qué sirve este medicamento?";
  const h2Legacy = "## ⚠️ Cuidados importantes que debe tener (Precauciones).";
  const h3Legacy = "## 🛑 Efectos secundarios (A qué debe estar atento).";
  const i1 = content.indexOf(h1Legacy);
  const i2 = content.indexOf(h2Legacy);
  const i3 = content.indexOf(h3Legacy);
  if (i1 === -1 || i2 === -1 || i3 === -1) return null;
  if (!(i1 < i2 && i2 < i3)) return null;

  const block1 = content.slice(i1 + h1Legacy.length, i2).trim();
  const block2 = content.slice(i2 + h2Legacy.length, i3).trim();
  const block3 = content.slice(i3 + h3Legacy.length).trim();
  return { block1, block2, block3, disclaimer: disclaimerAll };
}

function takeSentences(text: string, maxSentences: number, maxChars: number): string {
  const raw = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const parts = raw.split(/(?<=[.!?])\s+/g);
  const picked = parts.slice(0, Math.max(1, maxSentences)).join(" ").trim();
  if (!picked) return "";
  if (picked.length <= maxChars) return picked;
  return picked.slice(0, maxChars).trimEnd() + "…";
}

export function buildSummary(value: string): string {
  const blocks = parse3BlockTemplate(value);
  if (blocks) {
    const a = takeSentences(blocks.block1, 2, 220);
    const isV5 = Boolean(blocks.block5 || blocks.block4);
    if (isV5) {
      const b = takeSentences(blocks.block2, 1, 200);
      const c = takeSentences(blocks.block3, 1, 200);
      const d = takeSentences(blocks.block4 ?? "", 1, 200);
      const e = takeSentences(blocks.block5 ?? "", 1, 200);
      const parts = [
        a ? `Resumen. Para qué sirve: ${a}` : "",
        b ? `Dosis y límites: ${b}` : "",
        c ? `Precauciones: ${c}` : "",
        d ? `Dieta: ${d}` : "",
        e ? `Efectos secundarios: ${e}` : "",
        "Si quiere más detalle, puede elegir: para qué sirve, dosis, precauciones, dieta o efectos secundarios.",
      ].filter(Boolean);
      return parts.join(" ");
    }
    const b = takeSentences(blocks.block2, 1, 200);
    const c = takeSentences(blocks.block3, 1, 200);
    const parts = [
      a ? `Resumen. Para qué sirve: ${a}` : "",
      b ? `Cuidados: ${b}` : "",
      c ? `Efectos secundarios: ${c}` : "",
      "Si quiere más detalle, puede elegir: para qué sirve, cuidados, o efectos secundarios.",
    ].filter(Boolean);
    return parts.join(" ");
  }
  const base = takeSentences(value, 2, 320);
  if (!base) return "";
  return `${base} Si quiere más detalle, puede elegir escuchar el texto completo.`;
}

export function stripMarkdown(value: string): string {
  let t = String(value ?? "");
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^\s*[-*•]\s+/gm, "");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
