const RESEND_EMAILS_API = "https://api.resend.com/emails";

function resendApiKey() {
  const value = process.env.RESEND_API_KEY?.trim();
  if (!value) throw new Error("RESEND_API_KEY no está configurada.");
  return value;
}

function sender() {
  const value = process.env.BAREMIA_EMAIL_FROM?.trim();
  if (!value) throw new Error("BAREMIA_EMAIL_FROM no está configurado.");
  return value;
}

function publicUrl() {
  return (process.env.BAREMIA_PUBLIC_URL?.trim() || "https://baremia.es").replace(
    /\/$/,
    ""
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function resendConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.BAREMIA_EMAIL_FROM?.trim()
  );
}

export async function sendAccessEmail(input: {
  deliveryId: string;
  to: string;
  accessCode: string;
}) {
  const code = escapeHtml(input.accessCode);
  const url = `${publicUrl()}/`;
  const replyTo = process.env.BAREMIA_SUPPORT_EMAIL?.trim();

  const text = [
    "Tu acceso a Baremia ya está disponible.",
    "",
    `Código de acceso: ${input.accessCode}`,
    "",
    "Este código está vinculado a tu candidatura y te permitirá consultar futuras actualizaciones de esta OPE.",
    `Consulta tu estimación: ${url}`,
    "",
    "Baremia es un servicio independiente. La estimación no constituye una clasificación oficial.",
    replyTo ? `Soporte: ${replyTo}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#172033;line-height:1.6">
      <div style="padding:26px 0 18px">
        <div style="display:inline-grid;place-items:center;width:46px;height:46px;border-radius:13px;background:#173b67;color:#fff;font-size:24px;font-weight:800">B</div>
        <h1 style="margin:16px 0 4px;font-size:26px">Tu acceso a Baremia ya está disponible</h1>
      </div>
      <p>Tu pago se ha confirmado correctamente.</p>
      <p style="margin-bottom:8px;font-weight:700">Código de acceso</p>
      <div style="padding:18px;border-radius:12px;background:#101828;color:#fff;font-family:monospace;font-size:20px;text-align:center;letter-spacing:.03em">${code}</div>
      <p>Guarda este código. Está vinculado a tu candidatura y te permitirá volver a consultar futuras actualizaciones de esta OPE.</p>
      <p style="margin:26px 0">
        <a href="${url}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#173b67;color:#fff;text-decoration:none;font-weight:700">Consultar mi estimación</a>
      </p>
      <div style="padding:16px;border-radius:12px;background:#f8fafc;color:#52647d;font-size:14px">
        Baremia es un servicio independiente. La posición y la probabilidad mostradas son estimaciones y no constituyen una clasificación oficial.
      </div>
      ${replyTo ? `<p style="color:#657084;font-size:14px">¿Necesitas ayuda? Responde a este correo o escribe a ${escapeHtml(replyTo)}.</p>` : ""}
    </div>
  `;

  const payload: Record<string, unknown> = {
    from: sender(),
    to: [input.to],
    subject: "Tu acceso a Baremia ya está disponible",
    html,
    text,
    tags: [{ name: "category", value: "access_code" }],
  };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch(RESEND_EMAILS_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `baremia-access/${input.deliveryId}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof data.message === "string"
        ? data.message
        : "Resend no pudo enviar el correo de acceso.";
    throw new Error(message);
  }

  const id = typeof data.id === "string" ? data.id : null;
  if (!id) throw new Error("Resend no devolvió un identificador de correo.");
  return { id };
}
