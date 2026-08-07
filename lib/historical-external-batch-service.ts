import { parseHistoricalCalibrationPages } from "./historical-calibration-parser";
import { extractPdfPageBatch } from "./pdf-batch-processor";
import { supabaseAdmin } from "./supabase-admin";

const OFFICIAL_SOURCE_URL =
  "https://www.comunidad.madrid/docs/assets/2022/09/29/rrhh-ope-enfermeroa-2022-09-29-listado_concurso_alfabetico.pdf";
const EXPECTED_RECORDS = 19_136;
const BATCH_SIZE = 30;
const UPSERT_SIZE = 500;
const STALE_MS = 5 * 60 * 1000;

export const HISTORICAL_EXTERNAL_MODEL = "baremia-calibracion-historica-v1";

type HistoricalProcess = {
  id: string;
  estado: string;
  inicio_at: string | null;
  detalles: unknown;
  pagina_actual: number | null;
  total_paginas: number | null;
  total_registros: number | null;
  lotes_completados: number | null;
  pagina_inicio: number | null;
  pagina_fin: number | null;
};

type HistoricalListado = {
  id: string;
  convocatoria_id: string;
  titulo: string;
  tipo: string;
  fuente_url: string | null;
};

export type HistoricalExternalResult = {
  processId: string;
  completed: boolean;
  alreadyCompleted: boolean;
  startPage: number;
  endPage: number;
  currentPage: number;
  totalPages: number;
  recordsInBatch: number;
  totalRecords: number;
  doubtfulRowsInBatch: number;
  warningsInBatch: number;
  completedBatches: number;
  progress: number;
};

export class HistoricalExternalError extends Error {
  status: number;
  processId?: string;

  constructor(message: string, status = 500, processId?: string) {
    super(message);
    this.name = "HistoricalExternalError";
    this.status = status;
    this.processId = processId;
  }
}

function integer(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function progress(current: number, total: number) {
  return total > 0
    ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
    : 0;
}

function processIsFresh(process: HistoricalProcess) {
  if (!process.inicio_at) return false;
  const time = new Date(process.inicio_at).getTime();
  return Number.isFinite(time) && time > Date.now() - STALE_MS;
}

async function loadListado(listadoId: string): Promise<HistoricalListado> {
  const { data, error } = await supabaseAdmin
    .from("listados")
    .select("id,convocatoria_id,titulo,tipo,fuente_url")
    .eq("id", listadoId)
    .maybeSingle();

  if (error) throw new HistoricalExternalError(error.message);
  if (!data) throw new HistoricalExternalError("Fuente histórica no encontrada.", 404);
  if (data.tipo !== "calibracion_historica") {
    throw new HistoricalExternalError("El documento no es una calibración histórica.", 422);
  }
  if (data.fuente_url !== OFFICIAL_SOURCE_URL) {
    throw new HistoricalExternalError(
      "La URL de esta calibración no coincide con la fuente oficial permitida.",
      422
    );
  }

  return data as HistoricalListado;
}

async function loadProcess(listadoId: string): Promise<HistoricalProcess | null> {
  const { data, error } = await supabaseAdmin
    .from("procesos_ia")
    .select(
      "id,estado,inicio_at,detalles,pagina_actual,total_paginas,total_registros,lotes_completados,pagina_inicio,pagina_fin"
    )
    .eq("listado_id", listadoId)
    .eq("modelo_ia", HISTORICAL_EXTERNAL_MODEL)
    .eq("reanudable", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HistoricalExternalError(error.message);
  return data as HistoricalProcess | null;
}

async function claimProcess(listado: HistoricalListado) {
  const existing = await loadProcess(listado.id);
  const current = integer(existing?.pagina_actual);
  const total = integer(existing?.total_paginas);

  if (existing && total > 0 && current >= total && existing.estado === "completado") {
    return { process: existing, alreadyCompleted: true };
  }

  if (existing && existing.estado === "ejecutando" && processIsFresh(existing)) {
    throw new HistoricalExternalError(
      "La calibración histórica ya tiene un lote en ejecución.",
      409,
      existing.id
    );
  }

  const now = new Date().toISOString();
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: "ejecutando",
        inicio_at: now,
        fin_at: null,
        error: null,
        ultimo_error: null,
        detalles: {
          ...object(existing.detalles),
          fase: "preparacion_lote_historico",
          lote_solicitado_at: now,
        },
      })
      .eq("id", existing.id)
      .select(
        "id,estado,inicio_at,detalles,pagina_actual,total_paginas,total_registros,lotes_completados,pagina_inicio,pagina_fin"
      )
      .single();

    if (error || !data) {
      throw new HistoricalExternalError(
        `No se pudo bloquear el histórico: ${error?.message ?? "respuesta vacía"}`
      );
    }
    return { process: data as HistoricalProcess, alreadyCompleted: false };
  }

  const { data, error } = await supabaseAdmin
    .from("procesos_ia")
    .insert({
      listado_id: listado.id,
      tipo: "extraccion",
      estado: "ejecutando",
      progreso: 0,
      modelo_ia: HISTORICAL_EXTERNAL_MODEL,
      inicio_at: now,
      error: null,
      pagina_actual: 0,
      total_registros: 0,
      lotes_completados: 0,
      reanudable: true,
      detalles: {
        fase: "preparacion_lote_historico",
        documento: listado.titulo,
        fuente_oficial: OFFICIAL_SOURCE_URL,
        registros_identificables_esperados: EXPECTED_RECORDS,
      },
    })
    .select(
      "id,estado,inicio_at,detalles,pagina_actual,total_paginas,total_registros,lotes_completados,pagina_inicio,pagina_fin"
    )
    .single();

  if (error || !data) {
    throw new HistoricalExternalError(
      `No se pudo crear el proceso histórico: ${error?.message ?? "respuesta vacía"}`
    );
  }

  return { process: data as HistoricalProcess, alreadyCompleted: false };
}

