import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const search = clean(request.nextUrl.searchParams.get("q"));
  if (search.length < 2) {
    return NextResponse.json({ ok: true, usuarios: [] });
  }

  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .rpc("buscar_accesos_admin", {
      p_busqueda: search,
      p_limite: 30,
    });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudieron buscar usuarios y accesos.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, usuarios: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "La solicitud no contiene un JSON válido." },
      { status: 400 }
    );
  }

  const action = clean(body.action);
  const candidatoId = clean(body.candidato_id);

  if (action !== "regenerar_codigo") {
    return NextResponse.json(
      { ok: false, error: "Acción no válida." },
      { status: 400 }
    );
  }

  if (!UUID_PATTERN.test(candidatoId)) {
    return NextResponse.json(
      { ok: false, error: "El candidato indicado no es válido." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .rpc("regenerar_codigo_acceso_admin", {
      p_candidato_id: candidatoId,
    });

  if (error) {
    const status = error.message.includes("no dispone de un acceso") ? 409 : 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 409
            ? "No se puede regenerar el código de este candidato."
            : "No se pudo regenerar el código.",
        detalle: error.message,
      },
      { status }
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.codigo_acceso) {
    return NextResponse.json(
      { ok: false, error: "El servidor no devolvió el nuevo código." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    acceso_id: result.acceso_id,
    codigo_acceso: result.codigo_acceso,
    mensaje:
      "Código regenerado. El código anterior y las sesiones abiertas han quedado invalidados.",
  });
}
