import "../netlify/functions/polyfill";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { hashSync } from "bcryptjs";
import { handleRequest, resetRateLimits } from "../netlify/functions/api";

const original = {
  CONTEXT: process.env.CONTEXT,
  DATA_ROOT: process.env.DATA_ROOT,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GIT_PROVIDER_TOKEN: process.env.GIT_PROVIDER_TOKEN,
  GIT_REPOSITORY: process.env.GIT_REPOSITORY,
};

let root = "";
const password = "correct-password";

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "khan-baba-"));
  const { cp, mkdir } = await import("node:fs/promises");
  await cp(path.join(process.cwd(), "data"), path.join(root, "data"), { recursive: true });
  await mkdir(path.join(root, "public", "images"), { recursive: true });
  process.env.CONTEXT = "dev";
  process.env.DATA_ROOT = root;
  process.env.ADMIN_USERNAME = "owner";
  process.env.ADMIN_PASSWORD_HASH = hashSync(password, 4);
  process.env.SESSION_SECRET = "local-test-session-secret";
  delete process.env.GIT_PROVIDER_TOKEN;
  delete process.env.GIT_REPOSITORY;
});

after(async () => {
  process.env.CONTEXT = original.CONTEXT;
  process.env.DATA_ROOT = original.DATA_ROOT;
  process.env.ADMIN_USERNAME = original.ADMIN_USERNAME;
  process.env.ADMIN_PASSWORD_HASH = original.ADMIN_PASSWORD_HASH;
  process.env.SESSION_SECRET = original.SESSION_SECRET;
  process.env.GIT_PROVIDER_TOKEN = original.GIT_PROVIDER_TOKEN;
  process.env.GIT_REPOSITORY = original.GIT_REPOSITORY;
  if (root) await rm(root, { recursive: true, force: true });
});

function call(method: string, pathname: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const requestHeaders = new Headers({
    host: "localhost",
    origin: "http://localhost",
    "x-khan-baba-request": "1",
    ...headers,
  });
  if (cookie) requestHeaders.set("cookie", `kb_session=${cookie}`);
  return handleRequest(new Request(`http://localhost${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

function tokenFrom(response: Response) {
  const raw = response.headers.get("set-cookie") || "";
  const match = /kb_session=([^;]*)/.exec(raw);
  return match ? decodeURIComponent(match[1]) : "";
}

test("admin api", async (t) => {
  await t.test("blocks requests without the site header", async () => {
    resetRateLimits();
    const response = await call("POST", "/api/admin/login", { username: "owner", password }, undefined, { "x-khan-baba-request": "" });
    assert.equal(response.status, 403);
  });

  await t.test("rejects a bad password without leaking secrets", async () => {
    resetRateLimits();
    const response = await call("POST", "/api/admin/login", { username: "owner", password: "wrong-password" });
    const text = await response.text();
    assert.equal(response.status, 401);
    assert.equal(JSON.parse(text).error, "Incorrect username or password.");
    assert.equal(text.includes(process.env.ADMIN_PASSWORD_HASH || "missing-hash"), false);
    assert.equal(text.includes(process.env.SESSION_SECRET || "missing-secret"), false);
  });

  await t.test("locks sign-in after repeated failures", async () => {
    resetRateLimits();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await call("POST", "/api/admin/login", { username: "owner", password: "wrong-password" });
      assert.equal(response.status, 401);
    }
    const limited = await call("POST", "/api/admin/login", { username: "owner", password });
    assert.equal(limited.status, 429);
  });

  let cookie = "";
  await t.test("signs in and rejects anonymous edits", async () => {
    resetRateLimits();
    const response = await call("POST", "/api/admin/login", { username: "owner", password });
    assert.equal(response.status, 200);
    cookie = tokenFrom(response);
    assert.ok(cookie);
    assert.match(response.headers.get("set-cookie") || "", /HttpOnly/);
    assert.doesNotMatch(response.headers.get("set-cookie") || "", /Secure/);
    const anonymous = await call("GET", "/api/admin/content");
    assert.equal(anonymous.status, 401);
  });

  await t.test("saves restaurant text and refuses an empty name", async () => {
    const current = JSON.parse(await readFile(path.join(root, "data", "restaurant.json"), "utf8"));
    const saved = await call("PUT", "/api/admin/restaurant", { ...current, tagline: "Test tagline" }, cookie);
    assert.equal(saved.status, 200);
    const file = JSON.parse(await readFile(path.join(root, "data", "restaurant.json"), "utf8"));
    assert.equal(file.tagline, "Test tagline");
    const invalid = await call("PUT", "/api/admin/restaurant", { ...file, name: "" }, cookie);
    assert.equal(invalid.status, 400);
    const unchanged = JSON.parse(await readFile(path.join(root, "data", "restaurant.json"), "utf8"));
    assert.equal(unchanged.name, "Khan Baba");
  });

  await t.test("adds, prices, and deletes a menu item", async () => {
    const created = await call("POST", "/api/admin/items", {
      categoryId: "breakfast",
      name: "Test Karahi",
      description: "Temporary item",
      image: "",
      prices: [{ id: "half", label: "Half", amount: 1500 }, { id: "full", label: "Full", amount: null }],
      featured: true,
      available: true,
    }, cookie);
    assert.equal(created.status, 200);
    const menu = JSON.parse(await readFile(path.join(root, "data", "menu.json"), "utf8"));
    const item = menu.categories.find((category: { id: string }) => category.id === "breakfast").items.find((entry: { name: string }) => entry.name === "Test Karahi");
    assert.equal(item.prices[0].amount, 1500);
    assert.equal(item.prices[1].amount, null);
    const removed = await call("DELETE", `/api/admin/items/${item.id}`, undefined, cookie);
    assert.equal(removed.status, 200);
  });

  await t.test("rejects a fake image and stores a real png", async () => {
    const fake = await call("POST", "/api/admin/media", { folder: "menu", dataBase64: Buffer.from("not-an-image").toString("base64") }, cookie);
    assert.equal(fake.status, 400);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const uploaded = await call("POST", "/api/admin/media", { folder: "menu", dataBase64: png.toString("base64") }, cookie);
    assert.equal(uploaded.status, 200);
    const body = await uploaded.json() as { path: string };
    assert.match(body.path, /^\/images\/menu\/.+\.png$/);
    const bytes = await readFile(path.join(root, "public", "images", "menu", path.basename(body.path)));
    assert.equal(bytes[0], 0x89);
    const deleted = await call("DELETE", `/api/admin/media?path=${encodeURIComponent(body.path)}`, undefined, cookie);
    assert.equal(deleted.status, 200);
  });

  await t.test("does not write files when production persistence is not configured", async () => {
    process.env.CONTEXT = "production";
    try {
      const beforeFile = await readFile(path.join(root, "data", "settings.json"), "utf8");
      const response = await call("PUT", "/api/admin/settings", { ...JSON.parse(beforeFile), status: "closed" }, cookie);
      assert.equal(response.status, 503);
      assert.equal(await readFile(path.join(root, "data", "settings.json"), "utf8"), beforeFile);
    } finally {
      process.env.CONTEXT = "dev";
    }
  });
});
