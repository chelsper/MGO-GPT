import { blackbaudApiFetch } from "./blackbaud";

const cache = new Map();
const TTL = 15 * 60 * 1000;

async function getFund(id, context) {
  const key = `${context.userId}:${context.authUserId}:${id}`;
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  const value = blackbaudApiFetch(`/fundraising/v1/funds/${encodeURIComponent(id)}`, context)
    .then((fund) => String(fund?.description || fund?.name || "").trim())
    .catch((error) => { cache.delete(key); throw error; });
  if (cache.size >= 1000) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + TTL });
  return value;
}

export async function addReportFundDescriptions(summary, context) {
  const rows = [
    ...Object.values(summary.byConstituentId || {}).flatMap((item) => item.directGifts || []),
    ...(summary.acknowledgmentCredits || []),
  ];
  const ids = [...new Set(rows.flatMap((row) => row.fundIds || []))];
  const labels = new Map();
  let cursor = 0;
  let unavailable = false;
  await Promise.all(Array.from({ length: Math.min(2, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const description = await getFund(id, context);
        if (description) labels.set(id, description);
        else unavailable = true;
      } catch {
        // Optional display metadata must not erase valid giving totals.
        unavailable = true;
      }
    }
  }));
  for (const row of rows) {
    row.fundDescriptions = [...new Set([
      ...(row.fundDescriptions || []),
      ...(row.fundIds || []).map((id) => labels.get(id)).filter(Boolean),
    ])];
  }
  return unavailable;
}
