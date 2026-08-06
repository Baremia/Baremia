import { parseMeritSourcePages } from "./merit-source-parser";
import { extractPdfPageBatch } from "./pdf-batch-processor";
import { supabaseAdmin } from "./supabase-admin";

const BUCKET = "listados-oficiales";
const UPSERT_SIZE = 500;
const LOCK_STALE_AFTER_MS = 5 * 60 * 1000;

export const MERIT_BATCH_SIZE = 30;
export const MERIT_BATCH_MODEL = "baremia-meritos-batch-v1";
export const MERIT_SOURCE_TYPES = ["baremo_meritos", "bolsa_empleo"] as const;

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

type MeritListado = {
  id: string;
  convocatoria_id: string;
  titulo: string;
  tipo: string;
  archivo_storage: string;
};

type MeritProcess = {
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

export type MeritBatchResult = {
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

export class MeritBatchServiceError extends Error {
  status: number;
  processId?: string;

  constructor(message: string, status = 500, processId?: string) {
    super(message);
    this.name = "MeritBatchServiceError";
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

async function loadListado(listadoId: string): Promise<MeritListado> {
  const { data, error } = await supabaseAdmin
    .from("listados")
    .select("id,convocatoria_id,titulo,tipo,archivo_storage")
    .eq("id", listadoId)
    .maybeSingle();

  if (error) {
    throw new MeritBatchServiceError(
      `No se pudo cargar el listado: ${error.message}`
    );
  }
  if (!data?.archivo_storage) {
    throw new MeritBatchServiceError("Listado o archivo PDF no encontrado.", 404);
  }
  if (!MERIT_SOURCE_TYPES.includes(data.tipo as (typeof MERIT_SOURCE_TYPES)[number])) {
    throw new MeritBatchServiceError(
      "El procesamiento reanudable solo admite baremo_meritos o bolsa_empleo.",
      422
    );
  }

  return data as unknown as MeritListado;
}

async function loadProcess(listadoId: string): Promise<MeritProcess | null> {
  const { data, error } = await supabaseAdmin
    .from("procesos_ia")
    .select(PROCESS_COLUMNS)
    .eq("listado_id", listadoId)
    .eq("modelo_ia", MERIT_BATCH_MODEL)
    .eq("reanudable", true)
    .maybeSingle();

  if (error) {
    throw new MeritBatchServiceError(
      `No se pudo consultar el progreso: ${error.message}`
    );
  }

  return data as unknown as MeritProcess | null;
}

async function createProcess(listado: MeritListado, now: string) {
  const { data, error } = await supabaseAdmin
    .from("procesos_ia")
    .insert({
      listado_id: listado.id,
      tipo: "extraccion",
      estado: "ejecutando",
      progreso: 0,
      modelo_ia: MERIT_BATCH_MODEL,
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
        fase: "preparacion_lote",
        documento: listado.titulo,
        lote_solicitado_at: now,
      },
    })
    .select(PROCESS_COLUMNS)
    .single();

  if (error?.code === "23505") {
    throw new MeritBatchServiceError(
      "Este listado ya tiene otro lote en ejecución.",
      409
    );
  }
  if (error || !data) {
    throw new MeritBatchServiceError(
      `No se pudo crear el proceso reanudable: ${error?.message ?? "respuesta vacía"}`
    );
  }

  return data as unknown as MeritProcess;
}

async function claimExistingProcess(process: MeritProcess, now: string) {
  if (process.estado === "ejecutando" && !isStale(process.inicio_at)) {
    throw new MeritBatchServiceError(
      "Este listado ya tiene otro lote en ejecución.",
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
        fase: "preparacion_lote",
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
    throw new MeritBatchServiceError(
      `No se pudo bloquear el siguiente lote: ${error.message}`,
      500,
      process.id
    );
  }
  if (!data) {
    throw new MeritBatchServiceError(
      "Otro proceso se adelantó y ya está ejecutando este listado.",
      409,
      process.id
    );
  }

  return data as unknown as MeritProcess;
}

async function claimProcess(listado: MeritListado) {
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
    .from("fuentes_meritos")
    .select("id", { count: "exact", head: true })
    .eq("listado_id", listadoId);

  if (error) {
    throw new MeritBatchServiceError(
      `No se pudo contar lo ya extraído: ${error.message}`
    );
  }

  return count ?? 0;
}

async function saveRecords(
  listado: MeritListado,
  records: ReturnType<typeof parseMeritSourcePages>["records"]
) {
  for (let start = 0; start < records.length; start += UPSERT_SIZE) {
    const rows = records.slice(start, start + UPSERT_SIZE).map((record) => ({
      listado_id: listado.id,
      convocatoria_id: listado.convocatoria_id,
      ...record,
    }));
    const { error } = await supabaseAdmin
      .from("fuentes_meritos")
      .upsert(rows, { onConflict: "listado_id,numero_pagina,numero_fila" });

    if (error) {
      throw new MeritBatchServiceError(
        `No se pudo guardar el lote de méritos: ${error.message}`
      );
    }
  }
}

async function markProcessError(
  listadoId: string,
  process: MeritProcess,
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
          fase: "error_lote",
          lote_fallido: {
            pagina_inicio: attemptedStart,
            pagina_fin: attemptedEnd,
            error: message,
            fallido_at: finishedAt,
          },
        },
      })
      .eq("id", process.id)
      .eq("estado", "ejecutando"),
    supabaseAdmin
      .from("listados")
      .update({
        estado_procesamiento: "error",
        error_procesamiento: message,
      })
      .eq("id", listadoId),
  ]);
}

