import { NextResponse } from "next/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function unknownErrorMessage(
  error: unknown,
  fallback = "Ha ocurrido un error inesperado."
) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function jsonError(
  error: string,
  status: number,
  detail?: string
) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detalle: detail } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export function unauthorizedJson() {
  return jsonError("Sesión de administrador no válida.", 401);
}
