import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("baremia_session")?.value;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sesión no encontrada",
        },
        { status: 401 }
      );
    }

    const { data: sesion, error: errorSesion } = await supabaseAdmin
      .schema("baremia")
      .rpc("validar_sesion", {
        p_token: token,
      });

    if (errorSesion) {
      return NextResponse.json(
        {
          ok: false,
          error: errorSesion.message,
        },
        { status: 500 }
      );
    }

    const resultadoSesion = Array.isArray(sesion) ? sesion[0] : sesion;

    if (!resultadoSesion?.valida) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sesión no válida",
        },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("obtener_estimacion", {
        p_candidato_id: resultadoSesion.candidato_id,
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

    return NextResponse.json({
      ok: true,
      estimacion: Array.isArray(data) ? data[0] : data,
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
