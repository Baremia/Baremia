import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { deliverAccessByPaymentId } from "../../../../lib/access-delivery-service";
import { resendConfigured } from "../../../../lib/resend-rest";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  try {
    const { data: pagos, error: pagosError } = await supabaseAdmin
      .from("pagos")
      .select(
        "id,candidato_id,acceso_id,proveedor,referencia_proveedor,estado,importe,moneda,fecha_pago,fecha_reembolso,email_cliente,checkout_session_id,payment_intent_id,created_at,updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (pagosError) throw new Error(pagosError.message);

    const paymentRows = pagos ?? [];
    const candidateIds = [...new Set(paymentRows.map((item) => item.candidato_id))];
    const paymentIds = paymentRows.map((item) => item.id);

    const [candidateResult, deliveryResult, paymentCount, paidCount, refundCount, deliveryErrorCount] =
      await Promise.all([
        candidateIds.length
          ? supabaseAdmin
              .from("candidatos")
              .select("id,nombre,dni")
              .in("id", candidateIds)
          : Promise.resolve({ data: [], error: null }),
        paymentIds.length
          ? supabaseAdmin
              .from("entregas_acceso")
              .select(
                "id,pago_id,estado,email_destino,proveedor_email,referencia_email,intentos,ultimo_error,ultimo_intento_at,enviado_at,created_at,updated_at"
              )
              .in("pago_id", paymentIds)
          : Promise.resolve({ data: [], error: null }),
        supabaseAdmin.from("pagos").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("pagos")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pagado"),
        supabaseAdmin
          .from("pagos")
          .select("id", { count: "exact", head: true })
          .eq("estado", "reembolsado"),
        supabaseAdmin
          .from("entregas_acceso")
          .select("id", { count: "exact", head: true })
          .eq("estado", "error"),
      ]);

    if (candidateResult.error) throw new Error(candidateResult.error.message);
    if (deliveryResult.error) throw new Error(deliveryResult.error.message);

    const candidates = new Map(
      (candidateResult.data ?? []).map((item) => [item.id, item])
    );
    const deliveries = new Map(
      (deliveryResult.data ?? []).map((item) => [item.pago_id, item])
    );

    return NextResponse.json(
      {
        ok: true,
        configuracion: {
          resend: resendConfigured(),
          stripe_checkout: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
          stripe_webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
          precio: process.env.BAREMIA_PRICE_CENTS?.trim() ?? null,
        },
        resumen: {
          total_pagos: paymentCount.count ?? 0,
          pagados: paidCount.count ?? 0,
          reembolsados: refundCount.count ?? 0,
          entregas_error: deliveryErrorCount.count ?? 0,
        },
        pagos: paymentRows.map((payment) => ({
          ...payment,
          candidato: candidates.get(payment.candidato_id) ?? null,
          entrega: deliveries.get(payment.id) ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudieron cargar los pagos.",
        detalle: error instanceof Error ? error.message : "Error desconocido.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "La solicitud no contiene un JSON válido." },
      { status: 400 }
    );
  }

  const action = clean(body.action);
  const paymentId = clean(body.pago_id);

  if (action !== "reintentar_entrega") {
    return NextResponse.json(
      { ok: false, error: "Acción no válida." },
      { status: 400 }
    );
  }
  if (!UUID_PATTERN.test(paymentId)) {
    return NextResponse.json(
      { ok: false, error: "El pago indicado no es válido." },
      { status: 400 }
    );
  }
  if (!resendConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Resend todavía no está configurado." },
      { status: 503 }
    );
  }

  try {
    const delivery = await deliverAccessByPaymentId(paymentId);
    return NextResponse.json({
      ok: true,
      entrega: delivery,
      mensaje: delivery.alreadySent
        ? "El correo ya constaba como enviado."
        : "Correo de acceso enviado correctamente.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo reenviar el acceso.",
        detalle: error instanceof Error ? error.message : "Error desconocido.",
      },
      { status: 500 }
    );
  }
}
