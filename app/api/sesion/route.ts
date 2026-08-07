import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_GRANT_COOKIE,
  verifyAccessSessionGrant,
} from "../../../lib/access-session-grant";
import { supabaseAdmin } from "../../../lib/supabase-admin";

type Body = {
  acceso_id?: string;
};

function clearGrant(response: NextResponse) {
  response.cookies.set({
    name: ACCESS_GRANT_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "La solicitud no contiene un JSON válido." },
        { status: 400 }
      );
    }

    const accessId = body.acceso_id?.trim() ?? "";
    if (!accessId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta acceso_id",
        },
        { status: 400 }
      );
    }

    const grant = request.cookies.get(ACCESS_GRANT_COOKIE)?.value;
    if (!verifyAccessSessionGrant(grant, accessId)) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "Debes validar de nuevo tu código de acceso.",
        },
        { status: 401 }
      );
      clearGrant(response);
      return response;
    }

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("crear_sesion", {
        p_acceso_id: accessId,
      });

    if (error) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "No se pudo generar la sesión.",
        },
        { status: 500 }
      );
      clearGrant(response);
      return response;
    }

    const sesion = Array.isArray(data) ? data[0] : data;

    if (!sesion?.token) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "No se pudo generar la sesión",
        },
        { status: 500 }
      );
      clearGrant(response);
      return response;
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
    clearGrant(response);

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
