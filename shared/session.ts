export const SESSION_COOKIE = "kb_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type SessionPayload = {
  sub: string;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = (4 - (value.length % 4)) % 4;
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function cryptoApi() {
  const existing = (globalThis as { crypto?: Crypto }).crypto;
  if (!existing?.subtle) throw new Error("Web Crypto is unavailable.");
  return existing;
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return cryptoApi().subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function createSessionToken(secret: string, username: string, ttlMs = SESSION_TTL_MS): Promise<string> {
  const payload: SessionPayload = { sub: username, exp: Date.now() + ttlMs };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, "sign");
  const signature = new Uint8Array(await cryptoApi().subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${bytesToBase64Url(signature)}`;
}

export async function verifySession(secret: string, token: string): Promise<string | null> {
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const key = await hmacKey(secret, "verify");
    const valid = await cryptoApi().subtle.verify(
      "HMAC",
      key,
      new Uint8Array(base64UrlToBytes(parts[1])),
      new TextEncoder().encode(parts[0]),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as SessionPayload;
    if (!payload || typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.sub.length < 1 || payload.sub.length > 80) return null;
    if (payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return null;
    }
  }
  return null;
}
