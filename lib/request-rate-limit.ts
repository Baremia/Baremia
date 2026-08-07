import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "./supabase-admin";

function requestSource(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimitSecret() {
  const secret =
    process.env.BAREMIA_RATE_LIMIT_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) throw new Error("No existe un secreto para anonimizar límites de solicitudes.");
  return secret;
}

function sourceKey(request: NextRequest, namespace: string, discriminator = "") {
  const source = requestSource(request);
  return createHmac("sha256", rateLimitSecret())
    .update(`${namespace}\n${source}\n${discriminator}`)
    .digest("hex");
}

export async function consumeRequestLimit(
  request: NextRequest,
  options: {
    namespace: string;
    limit: number;
    windowSeconds: number;
    blockSeconds?: number;
    discriminator?: string;
  }
) {
  try {
    const key = `${options.namespace}:${sourceKey(
      request,
      options.namespace,
      options.discriminator ?? ""
    )}`;
    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("consumir_limite_solicitudes", {
        p_clave: key,
        p_limite: options.limit,
        p_ventana_segundos: options.windowSeconds,
        p_bloqueo_segundos: options.blockSeconds ?? 0,
      });

    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.permitido !== false,
      remaining: Number(row?.restantes ?? 0),
      retryAfter: Number(row?.reintentar_en_segundos ?? 0),
    };
  } catch (error) {
    console.error("No se pudo aplicar el límite de solicitudes:", error);
    // El limitador protege frente a abuso, pero un fallo suyo no debe tumbar la aplicación.
    return { allowed: true, remaining: 0, retryAfter: 0 };
  }
}
