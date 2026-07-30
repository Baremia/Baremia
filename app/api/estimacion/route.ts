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

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("obtener_estimacion", {
        p_token: token,
      });

    if (error) {
      console.error("Error obteniendo estimación:", error);

      const sesionInvalida =
        error.message.includes("Sesión no válida") ||
        error.message.includes("sesión no válida");

      const response = NextResponse.json(
        {
          ok: false,
          error: sesionInvalida
            ? "La sesión ha caducado o no es válida"
            : "No se pudo obtener la estimación",
          detalle: error.message,
        },
        { status: sesionInvalida ? 401 : 500 }
      );

      if (sesionInvalida) {
        response.cookies.set({
          name: "baremia_session",
          value: "",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      }

      return response;
    }

    const estimacion = Array.isArray(data) ? data[0] : data;

    if (!estimacion) {
      return NextResponse.json({
        ok: true,
        encontrada: false,
        estimacion: null,
        mensaje: "Todavía no existe una estimación disponible",
      });
    }

    return NextResponse.json(
      {
        ok: true,
        encontrada: true,
        estimacion,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error inesperado en /api/estimacion:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
