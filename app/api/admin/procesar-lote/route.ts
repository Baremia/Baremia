import { NextRequest, NextResponse } from "next/server";
import { jsonError, isUuid, unauthorizedJson, unknownErrorMessage } from "../../../../lib/admin-api";
import { hasAdminSession } from "../../../../lib/admin-auth";
import {
  MeritBatchServiceError,
  processNextMeritBatch,
} from "../../../../lib/merit-batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!(await hasAdminSession())) return unauthorizedJson();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("La petición no contiene un JSON válido.", 400);
    }

    const listadoId =
      body &&
      typeof body === "object" &&
      "listado_id" in body &&
      typeof body.listado_id === "string"
        ? body.listado_id.trim()
        : "";

    if (!isUuid(listadoId)) {
      return jsonError("El identificador del listado no es un UUID válido.", 400);
    }

    const result = await processNextMeritBatch(listadoId);

    return NextResponse.json(
      {
        ok: true,
        proceso_id: result.processId,
        completado: result.completed,
        ya_completado: result.alreadyCompleted,
        lote: {
          pagina_inicio: result.startPage,
          pagina_fin: result.endPage,
          registros_extraidos: result.recordsInBatch,
          filas_dudosas: result.doubtfulRowsInBatch,
          advertencias: result.warningsInBatch,
        },
        progreso: {
          pagina_actual: result.currentPage,
          total_paginas: result.totalPages,
          porcentaje: result.progress,
          total_registros: result.totalRecords,
          lotes_completados: result.completedBatches,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof MeritBatchServiceError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          ...(error.processId ? { proceso_id: error.processId } : {}),
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    return jsonError(
      "No se pudo procesar el siguiente lote.",
      500,
      unknownErrorMessage(error)
    );
  }
}
