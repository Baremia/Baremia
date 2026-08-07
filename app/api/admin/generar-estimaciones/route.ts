import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MADRID_ENFERMERIA_ID = "15b496e6-f85e-403e-9270-0f3fb4d43bfc";

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

  const [
    { data: convocatorias, error: convocatoriasError },
    { count: estimacionesCount, error: estimacionesError },
    { count: exactosCount, error: exactosError },
    { count: aproximadosCount, error: aproximadosError },
    { count: candidatosCount, error: candidatosError },
    { count: fuentesCount, error: fuentesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("convocatorias")
      .select("id,nombre,estado")
      .order("nombre", { ascending: true }),
    supabaseAdmin
      .from("estimaciones")
      .select("id", { count: "exact", head: true })
      .eq("metodologia_version", "madrid-enfermeria-v1"),
    supabaseAdmin
      .from("cruces_fuentes_meritos")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", MADRID_ENFERMERIA_ID)
      .eq("metodo", "nombre_exacto_dni_enmascarado"),
    supabaseAdmin
      .from("cruces_fuentes_meritos")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", MADRID_ENFERMERIA_ID)
      .eq("metodo", "nombre_aproximado_dni_enmascarado"),
    supabaseAdmin
      .from("candidatos")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", MADRID_ENFERMERIA_ID),
    supabaseAdmin
      .from("fuentes_meritos")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", MADRID_ENFERMERIA_ID),
  ]);

  const error =
    convocatoriasError ??
    estimacionesError ??
    exactosError ??
    aproximadosError ??
    candidatosError ??
    fuentesError;

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo cargar el estado del motor.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }

  const candidatos = candidatosCount ?? 0;
  const exactos = exactosCount ?? 0;
  const aproximados = aproximadosCount ?? 0;
  const cruces = exactos + aproximados;
  const cobertura = candidatos > 0 ? Number(((cruces / candidatos) * 100).toFixed(2)) : 0;

  return NextResponse.json({
    ok: true,
    convocatorias: convocatorias ?? [],
    estimaciones_v1: estimacionesCount ?? 0,
    cobertura: {
      candidatos,
      fuentes_meritos: fuentesCount ?? 0,
      coincidencias_directas: cruces,
      coincidencias_exactas: exactos,
      coincidencias_aproximadas: aproximados,
      sin_coincidencia: Math.max(candidatos - cruces, 0),
      porcentaje: cobertura,
      cruce_version: 2,
    },
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
