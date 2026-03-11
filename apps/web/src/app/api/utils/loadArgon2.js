import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const argon2Package = "@node-rs/argon2";

let cachedArgon2;

export function loadArgon2() {
  if (!cachedArgon2) {
    cachedArgon2 = require(argon2Package);
  }

  return cachedArgon2;
}
