import { getResolvedPDFJS } from "unpdf";
import type { MeritSourcePage } from "./merit-source-parser";

const RANGE_CHUNK_SIZE = 256 * 1024;
const RANGE_CHECK_TIMEOUT_MS = 10_000;
const EXTRACTION_TIMEOUT_MS = 42_000;
export const MAX_PAGES_PER_BATCH = 40;

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPageBatchResult = {
  totalPages: number;
  pages: MeritSourcePage[];
  characters: number;
  sourceBytes: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido al leer el PDF.";
}

async function verifyRangeRequests(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RANGE_CHECK_TIMEOUT_MS);
  timer.unref?.();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: controller.signal,
    });
    const contentRange = response.headers.get("content-range") ?? "";
    const match = contentRange.match(/^bytes\s+0-0\/(\d+)$/i);

    await response.body?.cancel();

    if (response.status !== 206 || !match) {
      throw new Error(
        "Storage no ha aceptado una lectura parcial del PDF. Se cancela para no cargar el documento completo en memoria."
      );
    }

    const sourceBytes = Number(match[1]);
    if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0) {
      throw new Error("Storage devolvió un tamaño de PDF no válido.");
    }

    return sourceBytes;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Storage tardó demasiado en responder a la lectura parcial.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function positionedTextItems(items: unknown[]) {
  return items.flatMap<PositionedText>((item) => {
    if (!item || typeof item !== "object" || !("str" in item)) return [];

    const candidate = item as {
      str?: unknown;
      transform?: unknown;
      width?: unknown;
      height?: unknown;
    };
    if (
      typeof candidate.str !== "string" ||
      !Array.isArray(candidate.transform) ||
      candidate.transform.length < 6
    ) {
      return [];
    }

    const x = Number(candidate.transform[4]);
    const y = Number(candidate.transform[5]);
    const width = Number(candidate.width ?? 0);
    const height = Math.abs(Number(candidate.height ?? candidate.transform[3] ?? 0));

    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];

    const text = candidate.str.replace(/\u00a0/g, " ").trim();
    if (!text) return [];

    return [{
      text,
      x,
      y,
      width: Number.isFinite(width) ? Math.max(0, width) : 0,
      height: Number.isFinite(height) ? Math.max(0, height) : 0,
    }];
  });
}

function joinLine(items: PositionedText[]) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let text = "";
  let rightEdge: number | null = null;
  let previousHeight = 0;

  for (const item of sorted) {
    if (rightEdge !== null) {
      const gap = item.x - rightEdge;
      const spacingThreshold = Math.max(0.8, previousHeight * 0.08);
      if (gap > spacingThreshold && !text.endsWith(" ")) text += " ";
    }

    text += item.text;
    rightEdge = item.x + item.width;
    previousHeight = item.height;
  }

  return text.replace(/\s+/g, " ").trim();
}

function textItemsToLines(items: unknown[]) {
  const positioned = positionedTextItems(items).sort((a, b) => {
    const vertical = b.y - a.y;
    return Math.abs(vertical) > 1.5 ? vertical : a.x - b.x;
  });
  const groups: Array<{ y: number; items: PositionedText[] }> = [];

  for (const item of positioned) {
    const last = groups.at(-1);
    const tolerance = Math.max(1.5, Math.min(3, item.height * 0.3));

    if (!last || Math.abs(last.y - item.y) > tolerance) {
      groups.push({ y: item.y, items: [item] });
    } else {
      last.items.push(item);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
    }
  }

  return groups.map((group) => joinLine(group.items)).filter(Boolean);
}

export async function extractPdfPageBatch(
  signedUrl: string,
  startPage: number,
  endPage: number
): Promise<PdfPageBatchResult> {
  if (
    !Number.isInteger(startPage) ||
    !Number.isInteger(endPage) ||
    startPage < 1 ||
    endPage < startPage ||
    endPage - startPage + 1 > MAX_PAGES_PER_BATCH
  ) {
    throw new Error(`El lote debe contener entre 1 y ${MAX_PAGES_PER_BATCH} páginas válidas.`);
  }

  const sourceBytes = await verifyRangeRequests(signedUrl);
  const pdfjs = await getResolvedPDFJS();
  const loadingTask = pdfjs.getDocument({
    url: signedUrl,
    verbosity: 0,
    rangeChunkSize: RANGE_CHUNK_SIZE,
    disableRange: false,
    disableStream: true,
    disableAutoFetch: true,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    maxImageSize: 1,
  });
  const timeout = setTimeout(() => {
    void loadingTask.destroy();
  }, EXTRACTION_TIMEOUT_MS);
  timeout.unref?.();

  try {
    const pdf = await loadingTask.promise;

    try {
      if (startPage > pdf.numPages) {
        throw new Error(
          `La página inicial ${startPage} supera las ${pdf.numPages} páginas del PDF.`
        );
      }

      const safeEndPage = Math.min(endPage, pdf.numPages);
      const pages: MeritSourcePage[] = [];
      let characters = 0;

      for (let pageNumber = startPage; pageNumber <= safeEndPage; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          const lines = textItemsToLines(content.items as unknown[]);
          characters += lines.reduce((total, line) => total + line.length, 0);
          pages.push({ pageNumber, lines });
        } finally {
          page.cleanup();
        }
      }

      return {
        totalPages: pdf.numPages,
        pages,
        characters,
        sourceBytes,
      };
    } finally {
      pdf.cleanup();
    }
  } catch (error) {
    throw new Error(`No se pudo extraer el lote del PDF: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
    try {
      await loadingTask.destroy();
    } catch {
      // La tarea puede haberse destruido ya al vencer el tiempo límite.
    }
  }
}
