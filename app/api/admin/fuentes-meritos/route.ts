import { NextRequest, NextResponse } from "next/server";
import { jsonError, isUuid, unauthorizedJson, unknownErrorMessage } from "../../../../lib/admin-api";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await hasAdminSession())) return unauthorizedJson();

    const listadoId = request.nextUrl.searchParams.get("listado_id")?.trim() ?? "";
    const rawLimit = request.nextUrl.searchParams.get("limit") ?? "20";
    const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);

    if (!isUuid(listadoId)) {
      return jsonError("El identificador del listado no es un UUID válido.", 400);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return jsonError("El límite debe ser un entero entre 1 y 100.", 400);
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
      return jsonError("El desplazamiento debe ser un entero válido.", 400);
    }

    const [recordsResult, summaryResult] = await Promise.all([
      supabaseAdmin
        .from("fuentes_meritos")
        .select(
          "id,dni_publicado,dni_normalizado,nombre_publicado,nombre_normalizado,centro_grabacion,cupo_discapacidad,puntuacion_formacion,puntuacion_experiencia,puntuacion_total,numero_pagina,numero_fila,datos_extra,created_at"
        )
        .eq("listado_id", listadoId)
        .order("numero_pagina", { ascending: true })
        .order("numero_fila", { ascending: true })
        .range(offset, offset + limit - 1),
      supabaseAdmin
        .from("fuentes_meritos_resumen")
        .select(
          "total,formacion_minima,formacion_maxima,formacion_media,experiencia_minima,experiencia_maxima,experiencia_media,puntuacion_total_minima,puntuacion_total_maxima,puntuacion_total_media,filas_con_advertencias"
        )
        .eq("listado_id", listadoId)
        .maybeSingle(),
    ]);

    if (recordsResult.error) {
      return jsonError(
        "No se pudo cargar la muestra de méritos.",
        500,
        recordsResult.error.message
      );
    }
    if (summaryResult.error) {
      return jsonError(
        "No se pudo calcular el resumen de méritos.",
        500,
        summaryResult.error.message
      );
    }

    const summary = summaryResult.data;
    const total = numeric(summary?.total) ?? 0;
    const records = recordsResult.data ?? [];
    const from = records.length > 0 ? offset + 1 : 0;
    const to = records.length > 0 ? offset + records.length : 0;

    return NextResponse.json(
      {
        ok: true,
        registros: records,
        resumen: {
          total,
          formacion: {
            minima: numeric(summary?.formacion_minima),
            maxima: numeric(summary?.formacion_maxima),
            media: numeric(summary?.formacion_media),
          },
          experiencia: {
            minima: numeric(summary?.experiencia_minima),
            maxima: numeric(summary?.experiencia_maxima),
            media: numeric(summary?.experiencia_media),
          },
          puntuacion_total: {
            minima: numeric(summary?.puntuacion_total_minima),
            maxima: numeric(summary?.puntuacion_total_maxima),
            media: numeric(summary?.puntuacion_total_media),
          },
          filas_con_advertencias:
            numeric(summary?.filas_con_advertencias) ?? 0,
        },
        paginacion: {
          offset,
          limit,
          from,
          to,
          hasPrevious: offset > 0,
          hasNext: to < total,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return jsonError(
      "No se pudo cargar la muestra de méritos.",
      500,
      unknownErrorMessage(error)
    );
  }
}
