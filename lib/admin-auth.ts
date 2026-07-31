import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "baremia_admin_session";

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Falta la variable de entorno ADMIN_PASSWORD");
  }

  return password;
}

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error("Falta la variable de entorno ADMIN_SESSION_SECRET");
  }

  return secret;
}

function safeEqual(valueA: string, valueB: string) {
  const bufferA = Buffer.from(valueA);
  const bufferB = Buffer.from(valueB);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

export function isValidAdminPassword(password: string) {
  return safeEqual(password, getAdminPassword());
}

export function createAdminSessionToken() {
  return createHmac("sha256", getAdminSessionSecret())
    .update(`baremia-admin:${getAdminPassword()}`)
    .digest("hex");
}

export function isValidAdminSessionToken(token?: string) {
  if (!token) {
    return false;
  }

  return safeEqual(token, createAdminSessionToken());
}

export async function hasAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  return isValidAdminSessionToken(token);
}
