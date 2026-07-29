import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("convocatorias")
      .select(
        `
          id,
          nombre,
          organismo,
          categoria,
          comunidad_autonoma,
          estado,
          fecha_convocatoria,
          fecha_actualizacion
        `
      )
      .order("fecha_convocatoria", {
        ascending: false,
        nullsFirst: false,
      })
      .order("nombre", {
        ascending: true,
      });

    if (error) {
      console.error("Error consultando convocatorias:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudieron obtener las convocatorias",
          detalle: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        total: data?.length ?? 0,
        convocatorias: data ?? [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno del servidor",
      },
      {
        status: 500,
      }
    );
  }
}
