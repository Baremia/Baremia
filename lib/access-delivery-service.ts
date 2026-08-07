import { decryptAccessCode } from "./access-delivery-crypto";
import { sendAccessEmail } from "./resend-rest";
import { supabaseAdmin } from "./supabase-admin";

type DeliveryRow = {
  id: string;
  pago_id: string;
  email_destino: string;
  codigo_cifrado: string | null;
  cifrado_iv: string | null;
  cifrado_auth_tag: string | null;
  estado: string;
  referencia_email: string | null;
  intentos: number | null;
};

export async function deliverAccessByPaymentId(paymentId: string) {
  const { data, error } = await supabaseAdmin
    .from("entregas_acceso")
    .select(
      "id,pago_id,email_destino,codigo_cifrado,cifrado_iv,cifrado_auth_tag,estado,referencia_email,intentos"
    )
    .eq("pago_id", paymentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No existe una entrega asociada a este pago.");

  const delivery = data as DeliveryRow;
  if (delivery.estado === "enviado") {
    return {
      sent: true,
      alreadySent: true,
      deliveryId: delivery.id,
      emailId: delivery.referencia_email,
    };
  }

  if (
    !delivery.codigo_cifrado ||
    !delivery.cifrado_iv ||
    !delivery.cifrado_auth_tag
  ) {
    throw new Error("La entrega pendiente no conserva un código cifrado recuperable.");
  }

  const now = new Date().toISOString();
  const attempts = (delivery.intentos ?? 0) + 1;

  await supabaseAdmin
    .from("entregas_acceso")
    .update({
      estado: "enviando",
      intentos: attempts,
      ultimo_intento_at: now,
      ultimo_error: null,
      updated_at: now,
    })
    .eq("id", delivery.id);

  try {
    const accessCode = decryptAccessCode({
      ciphertext: delivery.codigo_cifrado,
      iv: delivery.cifrado_iv,
      authTag: delivery.cifrado_auth_tag,
    });

    const email = await sendAccessEmail({
      deliveryId: delivery.id,
      to: delivery.email_destino,
      accessCode,
    });

    const sentAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("entregas_acceso")
      .update({
        estado: "enviado",
        proveedor_email: "resend",
        referencia_email: email.id,
        enviado_at: sentAt,
        ultimo_error: null,
        codigo_cifrado: null,
        cifrado_iv: null,
        cifrado_auth_tag: null,
        updated_at: sentAt,
      })
      .eq("id", delivery.id);

    if (updateError) throw new Error(updateError.message);

    return {
      sent: true,
      alreadySent: false,
      deliveryId: delivery.id,
      emailId: email.id,
    };
  } catch (deliveryError) {
    const message =
      deliveryError instanceof Error
        ? deliveryError.message
        : "Error desconocido enviando el acceso.";
    const failedAt = new Date().toISOString();

    await supabaseAdmin
      .from("entregas_acceso")
      .update({
        estado: "error",
        ultimo_error: message,
        updated_at: failedAt,
      })
      .eq("id", delivery.id);

    throw deliveryError;
  }
}