async function saveRecords(
  listado: HistoricalListado,
  records: ReturnType<typeof parseHistoricalCalibrationPages>["records"]
) {
  for (let start = 0; start < records.length; start += UPSERT_SIZE) {
    const rows = records.slice(start, start + UPSERT_SIZE).map((record) => ({
      listado_id: listado.id,
      convocatoria_objetivo_id: listado.convocatoria_id,
      ...record,
    }));

    const { error } = await supabaseAdmin
      .from("fuentes_calibracion_historica")
      .upsert(rows, { onConflict: "listado_id,numero_pagina,numero_fila" });

    if (error) {
      throw new HistoricalExternalError(
        `No se pudo guardar la calibración histórica: ${error.message}`
      );
    }
  }
}

async function countRows(listadoId: string) {
  const { count, error } = await supabaseAdmin
    .from("fuentes_calibracion_historica")
    .select("id", { count: "exact", head: true })
    .eq("listado_id", listadoId);

  if (error) throw new HistoricalExternalError(error.message);
  return count ?? 0;
}

async function markError(
  listado: HistoricalListado,
  process: HistoricalProcess,
  message: string,
  startPage: number,
  endPage: number,
  totalPages: number | null
) {
  const finished = new Date().toISOString();
  await Promise.allSettled([
    supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: "error",
        fin_at: finished,
        error: message,
        ultimo_error: message,
        ...(totalPages ? { total_paginas: totalPages } : {}),
        detalles: {
          ...object(process.detalles),
          fase: "error_lote_historico",
          lote_fallido: { pagina_inicio: startPage, pagina_fin: endPage, error: message },
        },
      })
      .eq("id", process.id),
    supabaseAdmin
      .from("listados")
      .update({ estado_procesamiento: "error", error_procesamiento: message })
      .eq("id", listado.id),
  ]);
}

