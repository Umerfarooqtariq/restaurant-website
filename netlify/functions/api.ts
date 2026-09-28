import "./polyfill";
import { compare } from "bcryptjs";
import type { Config } from "@netlify/functions";
import { PublicError } from "../../shared/errors";
import { detectImageType, isImageFolder, MAX_IMAGE_BYTES } from "../../shared/images";
import {
  categoryInputSchema,
  formatZodError,
  galleryInputSchema,
  gallerySchema,
  itemInputSchema,
  itemReorderSchema,
  menuSchema,
  reorderSchema,
  restaurantSchema,
  settingsSchema,
  type Gallery,
  type Menu,
  type Restaurant,
  type Settings,
} from "../../shared/schema";
import { createSessionToken, readCookie, SESSION_COOKIE, SESSION_TTL_MS, verifySession } from "../../shared/session";
import { isLocalImagePath, safeEqual, uniqueId } from "../../shared/text";
import { getStore, type ContentStore } from "./store";

const DUMMY_HASH = "$2b$12$AV2VH2oH2qdSJklxMqKmM.0XUYrsX9gSaY.v1Jcrho6O6iG9UQY/S";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimits() {
  attempts.clear();
}

function json(body: unknown, status = 200, setCookie?: string) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function authConfig() {
  const username = process.env.ADMIN_USERNAME?.trim() || "";
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim() || "";
  const secret = process.env.SESSION_SECRET?.trim() || "";
  return {
    ok: Boolean(username && /^\$2[aby]\$/.test(hash) && secret.length >= 8),
    username,
    hash,
    secret,
  };
}

function clientIp(req: Request) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

function assertBrowserRequest(req: Request) {
  if (req.headers.get("x-khan-baba-request") !== "1") throw new PublicError(403, "Request was blocked.");
  const origin = req.headers.get("origin");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new PublicError(403, "Request was blocked.");
  }
  const forwarded = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const expected = forwarded.split(",")[0]?.trim();
  if (expected && originHost !== expected) throw new PublicError(403, "Request was blocked.");
}

function cookieHeader(req: Request, token: string, maxAge: number) {
  const forwarded = req.headers.get("x-forwarded-proto");
  const proto = forwarded?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (proto === "https") parts.push("Secure");
  return parts.join("; ");
}

async function readBody(req: Request, max: number) {
  const raw = await req.text();
  if (raw.length > max) throw new PublicError(413, "That request is too large.");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new PublicError(400, "The request could not be read.");
  }
}

function parseInput<T>(schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } }, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) throw new PublicError(400, formatZodError(result.error));
  return result.data;
}

function parseStored<T>(schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } }, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) throw new PublicError(500, "Stored content could not be read.");
  return result.data;
}

function apiPath(url: URL) {
  let path = url.pathname.replace(/\/+$/, "") || "/";
  const marker = "/.netlify/functions/api";
  if (path.startsWith(marker)) path = path.slice(marker.length) || "/";
  if (path.startsWith("/api")) path = path.slice(4) || "/";
  return path;
}

function guardAttempts(ip: string) {
  const current = attempts.get(ip);
  if (current && current.resetAt > Date.now() && current.count >= MAX_ATTEMPTS) {
    throw new PublicError(429, "Too many sign-in attempts. Please wait and try again.");
  }
}

function recordFailure(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  attempts.set(ip, current);
}

async function requireUser(req: Request) {
  const config = authConfig();
  if (!config.ok) throw new PublicError(401, "Please sign in again.");
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const subject = await verifySession(config.secret, token || "");
  if (!subject || !safeEqual(subject, config.username)) throw new PublicError(401, "Please sign in again.");
  return subject;
}

