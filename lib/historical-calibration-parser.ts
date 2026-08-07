import {
  normalizeMeritName,
  normalizePublishedDni,
  parseSpanishScore,
  type MeritSourcePage,
} from "./merit-source-parser";

export const HISTORICAL_CALIBRATION_FORMAT =
  "madrid_ope_enfermeria_2018_concurso_definitivo";

export type HistoricalCalibrationRecord = {
  proceso_fuente: "ope_enfermeria_madrid_2018";
  ano_proceso: 2018;
  numero_orden: number;
  dni_publicado: string | null;
  dni_normalizado: string | null;
  nombre_publicado: string;
  nombre_normalizado: string;
  cupo_discapacidad: boolean;
  puntuacion_experiencia_real: number | null;
  puntuacion_formacion_real: number | null;
  puntuacion_total_concurso: number | null;
  numero_pagina: number;
  numero_fila: number;
  datos_extra: {
    formato: typeof HISTORICAL_CALIBRATION_FORMAT;
    suma_esperada: number | null;
    diferencia_total: number | null;
    advertencias: string[];
  };
};

export type HistoricalCalibrationWarning = {
  code: string;
  message: string;
  pageNumber: number;
  lineNumber: number;
  source: string;
};

export type HistoricalCalibrationParseResult = {
  format: typeof HISTORICAL_CALIBRATION_FORMAT;
  records: HistoricalCalibrationRecord[];
  warnings: HistoricalCalibrationWarning[];
  pagesAnalyzed: number;
  linesAnalyzed: number;
  doubtfulRows: number;
};

const SCORE_TOKEN = /^(?:-+|-?\d+(?:[.,]\d+)?)$/;
const SUM_TOLERANCE = 0.015;
const HEADER_PATTERNS = [
  /^DNI\s+APELLIDOS\s+Y\s+NOMBRE$/i,
  /^AP\.\s*1$/i,
  /^E\.P\.?$/i,
  /^AP\.\s*2$/i,
  /^FORM\.?$/i,
  /^TOTAL\s+FASE$/i,
  /^CONCURSO$/i,
  /^TURNO\s+LIBRE$/i,
  /^ORDEN\s+ALFAB[ÉE]TICO$/i,
  /^LISTADO\s+DEFINITIVO\s+FASE\s+DE\s+CONCURSO/i,
  /^ENFERMERO\/?A$/i,
  /^N[ºO]\s+CUPO\s+DISC\.?$/i,
  /^P(?:Á|A)GINA\s+\d+\s+DE\s+\d+/i,
  /SUJETO\s+A\s+COMUNICACI[ÓO]N\s+INDIVIDUAL/i,
];

function cleanWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isHeaderOrFooter(value: string) {
  const line = cleanWhitespace(value);
  if (!line) return true;
  return HEADER_PATTERNS.some((pattern) => pattern.test(line));
}

function startsLikeHistoricalRow(value: string) {
  return /^\d{1,6}\s+\S+/.test(cleanWhitespace(value));
}

