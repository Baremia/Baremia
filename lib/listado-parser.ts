export type RegistroExtraido = {
  clave: string;
  numero_registro: string | null;
  dni_publicado: string | null;
  nombre_publicado: string;
  cupo_discapacidad: boolean | null;
  puntuacion_oposicion: number | null;
  puntuacion_concurso: number | null;
  puntuacion_total: number | null;
  orden_publicado: number;
  numero_pagina: number | null;
  numero_fila: number;
  observaciones: string | null;
  datos_extra: Record<string, string | number | boolean | null>;
};

export type ResultadoParseoListado = {
  formato:
    | "madrid_oposicion_doble_columna"
    | "madrid_bolsa_alfabetica"
    | "desconocido";
  confianza: number;
  registros: RegistroExtraido[];
  total_esperado: number | null;
  total_coincide: boolean | null;
  lineas_analizadas: number;
  lineas_con_registro: number;
  duplicados_descartados: number;
  avisos: string[];
};

const NUMBER = "(?:\\d{1,3}(?:[.,]\\d{1,3})?)";
const MASKED_DNI = "(?:[XYZ0-9*]{7,12})";

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
    .trim();
}

function normalizeDni(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function pageFromLine(line: string, currentPage: number): number {
  const explicit = line.match(/\bP(?:Á|A)?G(?:INA)?\.?\s*(\d+)\b/i);
  return explicit ? Number(explicit[1]) : currentPage;
}

function parseOposicionLine(
  line: string,
  page: number,
  lineNumber: number,
  orderStart: number
): RegistroExtraido[] {
  const record = new RegExp(
    `(?:^|\\s)(\\d{5,7})\\s+(${MASKED_DNI})\\s+(.+?)\\s+(?:(S|SI|SÍ)\\s+)?(${NUMBER})(?=\\s+\\d{5,7}\\s+${MASKED_DNI}|\\s*$)`,
    "giu"
  );

  const results: RegistroExtraido[] = [];
  let match: RegExpExecArray | null;

  while ((match = record.exec(line)) !== null) {
    const reg = match[1];
    const dni = normalizeDni(match[2]);
    const name = cleanName(match[3]);
    const score = parseNumber(match[5]);

    if (name.length < 4 || score === null) continue;

    results.push({
      clave: `reg:${reg}`,
      numero_registro: reg,
      dni_publicado: dni,
      nombre_publicado: name,
      cupo_discapacidad: Boolean(match[4]),
      puntuacion_oposicion: score,
      puntuacion_concurso: null,
      puntuacion_total: score,
      orden_publicado: orderStart + results.length,
      numero_pagina: page,
      numero_fila: lineNumber,
      observaciones: match[4] ? "Cupo de discapacidad" : null,
      datos_extra: { numero_registro: reg, formato: "oposicion" },
    });
  }

  return results;
}

function parseBolsaLine(
  line: string,
  page: number,
  lineNumber: number,
  order: number
): RegistroExtraido | null {
  const regex = new RegExp(
    `^\\s*(${MASKED_DNI})\\s+(.+?)\\s+(\\d{2,5})\\s+([NS])\\s+(${NUMBER})\\s+(${NUMBER})\\s+(${NUMBER})\\s*$`,
    "iu"
  );
  const match = line.match(regex);
  if (!match) return null;

  const dni = normalizeDni(match[1]);
  const name = cleanName(match[2]);
  const formation = parseNumber(match[5]);
  const experience = parseNumber(match[6]);
  const total = parseNumber(match[7]);

  if (name.length < 4 || total === null) return null;

  return {
    clave: `dni:${dni}:nombre:${name.toUpperCase()}`,
    numero_registro: null,
    dni_publicado: dni,
    nombre_publicado: name,
    cupo_discapacidad: match[4].toUpperCase() === "S",
    puntuacion_oposicion: null,
    puntuacion_concurso: total,
    puntuacion_total: total,
    orden_publicado: order,
    numero_pagina: page,
    numero_fila: lineNumber,
    observaciones: null,
    datos_extra: {
      centro_grabacion: match[3],
      discapacidad: match[4].toUpperCase() === "S",
      formacion: formation,
      experiencia: experience,
      formato: "bolsa_alfabetica",
    },
  };
}

function expectedTotal(text: string): number | null {
  const match = text.match(/TOTAL\s+(?:DE\s+)?APROBADOS\s*:\s*(\d{1,7})/i);
  return match ? Number(match[1]) : null;
}

export function parseListadoText(text: string): ResultadoParseoListado {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const lines = normalized.split("\n");
  const oposicion: RegistroExtraido[] = [];
  const bolsa: RegistroExtraido[] = [];
  let currentPage = 1;
  let linesWithRecords = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.includes("\f")) {
      currentPage += (raw.match(/\f/g) ?? []).length;
    }
    currentPage = pageFromLine(raw, currentPage);
    const line = raw.replace(/\f/g, " ").trimEnd();
    if (!line.trim()) continue;

    let oppositionRecords = parseOposicionLine(
      line,
      currentPage,
      index + 1,
      oposicion.length + 1
    );

    // Algunos nombres largos saltan de línea en el PDF. Solo usamos esta
    // recuperación cuando la línea individual no produjo ningún registro.
    if (oppositionRecords.length === 0) {
      for (let windowSize = 2; windowSize <= 3; windowSize += 1) {
        const combined = lines
          .slice(index, index + windowSize)
          .map((value) => value.replace(/\f/g, " ").trim())
          .filter(Boolean)
          .join(" ");

        oppositionRecords = parseOposicionLine(
          combined,
          currentPage,
          index + 1,
          oposicion.length + 1
        );

        if (oppositionRecords.length > 0) break;
      }
    }

    if (oppositionRecords.length > 0) {
      oposicion.push(...oppositionRecords);
      linesWithRecords += 1;
      continue;
    }

    const bolsaRecord = parseBolsaLine(
      line,
      currentPage,
      index + 1,
      bolsa.length + 1
    );
    if (bolsaRecord) {
      bolsa.push(bolsaRecord);
      linesWithRecords += 1;
    }
  }

  const selected = oposicion.length >= bolsa.length ? oposicion : bolsa;
  const seen = new Set<string>();
  const deduplicated: RegistroExtraido[] = [];
  let duplicates = 0;

  for (const record of selected) {
    if (seen.has(record.clave)) {
      duplicates += 1;
      continue;
    }
    seen.add(record.clave);
    deduplicated.push({ ...record, orden_publicado: deduplicated.length + 1 });
  }

  const format =
    selected === oposicion && oposicion.length > 0
      ? "madrid_oposicion_doble_columna"
      : bolsa.length > 0
        ? "madrid_bolsa_alfabetica"
        : "desconocido";

  const totalExpected = expectedTotal(normalized);
  const totalMatches =
    totalExpected === null ? null : totalExpected === deduplicated.length;

  const confidence =
    deduplicated.length === 0
      ? 0
      : Math.min(0.99, 0.65 + Math.log10(deduplicated.length + 1) / 10);

  const warnings: string[] = [];
  if (deduplicated.length === 0) {
    warnings.push("No se reconoció ningún registro con los formatos configurados.");
  } else if (deduplicated.length < 10) {
    warnings.push(
      "Se extrajeron muy pocos registros; conviene revisar el resultado antes de importarlo."
    );
  }
  if (duplicates > 0) {
    warnings.push(`Se descartaron ${duplicates} registros duplicados.`);
  }
  if (totalMatches === false) {
    warnings.push(
      `El PDF declara ${totalExpected} aprobados, pero se extrajeron ${deduplicated.length}. La importación quedará bloqueada.`
    );
  }

  return {
    formato: format,
    confianza: Number(confidence.toFixed(3)),
    registros: deduplicated,
    total_esperado: totalExpected,
    total_coincide: totalMatches,
    lineas_analizadas: lines.length,
    lineas_con_registro: linesWithRecords,
    duplicados_descartados: duplicates,
    avisos: warnings,
  };
}
