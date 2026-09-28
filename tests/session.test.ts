import "../netlify/functions/polyfill";
import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, verifySession } from "../shared/session";

const secret = "test-secret-value-123";

test("session tokens expire and reject tampering", async () => {
  const token = await createSessionToken(secret, "admin", 60_000);
  assert.equal(await verifySession(secret, token), "admin");
  assert.equal(await verifySession("other-secret-value", token), null);
  const expired = await createSessionToken(secret, "admin", -1);
  assert.equal(await verifySession(secret, expired), null);
  const [body, signature] = token.split(".");
  assert.equal(await verifySession(secret, `${body.slice(0, -2)}aa.${signature}`), null);
});
