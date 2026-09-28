import { digitsOnly, isHttpUrl, isPlaceholder, isRealPhone } from "./text";

export function formatAmount(amount: number | null, symbol: string): string {
  if (amount === null) return "Price to be added";
  const formatted = new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return `${symbol} ${formatted}`;
}

export function telHref(phone: string): string | null {
  if (!isRealPhone(phone)) return null;
  return `tel:${phone.trim().replace(/[^\d+]/g, "")}`;
}

export function whatsAppHref(number: string, message: string): string | null {
  if (!isRealPhone(number)) return null;
  return `https://wa.me/${digitsOnly(number)}?text=${encodeURIComponent(message)}`;
}

export function itemOrderMessage(template: string, itemName: string): string {
  if (template.includes("{item}")) return template.replaceAll("{item}", itemName);
  return `${template} ${itemName}`.trim();
}

export function publicUrl(value: string | null | undefined): string | null {
  if (!value || isPlaceholder(value) || !isHttpUrl(value)) return null;
  return value.trim();
}

export function whatsAppDigits(number: string): string | null {
  if (!isRealPhone(number)) return null;
  return digitsOnly(number);
}
