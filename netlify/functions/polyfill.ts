import { webcrypto } from "node:crypto";

const existing = (globalThis as { crypto?: Crypto }).crypto;
if (!existing?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
