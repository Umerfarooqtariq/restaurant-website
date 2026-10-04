import { z } from "zod";
import {
  extractEmbedUrl,
  isGoogleEmbed,
  isHttpUrl,
  isPlaceholder,
  isRealPhone,
  isSafeImageRef,
  sanitizeText,
} from "./text";

const requiredText = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} is too long.`)
    .transform(sanitizeText)
    .refine((value) => value.length > 0, `${label} is required.`);

const optionalText = (max: number, label: string) =>
  z.string().max(max, `${label} is too long.`).transform(sanitizeText);

const phoneField = z
  .string()
  .max(40, "Phone number is too long.")
  .transform((value) => value.trim())
  .refine(
    (value) => value === "" || isPlaceholder(value) || isRealPhone(value),
    "Enter a valid phone number.",
  );

const urlField = (label: string, max = 500) =>
  z
    .string()
    .max(max, `${label} is too long.`)
    .transform((value) => value.trim())
    .refine(
      (value) => value === "" || isPlaceholder(value) || isHttpUrl(value),
      `Enter a valid link for ${label}.`,
    );

const imageField = z
  .string()
  .max(300, "Image path is too long.")
  .transform((value) => value.trim())
  .refine(isSafeImageRef, "Use an uploaded JPG, PNG, or WebP image.");

const slugId = z.string().regex(/^[a-z0-9-]{1,80}$/, "Use a valid id.");
const tokenId = z.string().regex(/^[a-zA-Z0-9-]{1,40}$/, "Use a valid id.");

export const hoursSchema = z.object({
  id: tokenId,
  label: requiredText(80, "Hours label"),
  hours: optionalText(80, "Hours"),
});

export const bannerSchema = z.object({
  id: slugId,
  image: imageField.refine((value) => value.length > 0, "Choose a banner image."),
  alt: optionalText(180, "Banner description"),
});

export const restaurantSchema = z.object({
  name: requiredText(80, "Restaurant name"),
  tagline: optionalText(160, "Tagline"),
  description: optionalText(800, "Description"),
  address: optionalText(240, "Address"),
  city: optionalText(80, "City"),
  country: optionalText(80, "Country"),
  phone: phoneField,
  whatsapp: phoneField,
  googleMapsUrl: urlField("Google Maps", 500),
  mapEmbedUrl: z
    .string()
    .max(1000, "Map embed link is too long.")
    .transform((value) => extractEmbedUrl(value))
    .refine(
      (value) => value === "" || isGoogleEmbed(value),
      "Paste a Google Maps embed link, or leave this empty.",
    ),
  logo: imageField,
  heroImage: imageField,
  banners: z.array(bannerSchema).max(8, "Use at most 8 banner photos.").default([]),
  openingHours: z.array(hoursSchema).max(14, "Too many opening-hour rows."),
  socialLinks: z.object({
    facebook: urlField("Facebook"),
    instagram: urlField("Instagram"),
    tiktok: urlField("TikTok"),
  }),
  about: z.object({
    story: optionalText(2500, "Story"),
    introduction: optionalText(2500, "Introduction"),
    cuisine: optionalText(2500, "Cuisine"),
    specialties: optionalText(2500, "Specialties"),
    philosophy: optionalText(2500, "Philosophy"),
    ambience: optionalText(2500, "Ambience"),
    experience: optionalText(2500, "Experience"),
  }),
});

export const priceSchema = z.object({
  id: tokenId,
  label: requiredText(40, "Price label"),
  amount: z
    .number({ invalid_type_error: "Enter a valid price." })
    .min(0, "Price cannot be negative.")
    .max(1_000_000, "Price is too large.")
    .nullable()
    .refine((value) => value === null || Math.round(value * 100) === value * 100, "Enter a valid price."),
});

export const menuItemSchema = z.object({
  id: slugId,
  name: requiredText(120, "Item name"),
  description: optionalText(800, "Description"),
  image: imageField,
  prices: z.array(priceSchema).min(1, "Add at least one price option.").max(8, "Use at most 8 price options."),
  featured: z.boolean(),
  available: z.boolean(),
  demo: z.boolean().optional(),
});

export const categorySchema = z.object({
  id: slugId,
  name: requiredText(80, "Category name"),
  description: optionalText(300, "Category description"),
  image: imageField,
  demo: z.boolean().optional(),
  items: z.array(menuItemSchema).max(200, "Too many items in one category."),
});

export const menuSchema = z.object({
  categories: z.array(categorySchema).max(40, "Too many categories."),
}).superRefine((menu, ctx) => {
  const categories = new Set<string>();
  const items = new Set<string>();
  menu.categories.forEach((category, categoryIndex) => {
    if (categories.has(category.id)) {
      ctx.addIssue({ code: "custom", message: "Category names must stay unique.", path: ["categories", categoryIndex, "id"] });
    }
    categories.add(category.id);
    category.items.forEach((item, itemIndex) => {
      if (items.has(item.id)) {
        ctx.addIssue({ code: "custom", message: "Menu item names must stay unique.", path: ["categories", categoryIndex, "items", itemIndex, "id"] });
      }
      items.add(item.id);
      const prices = new Set<string>();
      item.prices.forEach((price, priceIndex) => {
        if (prices.has(price.id)) {
          ctx.addIssue({
            code: "custom",
            message: "Price options must be unique.",
            path: ["categories", categoryIndex, "items", itemIndex, "prices", priceIndex, "id"],
          });
        }
        prices.add(price.id);
      });
    });
  });
});

export const galleryImageSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/, "Use a valid id."),
  url: imageField.refine((value) => value.length > 0, "Choose an image."),
  alt: requiredText(180, "Alt text"),
  title: optionalText(120, "Title"),
  category: z.enum(["restaurant", "interior", "food", "dishes", "ambience", "events", "other"]),
  width: z.number().int().positive().max(8000).optional(),
  height: z.number().int().positive().max(8000).optional(),
});

export const gallerySchema = z.object({
  images: z.array(galleryImageSchema).max(200, "Too many gallery images."),
}).superRefine((gallery, ctx) => {
  const ids = new Set<string>();
  gallery.images.forEach((image, index) => {
    if (ids.has(image.id)) {
      ctx.addIssue({ code: "custom", message: "Gallery images must stay unique.", path: ["images", index, "id"] });
    }
    ids.add(image.id);
  });
});

export const settingsSchema = z.object({
  status: z.enum(["open", "closed"]),
  currency: requiredText(12, "Currency"),
  currencySymbol: requiredText(8, "Currency symbol"),
  siteUrl: z
    .string()
    .max(300, "Site URL is too long.")
    .transform((value) => value.trim())
    .refine((value) => value === "" || isHttpUrl(value), "Enter a valid site URL."),
  seoTitle: requiredText(120, "SEO title"),
  seoDescription: optionalText(300, "SEO description"),
  whatsappOrderMessage: requiredText(300, "WhatsApp message"),
  whatsappItemMessage: requiredText(300, "WhatsApp item message"),
});

export const categoryInputSchema = z.object({
  name: requiredText(80, "Category name"),
  description: optionalText(300, "Category description"),
  image: imageField,
  demo: z.boolean().optional(),
});

export const itemInputSchema = z.object({
  categoryId: slugId,
  name: requiredText(120, "Item name"),
  description: optionalText(800, "Description"),
  image: imageField,
  prices: z.array(priceSchema).min(1, "Add at least one price option.").max(8, "Use at most 8 price options."),
  featured: z.boolean(),
  available: z.boolean(),
  demo: z.boolean().optional(),
});

export const galleryInputSchema = galleryImageSchema.omit({ id: true });

export const reorderSchema = z.object({
  ids: z.array(slugId).max(200),
});

export const itemReorderSchema = z.object({
  categoryId: slugId,
  ids: z.array(slugId).max(200),
});

export function formatZodError(error: z.ZodError): string {
  const message = error.issues[0]?.message ?? "";
  if (!message || message.startsWith("Expected") || message.startsWith("Invalid")) {
    return "Please check the form and try again.";
  }
  return message;
}

export type Restaurant = z.infer<typeof restaurantSchema>;
export type Menu = z.infer<typeof menuSchema>;
export type Gallery = z.infer<typeof gallerySchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuCategory = z.infer<typeof categorySchema>;
export type GalleryImage = z.infer<typeof galleryImageSchema>;
export type HoursEntry = z.infer<typeof hoursSchema>;
