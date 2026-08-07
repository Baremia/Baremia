import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const raw = process.env.BAREMIA_DELIVERY_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("BAREMIA_DELIVERY_ENCRYPTION_KEY no está configurada.");
  }

  let key: Buffer;
  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "BAREMIA_DELIVERY_ENCRYPTION_KEY debe contener exactamente 32 bytes."
    );
  }

  return key;
}

export function generateAccessCode() {
  const hex = randomBytes(8).toString("hex").toUpperCase();
  return `BRM-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export function encryptAccessCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    algorithm: ALGORITHM,
  };
}

export function decryptAccessCode(input: {
  ciphertext: string;
  iv: string;
  authTag: string;
}) {
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(input.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
