import { createHash } from "node:crypto";

export function portfolioContactCacheKey(origin, constituentId) {
  return `portfolio-contact-v1|${createHash("sha256").update(`${origin}|${constituentId}`).digest("hex")}`;
}
