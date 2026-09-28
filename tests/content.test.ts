import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatAmount, itemOrderMessage, whatsAppHref } from "../shared/display";
import { gallerySchema, menuSchema, restaurantSchema, settingsSchema } from "../shared/schema";
import { isPlaceholder, isRealPhone } from "../shared/text";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));

test("seed content matches the schemas", () => {
  restaurantSchema.parse(read("restaurant"));
  menuSchema.parse(read("menu"));
  gallerySchema.parse(read("gallery"));
  settingsSchema.parse(read("settings"));
});

test("placeholders are not treated as real contact details", () => {
  assert.equal(isPlaceholder("PHONE_NUMBER_HERE"), true);
  assert.equal(isPlaceholder("ADDRESS_HERE"), true);
  assert.equal(isRealPhone("PHONE_NUMBER_HERE"), false);
  assert.equal(whatsAppHref("WHATSAPP_NUMBER_HERE", "Hello"), null);
  assert.equal(isRealPhone("+92 300 1234567"), true);
});

test("whatsapp links encode the dish message", () => {
  const message = itemOrderMessage("Hello Khan Baba, I would like to order {item}.", "Chicken Karahi");
  assert.equal(
    whatsAppHref("+92 300 1234567", message),
    "https://wa.me/923001234567?text=Hello%20Khan%20Baba%2C%20I%20would%20like%20to%20order%20Chicken%20Karahi.",
  );
});

test("missing prices are not shown as zero", () => {
  assert.equal(formatAmount(null, "Rs."), "Price to be added");
  assert.equal(formatAmount(1800, "Rs."), "Rs. 1,800");
});
