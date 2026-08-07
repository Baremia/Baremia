import { parseHistoricalCalibrationPages } from "./historical-calibration-parser";
import { extractPdfPageBatch } from "./pdf-batch-processor";
import { supabaseAdmin } from "./supabase-admin";

const BUCKET = "listados-oficiales";
const UPSERT_SIZE = 500;
const LOCK_STALE_AFTER_MS = 5 * 60 * 1000;
const EXPECTED_IDENTIFIED_RECORDS = 19_136;

export const HISTORICAL_BATCH_SIZE = 30;
export const HISTORICAL_BATCH_MODEL = "baremia-calibracion-historica-v1";

const PROCESS_COLUMNS = [
  "id",
  "listado_id",
  "tipo",
  "estado",
  "progreso",
  "modelo_ia",
  "inicio_at",
  "fin_at",
  "error",
  "detalles",
  "pagina_inicio",
  "pagina_fin",
  "pagina_actual",
  "total_paginas",
  "total_registros",
  "lotes_completados",
  "ultimo_error",
  "reanudable",
  "created_at",
].join(",");

type JsonObject = Record<string, unknown>;

type HistoricalListado = {
  id: string;
  convocatoria_id: string;
  titulo: string;
  tipo: string;
  archivo_storage: string;
};

type HistoricalProcess = {
  id: string;
  listado_id: string;
  estado: string;
  progreso: number | null;
  inicio_at: string | null;
  fin_at: string | null;
  error: string | null;
  detalles: unknown;
  pagina_inicio: number | null;
  pagina_fin: number | null;
  pagina_actual: number | null;
  total_paginas: number | null;
  total_registros: number | null;
  lotes_completados: number | null;
};

export type HistoricalBatchResult = {
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

export class HistoricalBatchServiceError extends Error {
  status: number;
  processId?: string;

  constructor(message: string, status = 500, processId?: string) {
    super(message);
    this.name = "HistoricalBatchServiceError";
    this.status = status;
    this.processId = processId;
  }
}

function toObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asNonNegativeInteger(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function isStale(startedAt: string | null) {
  if (!startedAt) return true;
  const milliseconds = new Date(startedAt).getTime();
  return (
    !Number.isFinite(milliseconds) ||
    milliseconds < Date.now() - LOCK_STALE_AFTER_MS
  );
}

function progressPercentage(currentPage: number, totalPages: number) {
  if (totalPages <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100)));
}

async function loadListado(listadoId: string): Promise<HistoricalListado> {
  const { data, error } = await supabaseAdmin
    .from("listados")
    .select("id,convocatoria_id,titulo,tipo,archivo_storage")
    .eq("id", listadoId)
    .maybeSingle();

  if (error) {
    throw new HistoricalBatchServiceError(
      `No se pudo cargar la calibración histórica: ${error.message}`
    );
  }
  if (!data?.archivo_storage) {
    throw new HistoricalBatchServiceError("Documento histórico no encontrado.", 404);
  }
  if (data.tipo !== "calibracion_historica") {
    throw new HistoricalBatchServiceError(
      "El documento no está registrado como calibración histórica.",
      422
    );
  }

  return data as HistoricalListado;
}

async function loadProcess(listadoId: string): Promise<HistoricalProcess | null> {
  const { data, error } = await supabaseAdmin
    .from("procesos_ia")
    .select(PROCESS_COLUMNS)
    .eq("listado_id", listadoId)
    .eq("modelo_ia", HISTORICAL_BATCH_MODEL)
    .eq("reanudable", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HistoricalBatchServiceError(
      `No se pudo consultar el progreso histórico: ${error.message}`
    );
  }

  return data as HistoricalProcess | null;
}

async function createProcess(listado: HistoricalListado, now: string) {
  const { data, error } = await supabaseAdmin
    .from("procesos_ia")
    .insert({
      listado_id: listado.id,
      tipo: "extraccion",
      estado: "ejecutando",
      progreso: 0,
      modelo_ia: HISTORICAL_BATCH_MODEL,
      inicio_at: now,
      fin_at: null,
      error: null,
      pagina_inicio: null,
      pagina_fin: null,
      pagina_actual: 0,
      total_paginas: null,
      total_registros: 0,
      lotes_completados: 0,
      ultimo_error: null,
      reanudable: true,
      detalles: {
        fase: "preparacion_lote_historico",
        documento: listado.titulo,
        registros_identificables_esperados: EXPECTED_IDENTIFIED_RECORDS,
        lote_solicitado_at: now,
      },
    })
    .select(PROCESS_COLUMNS)
    .single();

  if (error || !data) {
    throw new HistoricalBatchServiceError(
      `No se pudo crear el proceso histórico: ${error?.message ?? "respuesta vacía"}`
    );
  }

  return data as HistoricalProcess;
}

