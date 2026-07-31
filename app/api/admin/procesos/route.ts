import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Sesión de administrador no válida." }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const listadoId = request.nextUrl.searchParams.get("listado_id")?.trim();
  let query = supabaseAdmin
    .schema("baremia")
    .from("procesos_ia")
    .select("id,listado_id,tipo,estado,progreso,modelo_ia,inicio_at,fin_at,error,detalles,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (listadoId) query = query.eq("listado_id", listadoId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los procesos.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, procesos: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
