import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim() ?? "";
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json(
      { ok: false, error: "Referencia de pago no válida." },
      { status: 400 }
    );
  }

  try {
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("pagos")
      .select("id,estado")
      .eq("checkout_session_id", sessionId)
      .maybeSingle();

    if (paymentError) throw new Error(paymentError.message);
    if (!payment) {
      return NextResponse.json(
        { ok: true, estado: "procesando", correo: "pendiente" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("entregas_acceso")
      .select("estado")
      .eq("pago_id", payment.id)
      .maybeSingle();

    if (deliveryError) throw new Error(deliveryError.message);

    return NextResponse.json(
      {
        ok: true,
        estado: payment.estado === "pagado" ? "confirmado" : payment.estado,
        correo:
          delivery?.estado === "enviado"
            ? "enviado"
            : delivery?.estado === "error"
              ? "incidencia"
              : "pendiente",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error consultando estado de pago:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo comprobar el estado del pago." },
      { status: 500 }
    );
  }
}
