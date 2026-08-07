import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import {
  HISTORICAL_EXTERNAL_MODEL,
  HistoricalExternalError,
  processNextHistoricalExternalBatch,
} from "../../../../lib/historical-external-batch-service";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MADRID_ENFERMERIA_ID = "15b496e6-f85e-403e-9270-0f3fb4d43bfc";
const SOURCE_URL =
  "https://www.comunidad.madrid/docs/assets/2022/09/29/rrhh-ope-enfermeroa-2022-09-29-listado_concurso_alfabetico.pdf";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  try {
    const { data: fuente, error: fuenteError } = await supabaseAdmin
      .from("listados")
      .select(
        "id,titulo,tipo,fecha_publicacion,fuente_url,estado_procesamiento,total_registros,procesado_at,error_procesamiento"
      )
      .eq("convocatoria_id", MADRID_ENFERMERIA_ID)
      .eq("tipo", "calibracion_historica")
      .eq("fuente_url", SOURCE_URL)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fuenteError) throw fuenteError;

    let proceso = null;
    if (fuente?.id) {
      const { data, error } = await supabaseAdmin
        .from("procesos_ia")
        .select(
          "id,estado,progreso,pagina_actual,total_paginas,total_registros,lotes_completados,ultimo_error,detalles"
        )
        .eq("listado_id", fuente.id)
        .eq("modelo_ia", HISTORICAL_EXTERNAL_MODEL)
        .eq("reanudable", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      proceso = data ?? null;
    }

    return NextResponse.json(
      {
        ok: true,
        fuente: fuente ?? null,
        proceso,
        esperado: 19_136,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo consultar la calibración histórica.",
        detalle: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Solicitud no válida." },
      { status: 400 }
    );
  }

  const listadoId =
    typeof body.listado_id === "string" ? body.listado_id.trim() : "";
  if (!listadoId) {
    return NextResponse.json(
      { ok: false, error: "Falta el identificador de la fuente histórica." },
      { status: 400 }
    );
  }

  try {
    const result = await processNextHistoricalExternalBatch(listadoId);
    return NextResponse.json(
      {
        ok: true,
        completado: result.completed,
        ya_completado: result.alreadyCompleted,
        proceso_id: result.processId,
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
    if (error instanceof HistoricalExternalError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          ...(error.processId ? { proceso_id: error.processId } : {}),
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo procesar la calibración histórica.",
        detalle: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