async function login(req: Request) {
  const config = authConfig();
  if (!config.ok) throw new PublicError(503, "Admin sign-in is not configured yet.");
  const ip = clientIp(req);
  guardAttempts(ip);
  const body = (await readBody(req, 4000)) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 80 || password.length > 200) {
    throw new PublicError(400, "Enter your username and password.");
  }
  const userOk = safeEqual(username, config.username);
  let passwordOk = false;
  try {
    passwordOk = await compare(password, userOk ? config.hash : DUMMY_HASH);
  } catch {
    throw new PublicError(503, "Admin sign-in is not configured correctly.");
  }
  if (!userOk || !passwordOk) {
    recordFailure(ip);
    throw new PublicError(401, "Incorrect username or password.");
  }
  attempts.delete(ip);
  const token = await createSessionToken(config.secret, config.username, SESSION_TTL_MS);
  return json({ ok: true }, 200, cookieHeader(req, token, SESSION_TTL_MS / 1000));
}

function logout(req: Request) {
  return json({ ok: true }, 200, cookieHeader(req, "", 0));
}

async function session(req: Request) {
  const config = authConfig();
  if (!config.ok) return json({ authenticated: false, configured: false });
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const subject = await verifySession(config.secret, token || "");
  return json({ authenticated: Boolean(subject && safeEqual(subject, config.username)), configured: true });
}

async function loadAll(store: ContentStore) {
  const [restaurant, menu, gallery, settings] = await Promise.all([
    store.read("restaurant").then((data) => parseStored(restaurantSchema, data)),
    store.read("menu").then((data) => parseStored(menuSchema, data)),
    store.read("gallery").then((data) => parseStored(gallerySchema, data)),
    store.read("settings").then((data) => parseStored(settingsSchema, data)),
  ]);
  return { restaurant, menu, gallery, settings };
}

function saved(store: ContentStore, extra: Record<string, unknown>) {
  return json({ ok: true, persistence: store.mode, ...extra });
}

function assertPermutation(current: string[], next: string[]) {
  if (current.length !== next.length || new Set(next).size !== next.length) {
    throw new PublicError(400, "The order could not be saved.");
  }
  const left = [...current].sort();
  const right = [...next].sort();
  if (left.some((id, index) => id !== right[index])) throw new PublicError(400, "The order could not be saved.");
}

function imageInUse(publicPath: string, restaurant: Restaurant, menu: Menu, gallery: Gallery) {
  if (restaurant.logo === publicPath || restaurant.heroImage === publicPath) return true;
  for (const category of menu.categories) {
    if (category.image === publicPath) return true;
    if (category.items.some((item) => item.image === publicPath)) return true;
  }
  return gallery.images.some((image) => image.url === publicPath);
}

async function updateRestaurant(store: ContentStore, body: unknown) {
  const restaurant = parseInput(restaurantSchema, body);
  await store.write("restaurant", restaurant, "CMS: Update restaurant information");
  return saved(store, { restaurant });
}

async function updateSettings(store: ContentStore, body: unknown) {
  const settings: Settings = parseInput(settingsSchema, body);
  await store.write("settings", settings, "CMS: Update settings");
  return saved(store, { settings });
}

async function createCategory(store: ContentStore, body: unknown) {
  const input = parseInput(categoryInputSchema, body);
  const menu = parseStored(menuSchema, await store.read("menu"));
  const id = uniqueId(input.name, new Set(menu.categories.map((category) => category.id)));
  menu.categories.push({ id, name: input.name, description: input.description, image: input.image, demo: false, items: [] });
  const next = parseInput(menuSchema, menu);
  await store.write("menu", next, `CMS: Add category ${input.name}`);
  return saved(store, { menu: next });
}

async function updateCategory(store: ContentStore, id: string, body: unknown) {
  const input = parseInput(categoryInputSchema, body);
  const menu = parseStored(menuSchema, await store.read("menu"));
  const category = menu.categories.find((entry) => entry.id === id);
  if (!category) throw new PublicError(404, "That category was not found.");
  category.name = input.name;
  category.description = input.description;
  category.image = input.image;
  if (typeof input.demo === "boolean") category.demo = input.demo;
  const next = parseInput(menuSchema, menu);
  await store.write("menu", next, `CMS: Update category ${input.name}`);
  return saved(store, { menu: next });
}

