import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

type Body = {
  candidato_id?: string;
  codigo?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json();

    if (!body.candidato_id || !body.codigo) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan datos",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("validar_acceso", {
        p_candidato_id: body.candidato_id,
        p_codigo: body.codigo,
      });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const resultado = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      autenticado: resultado?.autenticado,
      acceso_id: resultado?.acceso_id,
      mensaje: resultado?.mensaje,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno",
      },
      { status: 500 }
    );
  }
}
