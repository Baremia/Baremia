export const MERIT_SOURCE_FORMAT = "madrid_bolsa_admitidos_alfabetico";

export type MeritSourcePage = {
  pageNumber: number;
  lines: string[];
};

export type MeritSourceWarning = {
  code: string;
  message: string;
  pageNumber: number;
  lineNumber: number;
  source: string;
};

export type MeritSourceRecord = {
  dni_publicado: string | null;
  dni_normalizado: string | null;
  nombre_publicado: string;
  nombre_normalizado: string;
  centro_grabacion: string | null;
  cupo_discapacidad: boolean;
  puntuacion_formacion: number | null;
  puntuacion_experiencia: number | null;
  puntuacion_total: number | null;
  numero_pagina: number;
  numero_fila: number;
  datos_extra: {
    formato: typeof MERIT_SOURCE_FORMAT;
    discapacidad_publicada: string | null;
    suma_esperada: number | null;
    diferencia_total: number | null;
    advertencias: string[];
  };
};

export type MeritSourceParseResult = {
  format: typeof MERIT_SOURCE_FORMAT;
  records: MeritSourceRecord[];
  warnings: MeritSourceWarning[];
  pagesAnalyzed: number;
  linesAnalyzed: number;
  doubtfulRows: number;
};

const SUM_TOLERANCE = 0.05;
const SCORE_TOKEN = /^(?:-+|-?\d+(?:[.,]\d+)?)$/;
const DISABILITY_TOKEN = /^(?:S|SI|SÍ|N|NO|-)$/i;
const HEADER_PATTERNS = [
  /RELACI[ÓO]N\s+DEFINITIVA\s+DE\s+ADMITIDOS/i,
  /POR\s+ORDEN\s+ALFAB[ÉE]TICO/i,
  /NIF\s*\/?\s*NIE/i,
  /APELLIDOS\s+Y\s+NOMBRE/i,
  /CENTRO\s+GRABACI[ÓO]N/i,
  /\bDISC\.?.*\bFORM\.?.*\bEXP\.?.*\bTOTAL\b/i,
  /SERVICIO\s+MADRILE[ÑN]O\s+DE\s+SALUD/i,
  /COMUNIDAD\s+DE\s+MADRID/i,
  /DIRECCI[ÓO]N\s+GENERAL/i,
  /^P(?:Á|A)GINA\s+\d+(?:\s+DE\s+\d+)?$/i,
  /^\d+\s*\/\s*\d+$/,
  /^CSV\s*:/i,
  /^C[ÓO]DIGO\s+SEGURO\s+DE\s+VERIFICACI[ÓO]N/i,
];

function cleanWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function withoutDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeMeritName(value: string) {
  return withoutDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePublishedDni(value: string) {
  const normalized = withoutDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9*]/g, "");

  return normalized || null;
}

