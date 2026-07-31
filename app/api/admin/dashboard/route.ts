import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

type MetricKey =
  | "convocatorias"
  | "candidatos"
  | "listados"
  | "estimaciones"
  | "pagos"
  | "procesos_ia";

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  date: string | null;
};

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

async function countRows(table: MetricKey) {
  const { count, error } = await supabaseAdmin
    .schema("baremia")
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`No se pudo contar ${table}:`, error);
    return null;
  }

  return count ?? 0;
}

async function getRecentActivity(): Promise<ActivityItem[]> {
  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .from("convocatorias")
    .select("id,nombre,estado,fecha_actualizacion")
    .order("fecha_actualizacion", { ascending: false, nullsFirst: false })
    .limit(6);

  if (error) {
    console.error("No se pudo cargar la actividad reciente:", error);
    return [];
  }

  return (data ?? []).map((item) => ({
    id: `convocatoria-${item.id}`,
    title: item.nombre || "Convocatoria actualizada",
    detail: `Convocatoria · Estado: ${item.estado || "sin definir"}`,
    date: item.fecha_actualizacion ?? null,
  }));
}

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  const [
    convocatorias,
    candidatos,
    listados,
    estimaciones,
    pagos,
    procesosIa,
    actividad,
  ] = await Promise.all([
    countRows("convocatorias"),
    countRows("candidatos"),
    countRows("listados"),
    countRows("estimaciones"),
    countRows("pagos"),
    countRows("procesos_ia"),
    getRecentActivity(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      metrics: {
        convocatorias,
        candidatos,
        listados,
        estimaciones,
        pagos,
        procesosIa,
      },
      actividad,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