async function claimExistingProcess(process: HistoricalProcess, now: string) {
  if (process.estado === "ejecutando" && !isStale(process.inicio_at)) {
    throw new HistoricalBatchServiceError(
      "Este histórico ya tiene otro lote en ejecución.",
      409,
      process.id
    );
  }

  const details = toObject(process.detalles);
  let query = supabaseAdmin
    .from("procesos_ia")
    .update({
      estado: "ejecutando",
      inicio_at: now,
      fin_at: null,
      error: null,
      ultimo_error: null,
      detalles: {
        ...details,
        fase: "preparacion_lote_historico",
        lote_solicitado_at: now,
      },
    })
    .eq("id", process.id)
    .eq("estado", process.estado);

  if (process.estado === "ejecutando") {
    query = process.inicio_at
      ? query.eq("inicio_at", process.inicio_at)
      : query.is("inicio_at", null);
  }

  const { data, error } = await query.select(PROCESS_COLUMNS).maybeSingle();

  if (error) {
    throw new HistoricalBatchServiceError(
      `No se pudo bloquear el lote histórico: ${error.message}`,
      500,
      process.id
    );
  }
  if (!data) {
    throw new HistoricalBatchServiceError(
      "Otro proceso se adelantó y ya está ejecutando este histórico.",
      409,
      process.id
    );
  }

  return data as HistoricalProcess;
}

async function claimProcess(listado: HistoricalListado) {
  const existing = await loadProcess(listado.id);
  const knownTotalPages = asNonNegativeInteger(existing?.total_paginas);
  const currentPage = asNonNegativeInteger(existing?.pagina_actual);

  if (existing && knownTotalPages > 0 && currentPage >= knownTotalPages) {
    return { process: existing, alreadyCompleted: true };
  }

  const now = new Date().toISOString();
  const process = existing
    ? await claimExistingProcess(existing, now)
    : await createProcess(listado, now);

  return { process, alreadyCompleted: false };
}

async function countImportedRecords(listadoId: string) {
  const { count, error } = await supabaseAdmin
    .from("fuentes_calibracion_historica")
    .select("id", { count: "exact", head: true })
    .eq("listado_id", listadoId);

  if (error) {
    throw new HistoricalBatchServiceError(
      `No se pudo contar la calibración histórica: ${error.message}`
    );
  }

  return count ?? 0;
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
      throw new HistoricalBatchServiceError(
        `No se pudo guardar el lote histórico: ${error.message}`
      );
    }
  }
}

async function markProcessError(
  listadoId: string,
  process: HistoricalProcess,
  message: string,
  attemptedStart: number,
  attemptedEnd: number,
  detectedTotalPages: number | null
) {
  const finishedAt = new Date().toISOString();
  const details = toObject(process.detalles);

  await Promise.allSettled([
    supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: "error",
        fin_at: finishedAt,
        error: message,
        ultimo_error: message,
        ...(detectedTotalPages ? { total_paginas: detectedTotalPages } : {}),
        detalles: {
          ...details,
          fase: "error_lote_historico",
          lote_fallido: {
            pagina_inicio: attemptedStart,
            pagina_fin: attemptedEnd,
            error: message,
            fallido_at: finishedAt,
          },
        },
      })
      .eq("id", process.id),
    supabaseAdmin
      .from("listados")
      .update({
        estado_procesamiento: "error",
        error_procesamiento: message,
      })
      .eq("id", listadoId),
  ]);
}

function completedResult(process: HistoricalProcess): HistoricalBatchResult {
  const totalPages = asNonNegativeInteger(process.total_paginas);
  const currentPage = asNonNegativeInteger(process.pagina_actual);
  const totalRecords = asNonNegativeInteger(process.total_registros);

  return {
    processId: process.id,
    completed: true,
    alreadyCompleted: true,
    startPage: asNonNegativeInteger(process.pagina_inicio),
    endPage: asNonNegativeInteger(process.pagina_fin),
    currentPage,
    totalPages,
    recordsInBatch: 0,
    totalRecords,
    doubtfulRowsInBatch: 0,
    warningsInBatch: 0,
    completedBatches: asNonNegativeInteger(process.lotes_completados),
    progress: progressPercentage(currentPage, totalPages),
  };
}

