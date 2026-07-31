import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

type ConvocatoriaInput = {
  id?: string;
  nombre?: string;
  organismo?: string;
  categoria?: string;
  comunidad_autonoma?: string;
  estado?: string;
  fecha_convocatoria?: string | null;
};

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInput(body: ConvocatoriaInput) {
  return {
    nombre: cleanText(body.nombre),
    organismo: cleanText(body.organismo),
    categoria: cleanText(body.categoria),
    comunidad_autonoma: cleanText(body.comunidad_autonoma),
    estado: cleanText(body.estado),
    fecha_convocatoria: cleanText(body.fecha_convocatoria) || null,
  };
}

function validateInput(input: ReturnType<typeof normalizeInput>) {
  if (
    !input.nombre ||
    !input.organismo ||
    !input.categoria ||
    !input.comunidad_autonoma ||
    !input.estado
  ) {
    return "Completa todos los campos obligatorios.";
  }

  if (input.fecha_convocatoria && !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_convocatoria)) {
    return "La fecha de convocatoria no tiene un formato válido.";
  }

  return null;
}

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .from("convocatorias")
    .select(
      "id,nombre,organismo,categoria,comunidad_autonoma,estado,fecha_convocatoria,fecha_actualizacion"
    )
    .order("fecha_convocatoria", { ascending: false, nullsFirst: false })
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error cargando convocatorias:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar las convocatorias.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, convocatorias: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let body: ConvocatoriaInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud no válida." }, { status: 400 });
  }

  const input = normalizeInput(body);
  const validationError = validateInput(input);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .from("convocatorias")
    .insert(input)
    .select(
      "id,nombre,organismo,categoria,comunidad_autonoma,estado,fecha_convocatoria,fecha_actualizacion"
    )
    .single();

  if (error) {
    console.error("Error creando convocatoria:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo crear la convocatoria.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, convocatoria: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let body: ConvocatoriaInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud no válida." }, { status: 400 });
  }

  const id = cleanText(body.id);
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta el identificador." }, { status: 400 });
  }

  const input = normalizeInput(body);
  const validationError = validateInput(input);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .from("convocatorias")
    .update(input)
    .eq("id", id)
    .select(
      "id,nombre,organismo,categoria,comunidad_autonoma,estado,fecha_convocatoria,fecha_actualizacion"
    )
    .single();

  if (error) {
    console.error("Error actualizando convocatoria:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar la convocatoria.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, convocatoria: data });
}

export async function DELETE(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const id = cleanText(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta el identificador." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .schema("baremia")
    .from("convocatorias")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error eliminando convocatoria:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo eliminar. Puede tener listados, candidatos u otros datos vinculados.",
        detalle: error.message,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
