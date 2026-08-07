import { NextRequest, NextResponse } from "next/server";
import { consumeRequestLimit } from "../../../../../lib/request-rate-limit";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import {
  createStripeCheckoutSession,
  stripeCheckoutConfigured,
} from "../../../../../lib/stripe-rest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  candidato_id?: string;
};

function configuredPriceCents() {
  const raw = process.env.BAREMIA_PRICE_CENTS?.trim();
  if (!raw) throw new Error("BAREMIA_PRICE_CENTS no está configurado.");
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 50 || parsed > 100_000) {
    throw new Error("BAREMIA_PRICE_CENTS no contiene un precio válido.");
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    const limit = await consumeRequestLimit(request, {
      namespace: "stripe-checkout",
      limit: 10,
      windowSeconds: 10 * 60,
      blockSeconds: 30 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Se han iniciado demasiados intentos de pago. Inténtalo más tarde." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, limit.retryAfter)) },
        }
      );
    }

    if (!stripeCheckoutConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Stripe todavía no está configurado." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as Body;
    const candidatoId = body.candidato_id?.trim();
    if (!candidatoId) {
      return NextResponse.json(
        { ok: false, error: "Falta candidato_id." },
        { status: 400 }
      );
    }

    const { data: candidato, error: candidatoError } = await supabaseAdmin
      .from("candidatos")
      .select("id")
      .eq("id", candidatoId)
      .maybeSingle();

    if (candidatoError) throw new Error(candidatoError.message);
    if (!candidato) {
      return NextResponse.json(
        { ok: false, error: "La candidatura no existe." },
        { status: 404 }
      );
    }

    const { data: pagoExistente, error: pagoError } = await supabaseAdmin
      .from("pagos")
      .select("id,acceso_id")
      .eq("candidato_id", candidatoId)
      .eq("estado", "pagado")
      .limit(1)
      .maybeSingle();

    if (pagoError) throw new Error(pagoError.message);
    if (pagoExistente) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta candidatura ya dispone de un acceso pagado.",
          acceso_id: pagoExistente.acceso_id,
        },
        { status: 409 }
      );
    }

    const amountCents = configuredPriceCents();
    const configuredOrigin = process.env.BAREMIA_PUBLIC_URL?.trim();
    const origin = configuredOrigin
      ? configuredOrigin.replace(/\/$/, "")
      : request.nextUrl.origin;

    const session = await createStripeCheckoutSession({
      candidatoId,
      amountCents,
      successUrl: `${origin}/pago/completado?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/?pago=cancelado`,
    });

    return NextResponse.json(
      { ok: true, checkout_session_id: session.id, url: session.url },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error creando Checkout de Stripe:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo iniciar el pago.",
      },
      { status: 500 }
    );
  }
}
