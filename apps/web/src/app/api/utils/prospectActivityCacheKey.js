import { createHash } from "node:crypto";

export function prospectActivityCacheKey(origin, constituentId, kind) {
  const digest = createHash("sha256")
    .update(JSON.stringify([origin, String(constituentId)]))
    .digest("hex");
  return `prospect-activity-v1|${kind}|${digest}`;
}
