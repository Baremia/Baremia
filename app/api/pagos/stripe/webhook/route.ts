import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import {
  encryptAccessCode,
  generateAccessCode,
} from "../../../../../lib/access-delivery-crypto";
import {
  stripeWebhookConfigured,
  verifyStripeWebhook,
} from "../../../../../lib/stripe-rest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StripeCheckoutSession = {
  id?: string;
  client_reference_id?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id?: string } | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: StripeCheckoutSession };
};

async function markEvent(
  eventId: string,
  state: "procesado" | "ignorado" | "error",
  error?: string
) {
  await supabaseAdmin
    .from("eventos_pago")
    .update({
      estado: state,
      error: error ?? null,
      procesado_at: state === "error" ? null : new Date().toISOString(),
    })
    .eq("proveedor", "stripe")
    .eq("evento_proveedor_id", eventId);
}

function paymentIntentId(session: StripeCheckoutSession) {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  if (
    session.payment_intent &&
    typeof session.payment_intent === "object" &&
    typeof session.payment_intent.id === "string"
  ) {
    return session.payment_intent.id;
  }
  return null;
}

export async function POST(request: NextRequest) {
  let eventId = "";

  try {
    if (!stripeWebhookConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Webhook de Stripe todavía no configurado." },
        { status: 503 }
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json(
        { ok: false, error: "Falta Stripe-Signature." },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    verifyStripeWebhook(rawBody, signature);

    const event = JSON.parse(rawBody) as StripeEvent;
    eventId = event.id?.trim() ?? "";
    const eventType = event.type?.trim() ?? "";
    if (!eventId || !eventType) {
      return NextResponse.json(
        { ok: false, error: "Evento de Stripe incompleto." },
        { status: 400 }
      );
    }

    const { data: existingEvent, error: existingError } = await supabaseAdmin
      .from("eventos_pago")
      .select("id,estado")
      .eq("proveedor", "stripe")
      .eq("evento_proveedor_id", eventId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existingEvent?.estado === "procesado" || existingEvent?.estado === "ignorado") {
      return NextResponse.json({ ok: true, duplicado: true });
    }

    if (!existingEvent) {
      const { error: insertError } = await supabaseAdmin.from("eventos_pago").insert({
        proveedor: "stripe",
        evento_proveedor_id: eventId,
        tipo_evento: eventType,
        estado: "pendiente",
      });
      if (insertError && insertError.code !== "23505") {
        throw new Error(insertError.message);
      }
    } else {
      await supabaseAdmin
        .from("eventos_pago")
        .update({ estado: "pendiente", error: null })
        .eq("id", existingEvent.id);
    }

    const relevant = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(eventType);

    if (!relevant) {
      await markEvent(eventId, "ignorado");
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const session = event.data?.object;
    if (!session?.id) throw new Error("La sesión de Checkout no contiene id.");

    if (session.payment_status !== "paid") {
      await markEvent(eventId, "ignorado");
      return NextResponse.json({ ok: true, pendiente_pago: true });
    }

    const candidatoId =
      session.client_reference_id?.trim() ||
      session.metadata?.candidato_id?.trim() ||
      "";
    const email =
      session.customer_details?.email?.trim() ||
      session.customer_email?.trim() ||
      "";
    const amountTotal = session.amount_total;
    const currency = session.currency?.toUpperCase() ?? "EUR";

    if (!candidatoId) throw new Error("Stripe no devolvió candidato_id.");
    if (!email) throw new Error("Stripe no devolvió correo del cliente.");
    if (!Number.isInteger(amountTotal) || (amountTotal ?? 0) <= 0) {
      throw new Error("Stripe no devolvió un importe válido.");
    }

    const accessCode = generateAccessCode();
    const encrypted = encryptAccessCode(accessCode);

    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("registrar_pago_confirmado_con_entrega", {
        p_candidato_id: candidatoId,
        p_proveedor: "stripe",
        p_referencia_proveedor: session.id,
        p_importe: Number(amountTotal) / 100,
        p_moneda: currency,
        p_codigo_acceso: accessCode,
        p_codigo_cifrado: encrypted.ciphertext,
        p_cifrado_iv: encrypted.iv,
        p_cifrado_auth_tag: encrypted.authTag,
        p_email_destino: email,
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntentId(session),
      });

    if (error) throw new Error(error.message);

    const result = Array.isArray(data) ? data[0] : data;
    await supabaseAdmin
      .from("eventos_pago")
      .update({
        estado: "procesado",
        referencia_pago: session.id,
        error: null,
        procesado_at: new Date().toISOString(),
      })
      .eq("proveedor", "stripe")
      .eq("evento_proveedor_id", eventId);

    return NextResponse.json({
      ok: true,
      pago_id: result?.pago_id ?? null,
      acceso_id: result?.acceso_id ?? null,
      ya_procesado: result?.ya_procesado ?? false,
      entrega: result?.ya_procesado ? "ya_existente" : "pendiente_email",
    });
  } catch (error) {
    console.error("Error procesando webhook de Stripe:", error);
    if (eventId) {
      await markEvent(
        eventId,
        "error",
        error instanceof Error ? error.message : "Error de webhook desconocido."
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error procesando Stripe.",
      },
      { status: 500 }
    );
  }
}