export async function processNextHistoricalCalibrationBatch(
  listadoId: string
): Promise<HistoricalBatchResult> {
  const listado = await loadListado(listadoId);
  const claim = await claimProcess(listado);

  if (claim.alreadyCompleted) return completedResult(claim.process);

  const process = claim.process;
  const currentPage = asNonNegativeInteger(process.pagina_actual);
  const knownTotalPages = asNonNegativeInteger(process.total_paginas);
  const startPage = currentPage + 1;
  const attemptedEnd =
    knownTotalPages > 0
      ? Math.min(knownTotalPages, startPage + HISTORICAL_BATCH_SIZE - 1)
      : startPage + HISTORICAL_BATCH_SIZE - 1;
  let failedEndPage = attemptedEnd;
  let detectedTotalPages = knownTotalPages || null;

  try {
    const { error: startingError } = await supabaseAdmin
      .from("listados")
      .update({ estado_procesamiento: "procesando", error_procesamiento: null })
      .eq("id", listado.id);

    if (startingError) {
      throw new HistoricalBatchServiceError(
        `No se pudo marcar el histórico como procesando: ${startingError.message}`,
        500,
        process.id
      );
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(listado.archivo_storage, 10 * 60);

    if (signedError || !signed?.signedUrl) {
      throw new HistoricalBatchServiceError(
        `No se pudo autorizar la lectura del histórico: ${signedError?.message ?? "URL vacía"}`
      );
    }

    const extracted = await extractPdfPageBatch(
      signed.signedUrl,
      startPage,
      attemptedEnd
    );
    detectedTotalPages = extracted.totalPages;
    failedEndPage = extracted.pages.at(-1)?.pageNumber ?? attemptedEnd;

    if (knownTotalPages > 0 && extracted.totalPages !== knownTotalPages) {
      throw new HistoricalBatchServiceError(
        "El número de páginas del histórico ha cambiado. Reinicia el proceso.",
        409,
        process.id
      );
    }
    if (extracted.characters === 0) {
      throw new HistoricalBatchServiceError(
        "El lote histórico no contiene texto extraíble.",
        422,
        process.id
      );
    }

    const parsed = parseHistoricalCalibrationPages(extracted.pages);
    if (parsed.records.length === 0) {
      throw new HistoricalBatchServiceError(
        "Se extrajo texto, pero no se reconocieron filas AP.1/AP.2. No se avanza para evitar perder páginas.",
        422,
        process.id
      );
    }

    await saveRecords(listado, parsed.records);
    const totalRecords = await countImportedRecords(listado.id);
    const endPage = extracted.pages.at(-1)?.pageNumber ?? startPage;
    const reachedLastPage = endPage >= extracted.totalPages;

    if (reachedLastPage && totalRecords !== EXPECTED_IDENTIFIED_RECORDS) {
      throw new HistoricalBatchServiceError(
        `La extracción histórica terminó con ${totalRecords} registros identificables y se esperaban ${EXPECTED_IDENTIFIED_RECORDS}. No se valida hasta revisar la diferencia.`,
        422,
        process.id
      );
    }

    const completed = reachedLastPage && totalRecords === EXPECTED_IDENTIFIED_RECORDS;
    const completedBatches = asNonNegativeInteger(process.lotes_completados) + 1;
    const progress = progressPercentage(endPage, extracted.totalPages);
    const finishedAt = new Date().toISOString();
    const details = toObject(process.detalles);

    const { error: listadoUpdateError } = await supabaseAdmin
      .from("listados")
      .update({
        estado_procesamiento: completed ? "procesado" : "procesando",
        total_registros: totalRecords,
        procesado_at: completed ? finishedAt : null,
        error_procesamiento: null,
      })
      .eq("id", listado.id);

    if (listadoUpdateError) {
      throw new HistoricalBatchServiceError(
        `No se pudo actualizar el documento histórico: ${listadoUpdateError.message}`,
        500,
        process.id
      );
    }

    const { error: processUpdateError } = await supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: completed ? "completado" : "pendiente",
        progreso: progress,
        inicio_at: null,
        fin_at: completed ? finishedAt : null,
        error: null,
        pagina_inicio: startPage,
        pagina_fin: endPage,
        pagina_actual: endPage,
        total_paginas: extracted.totalPages,
        total_registros: totalRecords,
        lotes_completados: completedBatches,
        ultimo_error: null,
        detalles: {
          ...details,
          fase: completed ? "completado" : "lote_completado",
          formato: parsed.format,
          registros_identificables_esperados: EXPECTED_IDENTIFIED_RECORDS,
          ultimo_lote: {
            pagina_inicio: startPage,
            pagina_fin: endPage,
            paginas: extracted.pages.length,
            registros: parsed.records.length,
            filas_dudosas: parsed.doubtfulRows,
            advertencias: parsed.warnings.length,
            muestra_advertencias: parsed.warnings.slice(0, 10),
            completado_at: finishedAt,
          },
        },
      })
      .eq("id", process.id);

    if (processUpdateError) {
      throw new HistoricalBatchServiceError(
        `No se pudo guardar el progreso histórico: ${processUpdateError.message}`,
        500,
        process.id
      );
    }

    return {
      processId: process.id,
      completed,
      alreadyCompleted: false,
      startPage,
      endPage,
      currentPage: endPage,
      totalPages: extracted.totalPages,
      recordsInBatch: parsed.records.length,
      totalRecords,
      doubtfulRowsInBatch: parsed.doubtfulRows,
      warningsInBatch: parsed.warnings.length,
      completedBatches,
      progress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error histórico desconocido.";
    await markProcessError(
      listado.id,
      process,
      message,
      startPage,
      failedEndPage,
      detectedTotalPages
    );
    if (error instanceof HistoricalBatchServiceError) throw error;
    throw new HistoricalBatchServiceError(message, 500, process.id);
  }
}