function completedResult(process: MeritProcess): MeritBatchResult {
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

export async function processNextMeritBatch(
  listadoId: string
): Promise<MeritBatchResult> {
  const listado = await loadListado(listadoId);
  const claim = await claimProcess(listado);

  if (claim.alreadyCompleted) return completedResult(claim.process);

  const process = claim.process;
  const currentPage = asNonNegativeInteger(process.pagina_actual);
  const knownTotalPages = asNonNegativeInteger(process.total_paginas);
  const startPage = currentPage + 1;
  const attemptedEnd =
    knownTotalPages > 0
      ? Math.min(knownTotalPages, startPage + MERIT_BATCH_SIZE - 1)
      : startPage + MERIT_BATCH_SIZE - 1;
  let failedEndPage = attemptedEnd;
  let detectedTotalPages = knownTotalPages || null;

  try {
    const { error: startingError } = await supabaseAdmin
      .from("listados")
      .update({ estado_procesamiento: "procesando", error_procesamiento: null })
      .eq("id", listado.id);

    if (startingError) {
      throw new MeritBatchServiceError(
        `No se pudo marcar el listado como procesando: ${startingError.message}`,
        500,
        process.id
      );
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(listado.archivo_storage, 10 * 60);

    if (signedError || !signed?.signedUrl) {
      throw new MeritBatchServiceError(
        `No se pudo autorizar la lectura del PDF: ${signedError?.message ?? "URL vacía"}`
      );
    }

    const extracted = await extractPdfPageBatch(
      signed.signedUrl,
      startPage,
      attemptedEnd
    );
    detectedTotalPages = extracted.totalPages;
    failedEndPage = extracted.pages.at(-1)?.pageNumber ?? attemptedEnd;

    if (
      knownTotalPages > 0 &&
      extracted.totalPages !== knownTotalPages
    ) {
      throw new MeritBatchServiceError(
        "El número de páginas ha cambiado desde el lote anterior. Reinicia el proceso antes de continuar.",
        409,
        process.id
      );
    }
    if (extracted.characters === 0) {
      throw new MeritBatchServiceError(
        "El lote no contiene texto extraíble. El PDF puede necesitar OCR.",
        422,
        process.id
      );
    }

    const parsed = parseMeritSourcePages(extracted.pages);
    if (parsed.records.length === 0) {
      throw new MeritBatchServiceError(
        "Se extrajo texto, pero no se reconoció ninguna fila del formato de bolsa. No se avanza para evitar perder páginas.",
        422,
        process.id
      );
    }

    await saveRecords(listado, parsed.records);
    const totalRecords = await countImportedRecords(listado.id);
    const endPage = extracted.pages.at(-1)?.pageNumber ?? startPage;
    const completed = endPage >= extracted.totalPages;
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
      throw new MeritBatchServiceError(
        `El lote se guardó, pero no se pudo actualizar el listado: ${listadoUpdateError.message}`,
        500,
        process.id
      );
    }

    const { error: processUpdateError } = await supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: completed ? "completado" : "pendiente",
        progreso: progress,
        fin_at: completed ? finishedAt : null,
        error: null,
        pagina_inicio: startPage,
        pagina_fin: endPage,
        pagina_actual: endPage,
        total_paginas: extracted.totalPages,
        total_registros: totalRecords,
        lotes_completados: completedBatches,
        ultimo_error: null,
        reanudable: true,
        detalles: {
          ...details,
          fase: completed ? "completado" : "lote_completado",
          formato: parsed.format,
          bytes_documento: extracted.sourceBytes,
          ultimo_lote: {
            pagina_inicio: startPage,
            pagina_fin: endPage,
            paginas: parsed.pagesAnalyzed,
            lineas: parsed.linesAnalyzed,
            registros: parsed.records.length,
            filas_dudosas: parsed.doubtfulRows,
            advertencias: parsed.warnings.length,
            muestra_advertencias: parsed.warnings.slice(0, 20),
            completado_at: finishedAt,
          },
        },
      })
      .eq("id", process.id)
      .eq("estado", "ejecutando");

    if (processUpdateError) {
      throw new MeritBatchServiceError(
        `Los datos se guardaron, pero no se pudo registrar el progreso: ${processUpdateError.message}`,
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
    const serviceError =
      error instanceof MeritBatchServiceError
        ? error
        : new MeritBatchServiceError(
            error instanceof Error ? error.message : "Error desconocido durante el lote.",
            500,
            process.id
          );

    await markProcessError(
      listado.id,
      process,
      serviceError.message,
      startPage,
      failedEndPage,
      detectedTotalPages
    );
    serviceError.processId = process.id;
    throw serviceError;
  }
}

export async function resetMeritProcess(listadoId: string) {
  const listado = await loadListado(listadoId);
  const process = await loadProcess(listadoId);
  const totalRecords = await countImportedRecords(listadoId);
  const resetAt = new Date().toISOString();

  if (process?.estado === "ejecutando" && !isStale(process.inicio_at)) {
    throw new MeritBatchServiceError(
      "No se puede reiniciar mientras hay un lote en ejecución.",
      409,
      process.id
    );
  }

  if (!process) {
    const { data, error } = await supabaseAdmin
      .from("procesos_ia")
      .insert({
        listado_id: listado.id,
        tipo: "extraccion",
        estado: "pendiente",
        progreso: 0,
        modelo_ia: MERIT_BATCH_MODEL,
        inicio_at: resetAt,
        fin_at: null,
        error: null,
        pagina_inicio: null,
        pagina_fin: null,
        pagina_actual: 0,
        total_paginas: null,
        total_registros: totalRecords,
        lotes_completados: 0,
        ultimo_error: null,
        reanudable: true,
        detalles: { fase: "reiniciado", reiniciado_at: resetAt, datos_borrados: false },
      })
      .select(PROCESS_COLUMNS)
      .single();

    if (error || !data) {
      const status = error?.code === "23505" ? 409 : 500;
      throw new MeritBatchServiceError(
        error?.code === "23505"
          ? "Otro proceso ha empezado antes de completar el reinicio."
          : `No se pudo crear el progreso reiniciado: ${error?.message ?? "respuesta vacía"}`,
        status
      );
    }
  } else {
    let query = supabaseAdmin
      .from("procesos_ia")
      .update({
        estado: "pendiente",
        progreso: 0,
        inicio_at: resetAt,
        fin_at: null,
        error: null,
        pagina_inicio: null,
        pagina_fin: null,
        pagina_actual: 0,
        total_registros: totalRecords,
        lotes_completados: 0,
        ultimo_error: null,
        reanudable: true,
        detalles: {
          ...toObject(process.detalles),
          fase: "reiniciado",
          reiniciado_at: resetAt,
          datos_borrados: false,
        },
      })
      .eq("id", process.id)
      .eq("estado", process.estado);

    if (process.estado === "ejecutando") {
      query = process.inicio_at
        ? query.eq("inicio_at", process.inicio_at)
        : query.is("inicio_at", null);
    }

    const { data, error } = await query.select("id").maybeSingle();
    if (error || !data) {
      throw new MeritBatchServiceError(
        error
          ? `No se pudo reiniciar el progreso: ${error.message}`
          : "Otro lote cambió el progreso antes de completar el reinicio.",
        error ? 500 : 409,
        process.id
      );
    }
  }

  const { error: listadoError } = await supabaseAdmin
    .from("listados")
    .update({
      estado_procesamiento: "pendiente",
      total_registros: totalRecords,
      error_procesamiento: null,
    })
    .eq("id", listadoId);

  if (listadoError) {
    throw new MeritBatchServiceError(
      `El progreso se reinició, pero no se pudo actualizar el listado: ${listadoError.message}`
    );
  }

  return {
    totalRecords,
    dataDeleted: false,
    message:
      "Progreso reiniciado. Los registros ya extraídos se conservan y se actualizarán mediante upsert.",
  };
}