export function parseSpanishScore(value: string | undefined) {
  if (!value) return null;

  const compact = value.replace(/\s+/g, "").trim();
  if (!compact || /^-+$/.test(compact)) return null;

  let normalized = compact;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isHeaderOrFooter(line: string) {
  const normalized = cleanWhitespace(line);
  if (!normalized) return true;

  return HEADER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isPublishedDniToken(value: string) {
  const normalized = normalizePublishedDni(value);
  if (!normalized || normalized.length < 7 || normalized.length > 14) {
    return false;
  }

  if (!/^[A-Z0-9*]+$/.test(normalized) || !/[0-9*]/.test(normalized)) {
    return false;
  }

  return (
    /^\d{8}[A-Z]$/.test(normalized) ||
    /^[XYZ]\d{7}[A-Z]$/.test(normalized) ||
    normalized.includes("*") ||
    /^\d{7,9}$/.test(normalized)
  );
}

function splitDniFromLine(line: string) {
  const match = cleanWhitespace(line).match(/^(\S+)(?:\s+|$)(.*)$/);
  if (!match || !isPublishedDniToken(match[1])) return null;

  return { dni: match[1], remainder: match[2].trim() };
}

function isCentreToken(value: string) {
  return /^(?:-|(?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{1,19})$/i.test(value);
}

function looksLikeNameContinuation(line: string) {
  const cleaned = cleanWhitespace(line);
  if (cleaned.length < 3 || cleaned.length > 120 || /\d/.test(cleaned)) {
    return false;
  }

  return /^[A-ZÁÉÍÓÚÜÑÇÀÈÌÒÙÂÊÎÔÛÄËÏÖÜ,.'’\-\s]+$/i.test(cleaned);
}

function rowWarnings(
  formation: number | null,
  experience: number | null,
  total: number | null,
  disabilityPublished: string | null,
  centre: string | null
) {
  const warnings: string[] = [];

  if (formation === null) warnings.push("Puntuación de formación ausente o no numérica.");
  if (experience === null) warnings.push("Puntuación de experiencia ausente o no numérica.");
  if (total === null) warnings.push("Puntuación total ausente o no numérica.");
  if (!disabilityPublished) warnings.push("No se pudo determinar la columna de discapacidad.");
  if (!centre) warnings.push("Centro de grabación ausente.");

  if (formation !== null && experience !== null && total !== null) {
    const difference = Math.abs(formation + experience - total);
    if (difference > SUM_TOLERANCE) {
      warnings.push(
        `FORM. + EXP. difiere de TOTAL en ${difference.toFixed(3)} puntos.`
      );
    }
  }

  return warnings;
}

function parseCandidateLine(
  source: string,
  pageNumber: number,
  lineNumber: number
): MeritSourceRecord | null {
  const split = splitDniFromLine(source);
  if (!split) return null;

  const tokens = split.remainder.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return null;

  const scoreTokens = tokens.slice(-3);
  if (!scoreTokens.every((token) => SCORE_TOKEN.test(token))) return null;

  const beforeScores = tokens.slice(0, -3);
  let disabilityPublished: string | null = null;
  let centre: string | null = null;
  let nameTokens: string[] = [];

  const possibleDisability = beforeScores.at(-1);
  if (possibleDisability && DISABILITY_TOKEN.test(possibleDisability)) {
    disabilityPublished = possibleDisability;
    const possibleCentre = beforeScores.at(-2);
    if (!possibleCentre || !isCentreToken(possibleCentre)) return null;
    centre = possibleCentre === "-" ? null : possibleCentre;
    nameTokens = beforeScores.slice(0, -2);
  } else {
    const possibleCentre = beforeScores.at(-1);
    if (!possibleCentre || !isCentreToken(possibleCentre)) return null;
    centre = possibleCentre === "-" ? null : possibleCentre;
    nameTokens = beforeScores.slice(0, -1);
  }

  const publishedName = cleanWhitespace(nameTokens.join(" "))
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
    .trim();
  const normalizedName = normalizeMeritName(publishedName);

  if (normalizedName.length < 4) return null;

  const formation = parseSpanishScore(scoreTokens[0]);
  const experience = parseSpanishScore(scoreTokens[1]);
  const total = parseSpanishScore(scoreTokens[2]);
  const warnings = rowWarnings(
    formation,
    experience,
    total,
    disabilityPublished,
    centre
  );
  const expectedSum =
    formation !== null && experience !== null ? formation + experience : null;
  const difference =
    expectedSum !== null && total !== null
      ? Number(Math.abs(expectedSum - total).toFixed(6))
      : null;

  return {
    dni_publicado: split.dni,
    dni_normalizado: normalizePublishedDni(split.dni),
    nombre_publicado: publishedName,
    nombre_normalizado: normalizedName,
    centro_grabacion: centre,
    cupo_discapacidad: /^(?:S|SI|SÍ)$/i.test(disabilityPublished ?? ""),
    puntuacion_formacion: formation,
    puntuacion_experiencia: experience,
    puntuacion_total: total,
    numero_pagina: pageNumber,
    numero_fila: lineNumber,
    datos_extra: {
      formato: MERIT_SOURCE_FORMAT,
      discapacidad_publicada: disabilityPublished,
      suma_esperada: expectedSum === null ? null : Number(expectedSum.toFixed(6)),
      diferencia_total: difference,
      advertencias: warnings,
    },
  };
}

function warningForRecord(record: MeritSourceRecord, source: string) {
  return record.datos_extra.advertencias.map<MeritSourceWarning>((message) => ({
    code: message.startsWith("FORM. + EXP.") ? "total_no_cuadra" : "fila_incompleta",
    message,
    pageNumber: record.numero_pagina,
    lineNumber: record.numero_fila,
    source,
  }));
}

function appendNameContinuation(
  record: MeritSourceRecord,
  continuation: string
) {
  record.nombre_publicado = cleanWhitespace(
    `${record.nombre_publicado} ${continuation}`
  );
  record.nombre_normalizado = normalizeMeritName(record.nombre_publicado);
}

export function parseMeritSourcePages(
  pages: MeritSourcePage[]
): MeritSourceParseResult {
  const records: MeritSourceRecord[] = [];
  const warnings: MeritSourceWarning[] = [];
  let linesAnalyzed = 0;

  for (const page of pages) {
    let pending:
      | { source: string; lineNumber: number; parts: number }
      | null = null;
    let lastRecord: MeritSourceRecord | null = null;
    let lastRecordEndLine = 0;

    const flushPending = () => {
      if (!pending) return;
      warnings.push({
        code: "fila_no_reconocida",
        message: "La fila comienza con un DNI/NIE, pero no contiene todas las columnas esperadas.",
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

      if (!line || isHeaderOrFooter(line)) {
        return;
      }

      const startsWithDni = splitDniFromLine(line) !== null;

      if (pending) {
        if (startsWithDni) {
          flushPending();
        } else {
          pending.source = cleanWhitespace(`${pending.source} ${line}`);
          pending.parts += 1;
          const combinedRecord = parseCandidateLine(
            pending.source,
            page.pageNumber,
            pending.lineNumber
          );

          if (combinedRecord) {
            records.push(combinedRecord);
            warnings.push(...warningForRecord(combinedRecord, pending.source));
            lastRecord = combinedRecord;
            lastRecordEndLine = lineNumber;
            pending = null;
            return;
          }

          if (pending.parts >= 3) flushPending();
          return;
        }
      }

      const record = parseCandidateLine(line, page.pageNumber, lineNumber);
      if (record) {
        records.push(record);
        warnings.push(...warningForRecord(record, line));
        lastRecord = record;
        lastRecordEndLine = lineNumber;
        return;
      }

      if (startsWithDni) {
        pending = { source: line, lineNumber, parts: 1 };
        return;
      }

      if (
        lastRecord &&
        lineNumber === lastRecordEndLine + 1 &&
        looksLikeNameContinuation(line)
      ) {
        appendNameContinuation(lastRecord, line);
        lastRecordEndLine = lineNumber;
      }
    });

    flushPending();
  }

  const doubtfulRows = records.filter(
    (record) => record.datos_extra.advertencias.length > 0
  ).length;

  return {
    format: MERIT_SOURCE_FORMAT,
    records,
    warnings,
    pagesAnalyzed: pages.length,
    linesAnalyzed,
    doubtfulRows,
  };
}
