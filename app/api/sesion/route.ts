import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const candidatoId = body.candidato_id;

    if (!candidatoId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta candidato_id",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("crear_sesion", {
        p_candidato_id: candidatoId,
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
      token: data,
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