export async function processNextHistoricalExternalBatch(
  listadoId: string
): Promise<HistoricalExternalResult> {
  const listado = await loadListado(listadoId);
  const claimed = await claimProcess(listado);
  const process = claimed.process;

  if (claimed.alreadyCompleted) {
    const totalPages = integer(process.total_paginas);
    const currentPage = integer(process.pagina_actual);
    return {
      processId: process.id,
      completed: true,
      alreadyCompleted: true,
      startPage: integer(process.pagina_inicio),
      endPage: integer(process.pagina_fin),
      currentPage,
      totalPages,
      recordsInBatch: 0,
      totalRecords: integer(process.total_registros),
      doubtfulRowsInBatch: 0,
      warningsInBatch: 0,
      completedBatches: integer(process.lotes_completados),
      progress: progress(currentPage, totalPages),
    };
  }

  const currentPage = integer(process.pagina_actual);
  const knownTotalPages = integer(process.total_paginas);
  const startPage = currentPage + 1;
  const requestedEnd = knownTotalPages > 0
    ? Math.min(knownTotalPages, startPage + BATCH_SIZE - 1)
    : startPage + BATCH_SIZE - 1;
  let detectedTotalPages: number | null = knownTotalPages || null;
  let lastPage = requestedEnd;

  try {
    await supabaseAdmin
      .from("listados")
      .update({ estado_procesamiento: "procesando", error_procesamiento: null })
      .eq("id", listado.id);

    const extracted = await extractPdfPageBatch(
      OFFICIAL_SOURCE_URL,
      startPage,
      requestedEnd
    );
    detectedTotalPages = extracted.totalPages;
    lastPage = extracted.pages.at(-1)?.pageNumber ?? startPage;

    if (knownTotalPages > 0 && knownTotalPages !== extracted.totalPages) {
      throw new HistoricalExternalError(
        "El número de páginas de la fuente histórica ha cambiado.",
        409,
        process.id
      );
    }

    const parsed = parseHistoricalCalibrationPages(extracted.pages);
    if (parsed.records.length === 0) {
      throw new HistoricalExternalError(
        "No se reconocieron filas históricas AP.1/AP.2 en el lote.",
        422,
        process.id
      );
    }

    await saveRecords(listado, parsed.records);
    const totalRecords = await countRows(listado.id);
    const reachedEnd = lastPage >= extracted.totalPages;

    if (reachedEnd && totalRecords !== EXPECTED_RECORDS) {
      throw new HistoricalExternalError(
        `La extracción terminó con ${totalRecords} registros y se esperaban ${EXPECTED_RECORDS}. No se valida hasta revisar la diferencia.`,
        422,
        process.id
      );
    }

    const completed = reachedEnd && totalRecords === EXPECTED_RECORDS;
    const batches = integer(process.lotes_completados) + 1;
    const percent = progress(lastPage, extracted.totalPages);
    const finished = new Date().toISOString();

    const { error: processError } = await supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: completed ? "completado" : "pendiente",
        progreso: percent,
        inicio_at: null,
        fin_at: completed ? finished : null,
        error: null,
        ultimo_error: null,
        pagina_inicio: startPage,
        pagina_fin: lastPage,
        pagina_actual: lastPage,
        total_paginas: extracted.totalPages,
        total_registros: totalRecords,
        lotes_completados: batches,
        detalles: {
          ...object(process.detalles),
          fase: completed ? "completado" : "lote_completado",
          formato: parsed.format,
          registros_identificables_esperados: EXPECTED_RECORDS,
          ultimo_lote: {
            pagina_inicio: startPage,
            pagina_fin: lastPage,
            registros: parsed.records.length,
            filas_dudosas: parsed.doubtfulRows,
            advertencias: parsed.warnings.length,
            muestra_advertencias: parsed.warnings.slice(0, 10),
            completado_at: finished,
          },
        },
      })
      .eq("id", process.id);

    if (processError) throw new HistoricalExternalError(processError.message);

    const { error: listadoError } = await supabaseAdmin
      .from("listados")
      .update({
        estado_procesamiento: completed ? "procesado" : "procesando",
        total_registros: totalRecords,
        procesado_at: completed ? finished : null,
        error_procesamiento: null,
      })
      .eq("id", listado.id);

    if (listadoError) throw new HistoricalExternalError(listadoError.message);

    return {
      processId: process.id,
      completed,
      alreadyCompleted: false,
      startPage,
      endPage: lastPage,
      currentPage: lastPage,
      totalPages: extracted.totalPages,
      recordsInBatch: parsed.records.length,
      totalRecords,
      doubtfulRowsInBatch: parsed.doubtfulRows,
      warningsInBatch: parsed.warnings.length,
      completedBatches: batches,
      progress: percent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error histórico desconocido.";
    await markError(listado, process, message, startPage, lastPage, detectedTotalPages);
    if (error instanceof HistoricalExternalError) throw error;
    throw new HistoricalExternalError(message, 500, process.id);
  }
}
