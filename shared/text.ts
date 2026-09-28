const LOCAL_IMAGE =
  /^\/images\/(logo|hero|menu|gallery)\/[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(jpg|jpeg|png|webp)$/i;

export function sanitizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

export function isPlaceholder(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return trimmed.endsWith("_HERE");
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isRealPhone(value: string | null | undefined): boolean {
  if (!value || isPlaceholder(value)) return false;
  const digits = digitsOnly(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  return isHttpUrl(value) && new URL(value).protocol === "https:";
}

export function isSafeImageRef(value: string): boolean {
  if (!value) return true;
  if (LOCAL_IMAGE.test(value)) return true;
  return isHttpsUrl(value);
}

export function isLocalImagePath(value: string): boolean {
  return LOCAL_IMAGE.test(value);
}

export function isGoogleEmbed(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host !== "www.google.com" && host !== "maps.google.com") return false;
    return url.pathname.includes("/maps");
  } catch {
    return false;
  }
}

export function extractEmbedUrl(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/src\s*=\s*["']([^"']+)["']/i);
  return (match?.[1] || trimmed).trim();
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "item";
}

export function uniqueId(base: string, used: Set<string>): string {
  const root = slugify(base);
  if (!used.has(root)) return root;
  let count = 2;
  while (used.has(`${root}-${count}`)) count += 1;
  return `${root}-${count}`.slice(0, 80);
}

export function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] || 0) ^ (right[index] || 0);
  }
  return mismatch === 0;
}
