import { menu, restaurant, settings } from "./content";
import { isPlaceholder, isRealPhone, isSafeImageRef } from "../../shared/text";
import { publicUrl } from "../../shared/display";

export function resolvePublicSite(astroSite: URL | undefined) {
  const raw = settings.siteUrl.trim();
  const candidate = raw && !isPlaceholder(raw) ? raw : astroSite?.href;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function metaDescription() {
  if (settings.seoDescription.trim()) return settings.seoDescription.trim();
  const place = [restaurant.city, restaurant.country].filter((part) => part && !isPlaceholder(part)).join(", ");
  return place ? `${restaurant.name} is a restaurant in ${place}.` : `${restaurant.name} restaurant.`;
}

function absoluteImage(site: URL | null, image: string) {
  if (!image || !isSafeImageRef(image)) return null;
  if (image.startsWith("https://")) return image;
  if (image.startsWith("/") && site) return new URL(image, site).href;
  return null;
}

export function restaurantJsonLd(site: URL | null) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurant.name,
  };
  if (site) data.url = new URL("/", site).href;
  const image = absoluteImage(site, restaurant.heroImage || restaurant.logo);
  if (image) data.image = image;
  if (isRealPhone(restaurant.phone)) data.telephone = restaurant.phone.trim();
  const map = publicUrl(restaurant.googleMapsUrl);
  if (map) data.hasMap = map;
  const sameAs = [restaurant.socialLinks.facebook, restaurant.socialLinks.instagram, restaurant.socialLinks.tiktok]
    .map((url) => publicUrl(url))
    .filter((url): url is string => Boolean(url));
  if (sameAs.length) data.sameAs = sameAs;
  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (!isPlaceholder(restaurant.address)) address.streetAddress = restaurant.address;
  if (!isPlaceholder(restaurant.city)) address.addressLocality = restaurant.city;
  if (!isPlaceholder(restaurant.country)) address.addressCountry = restaurant.country;
  if (Object.keys(address).length > 1) data.address = address;
  return data;
}

export function menuJsonLd() {
  const sections = menu.categories
    .filter((category) => !category.demo)
    .map((category) => ({
      "@type": "MenuSection",
      name: category.name,
      hasMenuItem: category.items
        .filter((item) => !item.demo)
        .map((item) => {
          const entry: Record<string, unknown> = { "@type": "MenuItem", name: item.name };
          if (item.description) entry.description = item.description;
          const priced = item.prices.filter((price) => price.amount !== null);
          if (priced.length === 1) {
            entry.offers = { "@type": "Offer", price: priced[0].amount, priceCurrency: settings.currency };
          }
          return entry;
        }),
    }))
    .filter((section) => section.hasMenuItem.length > 0);
  if (!sections.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: `${restaurant.name} menu`,
    hasMenuSection: sections,
  };
}

export function safeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