async function deleteCategory(store: ContentStore, id: string, force: boolean) {
  const menu = parseStored(menuSchema, await store.read("menu"));
  const category = menu.categories.find((entry) => entry.id === id);
  if (!category) throw new PublicError(404, "That category was not found.");
  if (category.items.length > 0 && !force) {
    throw new PublicError(409, `This category contains ${category.items.length} menu items. Confirm to delete the category and those items.`);
  }
  const next = parseInput(menuSchema, { categories: menu.categories.filter((entry) => entry.id !== id) });
  await store.write("menu", next, `CMS: Delete category ${category.name}`);
  return saved(store, { menu: next });
}

async function reorderCategories(store: ContentStore, body: unknown) {
  const input = parseInput(reorderSchema, body);
  const menu = parseStored(menuSchema, await store.read("menu"));
  assertPermutation(menu.categories.map((category) => category.id), input.ids);
  const byId = new Map(menu.categories.map((category) => [category.id, category]));
  const next = parseInput(menuSchema, { categories: input.ids.map((id) => byId.get(id)) });
  await store.write("menu", next, "CMS: Reorder categories");
  return saved(store, { menu: next });
}

function itemIds(menu: Menu) {
  return new Set(menu.categories.flatMap((category) => category.items.map((item) => item.id)));
}

async function createItem(store: ContentStore, body: unknown) {
  const input = parseInput(itemInputSchema, body);
  const menu = parseStored(menuSchema, await store.read("menu"));
  const category = menu.categories.find((entry) => entry.id === input.categoryId);
  if (!category) throw new PublicError(404, "That category was not found.");
  const id = uniqueId(input.name, itemIds(menu));
  category.items.push({
    id,
    name: input.name,
    description: input.description,
    image: input.image,
    prices: input.prices,
    featured: input.featured,
    available: input.available,
    demo: false,
  });
  const next = parseInput(menuSchema, menu);
  await store.write("menu", next, `CMS: Add menu item ${input.name}`);
  return saved(store, { menu: next });
}

async function updateItem(store: ContentStore, id: string, body: unknown) {
  const input = parseInput(itemInputSchema, body);
  const menu = parseStored(menuSchema, await store.read("menu"));
  let currentCategory = menu.categories.find((category) => category.items.some((item) => item.id === id));
  const current = currentCategory?.items.find((item) => item.id === id);
  if (!currentCategory || !current) throw new PublicError(404, "That menu item was not found.");
  const target = menu.categories.find((category) => category.id === input.categoryId);
  if (!target) throw new PublicError(404, "That category was not found.");
  const nextItem = {
    ...current,
    name: input.name,
    description: input.description,
    image: input.image,
    prices: input.prices,
    featured: input.featured,
    available: input.available,
    demo: typeof input.demo === "boolean" ? input.demo : current.demo,
  };
  if (target.id !== currentCategory.id) {
    currentCategory.items = currentCategory.items.filter((item) => item.id !== id);
    target.items.push(nextItem);
  } else {
    const index = currentCategory.items.findIndex((item) => item.id === id);
    currentCategory.items[index] = nextItem;
  }
  const next = parseInput(menuSchema, menu);
  await store.write("menu", next, `CMS: Update menu item ${input.name}`);
  return saved(store, { menu: next });
}

async function deleteItem(store: ContentStore, id: string) {
  const menu = parseStored(menuSchema, await store.read("menu"));
  const category = menu.categories.find((entry) => entry.items.some((item) => item.id === id));
  const item = category?.items.find((entry) => entry.id === id);
  if (!category || !item) throw new PublicError(404, "That menu item was not found.");
  category.items = category.items.filter((entry) => entry.id !== id);
  const next = parseInput(menuSchema, menu);
  await store.write("menu", next, `CMS: Delete menu item ${item.name}`);
  return saved(store, { menu: next });
}

