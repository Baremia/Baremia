import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

function stripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new Error("STRIPE_SECRET_KEY no está configurada.");
  return value;
}

function stripeWebhookSecret() {
  const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!value) throw new Error("STRIPE_WEBHOOK_SECRET no está configurada.");
  return value;
}

export function stripeCheckoutConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function stripeWebhookConfigured() {
  return Boolean(
    process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
      process.env.BAREMIA_DELIVERY_ENCRYPTION_KEY?.trim()
  );
}

export async function createStripeCheckoutSession(input: {
  candidatoId: string;
  successUrl: string;
  cancelUrl: string;
  amountCents: number;
}) {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.candidatoId);
  body.set("metadata[candidato_id]", input.candidatoId);
  body.set("customer_creation", "always");
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "eur");
  body.set(
    "line_items[0][price_data][product_data][name]",
    "Consulta Baremia · OPE Enfermería Comunidad de Madrid"
  );
  body.set(
    "line_items[0][price_data][product_data][description]",
    "Acceso a la estimación y a sus futuras actualizaciones para esta candidatura."
  );
  body.set("line_items[0][price_data][unit_amount]", String(input.amountCents));

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      payload.error && typeof payload.error === "object" && "message" in payload.error
        ? String((payload.error as { message?: unknown }).message ?? "Error de Stripe")
        : "Stripe no pudo crear la sesión de pago.";
    throw new Error(message);
  }

  const id = typeof payload.id === "string" ? payload.id : null;
  const url = typeof payload.url === "string" ? payload.url : null;
  if (!id || !url) throw new Error("Stripe no devolvió una sesión de Checkout válida.");

  return { id, url };
}

function parseStripeSignature(header: string) {
  const timestamp = header
    .split(",")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === "t")?.[1];
  const signatures = header
    .split(",")
    .map((part) => part.trim().split("="))
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    throw new Error("Cabecera Stripe-Signature no válida.");
  }

  return { timestamp, signatures };
}

export function verifyStripeWebhook(rawBody: string, signatureHeader: string) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    throw new Error("Timestamp de Stripe no válido.");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
  if (age > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error("La firma del webhook de Stripe está fuera de la tolerancia temporal.");
  }

  const expected = createHmac("sha256", stripeWebhookSecret())
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  const valid = signatures.some((signature) => {
    const receivedBuffer = Buffer.from(signature, "utf8");
    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  });

  if (!valid) throw new Error("Firma de webhook de Stripe no válida.");
}
