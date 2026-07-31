import { extractText, getDocumentProxy } from "unpdf";

const MAX_PAGES = 300;
const EXTRACTION_TIMEOUT_MS = 50_000;

export type PdfProcessingResult = {
  totalPages: number;
  text: string;
  characters: number;
  lines: number;
  requiresOcr: boolean;
};

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("El PDF tardó demasiado en procesarse.")), milliseconds);
      timer.unref?.();
    }),
  ]);
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfProcessingResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), {
    maxImageSize: 16_777_216,
  });

  if (pdf.numPages > MAX_PAGES) {
    throw new Error(`El PDF tiene ${pdf.numPages} páginas. El máximo automático es ${MAX_PAGES}.`);
  }

  const result = await withTimeout(
    extractText(pdf, { mergePages: true }),
    EXTRACTION_TIMEOUT_MS
  );

  const text = typeof result.text === "string" ? result.text.trim() : result.text.join("\n").trim();
  const characters = text.length;
  const lines = text ? text.split(/\r?\n/).filter((line) => line.trim()).length : 0;
  const requiresOcr = characters < Math.max(200, result.totalPages * 40);

  return {
    totalPages: result.totalPages,
    text,
    characters,
    lines,
    requiresOcr,
  };
}