async function reorderItems(store: ContentStore, body: unknown) {
  const input = parseInput(itemReorderSchema, body);
  const menu = parseStored(menuSchema, await store.read("menu"));
  const category = menu.categories.find((entry) => entry.id === input.categoryId);
  if (!category) throw new PublicError(404, "That category was not found.");
  assertPermutation(category.items.map((item) => item.id), input.ids);
  const byId = new Map(category.items.map((item) => [item.id, item]));
  category.items = input.ids.map((id) => byId.get(id)!);
  const next = parseInput(menuSchema, menu);
  await store.write("menu", next, "CMS: Reorder menu items");
  return saved(store, { menu: next });
}

async function clearDemo(store: ContentStore) {
  const menu = parseStored(menuSchema, await store.read("menu"));
  const next = parseInput(menuSchema, {
    categories: menu.categories
      .filter((category) => !category.demo)
      .map((category) => ({ ...category, items: category.items.filter((item) => !item.demo) })),
  });
  await store.write("menu", next, "CMS: Remove sample menu content");
  return saved(store, { menu: next });
}

async function createGalleryImage(store: ContentStore, body: unknown) {
  const input = parseInput(galleryInputSchema, body);
  const gallery = parseStored(gallerySchema, await store.read("gallery"));
  const used = new Set(gallery.images.map((image) => image.id));
  let id = "";
  do {
    id = `g-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  } while (used.has(id));
  gallery.images.push({ id, ...input });
  const next = parseInput(gallerySchema, gallery);
  await store.write("gallery", next, "CMS: Add gallery image");
  return saved(store, { gallery: next });
}

async function updateGalleryImage(store: ContentStore, id: string, body: unknown) {
  const input = parseInput(galleryInputSchema, body);
  const gallery = parseStored(gallerySchema, await store.read("gallery"));
  const index = gallery.images.findIndex((image) => image.id === id);
  if (index === -1) throw new PublicError(404, "That gallery image was not found.");
  gallery.images[index] = { ...gallery.images[index], ...input, id };
  const next = parseInput(gallerySchema, gallery);
  await store.write("gallery", next, "CMS: Update gallery image");
  return saved(store, { gallery: next });
}

async function deleteGalleryImage(store: ContentStore, id: string) {
  const gallery = parseStored(gallerySchema, await store.read("gallery"));
  if (!gallery.images.some((image) => image.id === id)) throw new PublicError(404, "That gallery image was not found.");
  const next = parseInput(gallerySchema, { images: gallery.images.filter((image) => image.id !== id) });
  await store.write("gallery", next, "CMS: Delete gallery image");
  return saved(store, { gallery: next });
}

async function reorderGallery(store: ContentStore, body: unknown) {
  const input = parseInput(reorderSchema, body);
  const gallery = parseStored(gallerySchema, await store.read("gallery"));
  const ids = gallery.images.map((image) => image.id);
  if (input.ids.length !== ids.length || new Set(input.ids).size !== input.ids.length || [...ids].sort().some((id, index) => id !== [...input.ids].sort()[index])) {
    throw new PublicError(400, "The order could not be saved.");
  }
  const byId = new Map(gallery.images.map((image) => [image.id, image]));
  const next = parseInput(gallerySchema, { images: input.ids.map((id) => byId.get(id)) });
  await store.write("gallery", next, "CMS: Reorder gallery");
  return saved(store, { gallery: next });
}

async function uploadMedia(store: ContentStore, body: unknown) {
  const record = body as { folder?: unknown; dataBase64?: unknown };
  if (typeof record.folder !== "string" || !isImageFolder(record.folder)) {
    throw new PublicError(400, "Choose a valid image folder.");
  }
  if (typeof record.dataBase64 !== "string") throw new PublicError(400, "The image could not be read.");
  const base64 = (record.dataBase64.includes(",") ? record.dataBase64.split(",").pop() : record.dataBase64) || "";
  if (base64.length > 2_200_000) throw new PublicError(413, "This image is too large. Use a JPG, PNG, or WebP under 1.5 MB.");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(base64, "base64"));
  } catch {
    throw new PublicError(400, "The image could not be read.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new PublicError(413, "This image is too large. Use a JPG, PNG, or WebP under 1.5 MB.");
  }
  const type = detectImageType(bytes);
  if (!type) throw new PublicError(400, "Use a JPG, PNG, or WebP image.");
  const publicPath = `/images/${record.folder}/${crypto.randomUUID()}.${type === "jpg" ? "jpg" : type}`;
  await store.writeImage(publicPath, bytes, "CMS: Upload image");
  return saved(store, { path: publicPath });
}

async function deleteMedia(store: ContentStore, publicPath: string) {
  if (!isLocalImagePath(publicPath)) throw new PublicError(400, "That image path is not allowed.");
  const content = await loadAll(store);
  if (imageInUse(publicPath, content.restaurant, content.menu, content.gallery)) {
    throw new PublicError(409, "This image is still used. Remove it from the menu, gallery, or branding first.");
  }
  await store.deleteImage(publicPath, "CMS: Delete image");
  return saved(store, {});
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const route = apiPath(new URL(req.url));
    if (req.method === "GET" && route === "/health") return json({ ok: true, persistence: getStore().mode });
    if (req.method !== "GET" && req.method !== "HEAD") assertBrowserRequest(req);

    if (req.method === "POST" && route === "/admin/login") return await login(req);
    if (req.method === "POST" && route === "/admin/logout") return logout(req);
    if (req.method === "GET" && route === "/admin/session") return await session(req);

    await requireUser(req);
    const store = getStore();
    const url = new URL(req.url);

    if (req.method === "GET" && route === "/admin/content") {
      return saved(store, await loadAll(store));
    }
    if (req.method === "PUT" && route === "/admin/restaurant") return await updateRestaurant(store, await readBody(req, 200_000));
    if (req.method === "PUT" && route === "/admin/settings") return await updateSettings(store, await readBody(req, 50_000));
    if (req.method === "POST" && route === "/admin/categories") return await createCategory(store, await readBody(req, 50_000));
    if (req.method === "POST" && route === "/admin/categories/reorder") return await reorderCategories(store, await readBody(req, 20_000));
    if (req.method === "POST" && route === "/admin/items") return await createItem(store, await readBody(req, 80_000));
    if (req.method === "POST" && route === "/admin/items/reorder") return await reorderItems(store, await readBody(req, 20_000));
    if (req.method === "POST" && route === "/admin/menu/clear-demo") return await clearDemo(store);
    if (req.method === "POST" && route === "/admin/gallery") return await createGalleryImage(store, await readBody(req, 50_000));
    if (req.method === "POST" && route === "/admin/gallery/reorder") return await reorderGallery(store, await readBody(req, 20_000));
    if (req.method === "POST" && route === "/admin/media") return await uploadMedia(store, await readBody(req, 4_500_000));

    const categoryMatch = /^\/admin\/categories\/([a-z0-9-]+)$/.exec(route);
    if (categoryMatch && req.method === "PUT") return await updateCategory(store, categoryMatch[1], await readBody(req, 50_000));
    if (categoryMatch && req.method === "DELETE") {
      return await deleteCategory(store, categoryMatch[1], url.searchParams.get("force") === "true");
    }

    const itemMatch = /^\/admin\/items\/([a-z0-9-]+)$/.exec(route);
    if (itemMatch && req.method === "PUT") return await updateItem(store, itemMatch[1], await readBody(req, 80_000));
    if (itemMatch && req.method === "DELETE") return await deleteItem(store, itemMatch[1]);

    const galleryMatch = /^\/admin\/gallery\/([a-zA-Z0-9-]+)$/.exec(route);
    if (galleryMatch && req.method === "PUT") return await updateGalleryImage(store, galleryMatch[1], await readBody(req, 50_000));
    if (galleryMatch && req.method === "DELETE") return await deleteGalleryImage(store, galleryMatch[1]);

    if (req.method === "DELETE" && route === "/admin/media") {
      return await deleteMedia(store, url.searchParams.get("path") || "");
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof PublicError) return json({ error: error.message }, error.status);
    console.error(error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

export default handleRequest;

export const config: Config = {
  path: "/api/*",
};
