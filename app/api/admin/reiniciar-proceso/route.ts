import { NextRequest, NextResponse } from "next/server";
import { jsonError, isUuid, unauthorizedJson, unknownErrorMessage } from "../../../../lib/admin-api";
import { hasAdminSession } from "../../../../lib/admin-auth";
import {
  MeritBatchServiceError,
  resetMeritProcess,
} from "../../../../lib/merit-batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const result = await resetMeritProcess(listadoId);

    return NextResponse.json(
      {
        ok: true,
        mensaje: result.message,
        datos_borrados: result.dataDeleted,
        total_registros_conservados: result.totalRecords,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof MeritBatchServiceError) {
      return jsonError(error.message, error.status);
    }

    return jsonError(
      "No se pudo reiniciar el proceso.",
      500,
      unknownErrorMessage(error)
    );
  }
}
