import { NextRequest, NextResponse } from "next/server";
import { isUuid, jsonError, unauthorizedJson, unknownErrorMessage } from "../../../../lib/admin-api";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!(await hasAdminSession())) return unauthorizedJson();

    const listadoId = request.nextUrl.searchParams.get("listado_id")?.trim() ?? "";
    if (listadoId && !isUuid(listadoId)) {
      return jsonError("El identificador del listado no es un UUID válido.", 400);
    }

    let query = supabaseAdmin
      .from("procesos_ia")
      .select(
        "id,listado_id,tipo,estado,progreso,modelo_ia,inicio_at,fin_at,error,detalles,pagina_inicio,pagina_fin,pagina_actual,total_paginas,total_registros,lotes_completados,ultimo_error,reanudable,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (listadoId) query = query.eq("listado_id", listadoId);

    const [processResult, totalsResult] = await Promise.all([
      query,
      listadoId
        ? supabaseAdmin
            .from("fuentes_meritos_resumen")
            .select("listado_id,total")
            .eq("listado_id", listadoId)
        : supabaseAdmin
            .from("fuentes_meritos_resumen")
            .select("listado_id,total")
            .limit(100),
    ]);

    if (processResult.error) {
      return jsonError(
        "No se pudieron cargar los procesos.",
        500,
        processResult.error.message
      );
    }
    const realTotals = new Map(
      (totalsResult.data ?? []).map((item) => [item.listado_id, Number(item.total ?? 0)])
    );
    const processes = (processResult.data ?? []).map((item) => {
      const currentPage = Number(item.pagina_actual ?? 0);
      const totalPages = Number(item.total_paginas ?? 0);
      const resumableProgress =
        item.reanudable && totalPages > 0
          ? Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100)))
          : item.progreso;

      return {
        ...item,
        progreso: resumableProgress,
        total_registros: item.reanudable
          ? realTotals.get(item.listado_id) ?? Number(item.total_registros ?? 0)
          : item.total_registros,
        ultimo_error: item.ultimo_error ?? item.error,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        procesos: processes,
        ...(totalsResult.error
          ? { advertencia: "No se pudo refrescar el recuento real de fuentes de méritos." }
          : {}),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return jsonError(
      "No se pudieron cargar los procesos.",
      500,
      unknownErrorMessage(error)
    );
  }
}
