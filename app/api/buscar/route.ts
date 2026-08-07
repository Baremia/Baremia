import { NextRequest, NextResponse } from "next/server";
import { consumeRequestLimit } from "../../../lib/request-rate-limit";
import { supabaseAdmin } from "../../../lib/supabase-admin";

type BuscarBody = {
  convocatoria_id?: string;
  busqueda?: string;
};

export async function POST(request: NextRequest) {
  try {
    const limit = await consumeRequestLimit(request, {
      namespace: "buscar-candidato",
      limit: 60,
      windowSeconds: 60,
      blockSeconds: 300,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Demasiadas búsquedas seguidas. Inténtalo de nuevo en unos minutos." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, limit.retryAfter)) },
        }
      );
    }

    let body: BuscarBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "El cuerpo de la petición no es un JSON válido",
        },
        { status: 400 }
      );
    }

    const convocatoriaId = body.convocatoria_id?.trim();
    const busqueda = body.busqueda?.trim();

    if (!convocatoriaId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta convocatoria_id",
        },
        { status: 400 }
      );
    }

    if (!busqueda || busqueda.length < 3) {
      return NextResponse.json(
        {
          ok: false,
          error: "Introduce al menos 3 caracteres para buscar",
        },
        { status: 400 }
      );
    }

    if (busqueda.length > 120) {
      return NextResponse.json(
        { ok: false, error: "La búsqueda es demasiado larga." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("buscar_candidato", {
        p_convocatoria_id: convocatoriaId,
        p_busqueda: busqueda,
      });

    if (error) {
      console.error("Error en buscar_candidato:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo realizar la búsqueda",
          detalle: error.message,
        },
        { status: 500 }
      );
    }

    const candidatos = Array.isArray(data) ? data : [];

    return NextResponse.json(
      {
        ok: true,
        encontrado: candidatos.length > 0,
        total: candidatos.length,
        candidatos,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error inesperado en /api/buscar:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
