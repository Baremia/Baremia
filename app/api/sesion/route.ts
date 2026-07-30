import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

type Body = {
  acceso_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json();

    if (!body.acceso_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta acceso_id",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("crear_sesion", {
        p_acceso_id: body.acceso_id,
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

    const sesion = Array.isArray(data) ? data[0] : data;

    if (!sesion?.token) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo generar la sesión",
        },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      expira_at: sesion.expira_at,
    });

    response.cookies.set({
      name: "baremia_session",
      value: sesion.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(sesion.expira_at),
    });

    return response;
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
