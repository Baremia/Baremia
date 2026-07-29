import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

type CrearSesionBody = {
  acceso_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    let body: CrearSesionBody;

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

    const accesoId = body.acceso_id?.trim();

    if (!accesoId) {
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
        p_acceso_id: accesoId,
      });

    if (error) {
      console.error("Error creando sesión:", error);

      const accesoInvalido =
        error.message.includes("Acceso no válido") ||
        error.message.includes("bloqueado");

      return NextResponse.json(
        {
          ok: false,
          error: accesoInvalido
            ? "El acceso no es válido, está bloqueado o no está activo"
            : "No se pudo crear la sesión",
          detalle: error.message,
        },
        { status: accesoInvalido ? 403 : 500 }
      );
    }

    const sesion = Array.isArray(data) ? data[0] : data;

    if (!sesion?.token || !sesion?.expira_at) {
      return NextResponse.json(
        {
          ok: false,
          error: "La sesión no pudo generarse correctamente",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        sesion: {
          token: sesion.token,
          expira_at: sesion.expira_at,
        },
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error inesperado en /api/sesion:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
