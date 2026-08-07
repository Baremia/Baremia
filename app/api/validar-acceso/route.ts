import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_GRANT_COOKIE,
  createAccessSessionGrant,
} from "../../../lib/access-session-grant";
import { consumeRequestLimit } from "../../../lib/request-rate-limit";
import { supabaseAdmin } from "../../../lib/supabase-admin";

type Body = {
  candidato_id?: string;
  codigo?: string;
};

export async function POST(request: NextRequest) {
  try {
    const limit = await consumeRequestLimit(request, {
      namespace: "validar-acceso",
      limit: 30,
      windowSeconds: 10 * 60,
      blockSeconds: 30 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Demasiados intentos de acceso. Inténtalo más tarde." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, limit.retryAfter)) },
        }
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "La solicitud no contiene un JSON válido." },
        { status: 400 }
      );
    }

    if (!body.candidato_id || !body.codigo) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan datos",
        },
        { status: 400 }
      );
    }

    if (body.codigo.length > 64) {
      return NextResponse.json(
        { ok: false, error: "Código no válido." },
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
          error: "No se pudo validar el acceso.",
        },
        { status: 500 }
      );
    }

    const resultado = Array.isArray(data) ? data[0] : data;
    const response = NextResponse.json({
      ok: true,
      autenticado: resultado?.autenticado,
      acceso_id: resultado?.acceso_id,
      mensaje: resultado?.mensaje,
    });

    if (resultado?.autenticado && resultado?.acceso_id) {
      const grant = createAccessSessionGrant(resultado.acceso_id);
      response.cookies.set({
        name: ACCESS_GRANT_COOKIE,
        value: grant.token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: grant.maxAge,
      });
    }

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
