import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

type Body = {
  candidato_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json();

    if (!body.candidato_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta candidato_id",
        },
        { status: 400 }
      );
    }

    const referencia =
      "DEV-" +
      Date.now().toString() +
      "-" +
      Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("registrar_pago_confirmado", {
        p_candidato_id: body.candidato_id,
        p_proveedor: "dev",
        p_referencia_proveedor: referencia,
        p_importe: 1.99,
        p_moneda: "EUR",
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
      pago_id: resultado?.pago_id,
      acceso_id: resultado?.acceso_id,
      codigo_acceso: resultado?.codigo_acceso,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno",
      },
      { status: 500 }
    );
  }
}
