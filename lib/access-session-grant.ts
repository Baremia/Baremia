import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_GRANT_COOKIE = "baremia_access_grant";
const VERSION = "v1";
const TTL_SECONDS = 60;

function secret() {
  const value =
    process.env.BAREMIA_ACCESS_GRANT_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (!value) throw new Error("No existe un secreto para autorizar la creación de sesión.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload, "utf8").digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAccessSessionGrant(accessId: string) {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${VERSION}.${expires}.${accessId}`;
  return {
    token: `${payload}.${signature(payload)}`,
    maxAge: TTL_SECONDS,
  };
}

export function verifyAccessSessionGrant(token: string | undefined, accessId: string) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expiresRaw, tokenAccessId, receivedSignature] = parts;
  if (version !== VERSION || tokenAccessId !== accessId) return false;

  const expires = Number(expiresRaw);
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;

  const payload = `${version}.${expiresRaw}.${tokenAccessId}`;
  return safeEqual(signature(payload), receivedSignature);
}
