import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  const [{ data: convocatorias, error: convocatoriasError }, { count, error: countError }] =
    await Promise.all([
      supabaseAdmin
        .from("convocatorias")
        .select("id,nombre,estado")
        .order("nombre", { ascending: true }),
      supabaseAdmin
        .from("estimaciones")
        .select("id", { count: "exact", head: true })
        .eq("metodologia_version", "madrid-enfermeria-v1"),
    ]);

  if (convocatoriasError || countError) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo cargar el estado del motor.",
        detalle: convocatoriasError?.message ?? countError?.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    convocatorias: convocatorias ?? [],
    estimaciones_v1: count ?? 0,
  });
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

  const convocatoriaId = clean(body.convocatoria_id);
  if (!convocatoriaId) {
    return NextResponse.json(
      { ok: false, error: "Selecciona una convocatoria." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .rpc("generar_estimaciones_v1", {
      p_convocatoria_id: convocatoriaId,
      p_plazas_general: 3133,
      p_plazas_discapacidad: 236,
    });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudieron generar las estimaciones.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    resultado: result,
    mensaje: `${result?.estimaciones_generadas ?? 0} estimaciones generadas. Coincidencias directas: ${result?.coincidencias_directas ?? 0}. Méritos imputados: ${result?.meritos_imputados ?? 0}.`,
  });
}