function parseHistoricalRow(
  source: string,
  pageNumber: number,
  lineNumber: number
): HistoricalCalibrationRecord | null {
  const line = cleanWhitespace(source);
  const prefix = line.match(/^(\d{1,6})\s+(\S+)\s*(.*)$/);
  if (!prefix) return null;

  const order = Number(prefix[1]);
  const publishedDni = prefix[2];
  const remainder = prefix[3].trim();

  if (!Number.isInteger(order) || order <= 0 || !remainder) return null;

  const normalizedDni = normalizePublishedDni(publishedDni);
  if (!normalizedDni || !normalizedDni.includes("*")) return null;

  const tokens = remainder.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return null;

  const scoreTokens = tokens.slice(-3);
  if (!scoreTokens.every((token) => SCORE_TOKEN.test(token))) return null;

  const beforeScores = tokens.slice(0, -3);
  const disability = /^(?:S|SI|SÍ)$/i.test(beforeScores.at(-1) ?? "");
  const nameTokens = disability ? beforeScores.slice(0, -1) : beforeScores;
  const publishedName = cleanWhitespace(nameTokens.join(" "))
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
    .trim();
  const normalizedName = normalizeMeritName(publishedName);

  // Las filas Y(**) del final del documento no publican identidad y se excluyen.
  if (normalizedName.length < 4) return null;

  const experience = parseSpanishScore(scoreTokens[0]);
  const formation = parseSpanishScore(scoreTokens[1]);
  const total = parseSpanishScore(scoreTokens[2]);
  const warnings: string[] = [];

  if (experience === null) warnings.push("AP.1 experiencia ausente o no numérica.");
  if (formation === null) warnings.push("AP.2 formación ausente o no numérica.");
  if (total === null) warnings.push("Total de concurso ausente o no numérico.");

  const expectedSum =
    experience !== null && formation !== null ? experience + formation : null;
  const difference =
    expectedSum !== null && total !== null
      ? Number(Math.abs(expectedSum - total).toFixed(6))
      : null;

  if (difference !== null && difference > SUM_TOLERANCE) {
    warnings.push(
      `AP.1 + AP.2 difiere del total en ${difference.toFixed(3)} puntos.`
    );
  }

  return {
    proceso_fuente: "ope_enfermeria_madrid_2018",
    ano_proceso: 2018,
    numero_orden: order,
    dni_publicado: publishedDni,
    dni_normalizado: normalizedDni,
    nombre_publicado: publishedName,
    nombre_normalizado: normalizedName,
    cupo_discapacidad: disability,
    puntuacion_experiencia_real: experience,
    puntuacion_formacion_real: formation,
    puntuacion_total_concurso: total,
    numero_pagina: pageNumber,
    numero_fila: lineNumber,
    datos_extra: {
      formato: HISTORICAL_CALIBRATION_FORMAT,
      suma_esperada:
        expectedSum === null ? null : Number(expectedSum.toFixed(6)),
      diferencia_total: difference,
      advertencias: warnings,
    },
  };
}

function warningsForRecord(
  record: HistoricalCalibrationRecord,
  source: string
): HistoricalCalibrationWarning[] {
  return record.datos_extra.advertencias.map((message) => ({
    code: message.startsWith("AP.1 + AP.2")
      ? "total_no_cuadra"
      : "fila_incompleta",
    message,
    pageNumber: record.numero_pagina,
    lineNumber: record.numero_fila,
    source,
  }));
}

export function parseHistoricalCalibrationPages(
  pages: MeritSourcePage[]
): HistoricalCalibrationParseResult {
  const records: HistoricalCalibrationRecord[] = [];
  const warnings: HistoricalCalibrationWarning[] = [];
  let linesAnalyzed = 0;

  for (const page of pages) {
    let pending:
      | { source: string; lineNumber: number; parts: number }
      | null = null;

    const flushPending = () => {
      if (!pending) return;
      warnings.push({
        code: "fila_no_reconocida",
        message:
          "La fila histórica comienza con número de orden, pero no contiene todas las columnas esperadas.",
        pageNumber: page.pageNumber,
        lineNumber: pending.lineNumber,
        source: pending.source,
      });
      pending = null;
    };

    page.lines.forEach((rawLine, index) => {
      const lineNumber = index + 1;
      const line = cleanWhitespace(rawLine);
      linesAnalyzed += 1;

      if (!line || isHeaderOrFooter(line)) return;

      const startsRow = startsLikeHistoricalRow(line);

      if (pending) {
        if (startsRow) {
          flushPending();
        } else {
          pending.source = cleanWhitespace(`${pending.source} ${line}`);
          pending.parts += 1;
          const combined = parseHistoricalRow(
            pending.source,
            page.pageNumber,
            pending.lineNumber
          );
          if (combined) {
            records.push(combined);
            warnings.push(...warningsForRecord(combined, pending.source));
            pending = null;
            return;
          }
          if (pending.parts >= 3) flushPending();
          return;
        }
      }

      const record = parseHistoricalRow(line, page.pageNumber, lineNumber);
      if (record) {
        records.push(record);
        warnings.push(...warningsForRecord(record, line));
        return;
      }

      if (startsRow && !/^\d{1,6}\s+Y\(\*\*\)/i.test(line)) {
        pending = { source: line, lineNumber, parts: 1 };
      }
    });

    flushPending();
  }

  return {
    format: HISTORICAL_CALIBRATION_FORMAT,
    records,
    warnings,
    pagesAnalyzed: pages.length,
    linesAnalyzed,
    doubtfulRows: records.filter(
      (record) => record.datos_extra.advertencias.length > 0
    ).length,
  };
}
