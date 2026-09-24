import { createHash } from "node:crypto";
import { blackbaudApiFetch } from "./blackbaud";
import { isSystemId, moneyCents, trackerFingerprint } from "@/utils/fundraisingTracker";

const PAGE_SIZE = 500;
const MAX_ROWS = 20000;
const outright = new Set(["Donation", "Stock", "SoldStock", "Other", "GiftInKind", "RecurringGiftPayment", "RealizedPlannedGiftRevenue"]);
const commitments = new Set(["Pledge", "MatchingGiftPledge"]);
const payments = new Set(["PledgePayment", "MatchingGiftPayment"]);
const excluded = new Set(["PlannedGift", "RecurringGift", "WriteOff", "PledgeWriteOff", "MatchingGiftWriteOff"]);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function giftAmounts(gift, funds, start, end) {
  if (!isSystemId(gift?.id) || typeof gift.date !== "string" || !Number.isFinite(Date.parse(gift.date)) ||
      !/^\d{4}-\d{2}-\d{2}/.test(gift.date) || !Array.isArray(gift.gift_splits) || !gift.gift_splits.length)
    throw new Error("Invalid gift identity or splits");
  const date = gift.date.slice(0, 10);
  if ((start && date < start) || (end && date > end)) throw new Error("Gift outside requested date range");
  if (![outright, commitments, payments, excluded].some((types) => types.has(gift.type))) throw new Error("Unsupported gift type");
  const total = moneyCents(gift.amount?.value);
  const splitIds = new Set();
  let sum = 0, allocated = 0;
  for (const split of gift.gift_splits) {
    const amount = moneyCents(split.amount?.value);
    if (!isSystemId(split.id) || splitIds.has(split.id) || !isSystemId(split.fund_id) || amount === null)
      throw new Error("Invalid gift allocation");
    splitIds.add(split.id);
    sum += amount;
    if (funds.has(split.fund_id)) allocated += amount;
  }
  if (total === null || sum !== total || !Number.isSafeInteger(sum) ||
      !gift.gift_splits.some((split) => funds.has(split.fund_id))) throw new Error("Gift allocations do not reconcile");
  return { id: gift.id, digest: hash([gift.date, gift.type, total, gift.gift_splits.map((s) => [s.id, s.fund_id, s.amount.value])]),
    committed: outright.has(gift.type) || commitments.has(gift.type) ? allocated : 0,
    received: outright.has(gift.type) || payments.has(gift.type) ? allocated : 0,
    excluded: excluded.has(gift.type) ? 1 : 0 };
}

export function trackerQueryParams(panel) {
  return { limit: String(PAGE_SIZE), fund_id: panel.funds.map((f) => f.id).sort().join(","),
    ...(panel.period === "date_range" ? { start_gift_date: `${panel.startDate}T00:00:00Z`, end_gift_date: `${panel.endDate}T23:59:59.999Z` } : {}),
    sort: "date_added" };
}

function nextLink(value, params, visited) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid continuation");
  const url = new URL(value, "https://api.sky.blackbaud.com");
  if (url.origin !== "https://api.sky.blackbaud.com" || url.pathname !== "/gift/v1/gifts" || url.hash || url.username || url.password ||
      visited.includes(url.href)) throw new Error("Invalid continuation");
  // A continuation must preserve the exact source boundary, not broaden to all gifts.
  for (const [key, expected] of Object.entries(params)) if (url.searchParams.get(key) !== expected) throw new Error("Changed continuation filters");
  for (const key of url.searchParams.keys()) if (!Object.hasOwn(params, key) && !["offset", "sort_token"].includes(key)) throw new Error("Unexpected continuation filter");
  for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) throw new Error("Repeated continuation filter");
  return url.href;
}

export async function refreshFundraisingTracker({ panel, cached, user, origin, budget, read = blackbaudApiFetch, now = new Date() }) {
  const fingerprint = trackerFingerprint(panel);
  const previous = cached?.fingerprint === fingerprint ? structuredClone(cached) : { key: panel.key, fingerprint };
  if (!panel.funds.length) return { ...previous, pending: null, error: null };
  let pending = previous.pending;
  if (!pending || pending.ownerId !== user.id || now.getTime() - Date.parse(pending.startedAt) > 24 * 60 * 60 * 1000)
    pending = { ownerId: user.id, startedAt: now.toISOString(), fundIndex: 0, next: null, seen: {}, rows: 0, pages: 0, visited: [], committed: 0, received: 0, excluded: 0, count: null };
  const params = trackerQueryParams(panel);
  let checkpoint = structuredClone(pending);
  try {
    while (budget.remaining > 0) {
      checkpoint = structuredClone(pending);
      budget.remaining -= 1;
      if (pending.fundIndex < panel.funds.length) {
        const fund = panel.funds[pending.fundIndex];
        const verified = await read(`/fundraising/v1/funds/${fund.id}`, { userId: user.id, origin, maxRetries: 0 });
        if (verified?.id !== fund.id) throw new Error("Fund identity could not be verified");
        pending.fundIndex += 1;
        continue;
      }
      const url = pending.next || `/gift/v1/gifts?${new URLSearchParams(params)}`;
      const payload = await read(url, { userId: user.id, origin, maxRetries: 0 });
      if (!Array.isArray(payload?.value) || payload.value.length > PAGE_SIZE ||
          (payload.count != null && (!Number.isSafeInteger(payload.count) || payload.count < 0))) throw new Error("Invalid collection");
      if (payload.count != null) {
        if (pending.count !== null && pending.count !== payload.count) throw new Error("Collection changed during refresh");
        pending.count = payload.count;
      }
      const currentUrl = new URL(url, "https://api.sky.blackbaud.com").href;
      const visited = [...pending.visited, currentUrl];
      const next = nextLink(payload.next_link, params, visited);
      const rows = payload.value.map((gift) => giftAmounts(gift, new Set(panel.funds.map((f) => f.id)),
        panel.period === "date_range" ? panel.startDate : null, panel.period === "date_range" ? panel.endDate : null));
      for (const row of rows) {
        if (pending.seen[row.id]) throw new Error("Gift repeated during paginated refresh");
        pending.seen[row.id] = row.digest;
        pending.committed += row.committed;
        pending.received += row.received;
        pending.excluded += row.excluded;
      }
      pending.rows += rows.length;
      pending.pages += 1;
      if (pending.rows > MAX_ROWS || pending.pages > 100 || !Number.isSafeInteger(pending.committed) || !Number.isSafeInteger(pending.received) ||
          (next && !rows.length) || (pending.count !== null && (pending.rows > pending.count || (!next && pending.rows !== pending.count))) ||
          (!next && pending.count === null && rows.length === PAGE_SIZE)) throw new Error("Incomplete or oversized gift collection");
      Object.assign(pending, { next, visited });
      if (!next) return { key: panel.key, fingerprint, committedCents: pending.committed, receivedCents: pending.received,
        excludedCount: pending.excluded, refreshedAt: now.toISOString(), pending: null, error: null };
    }
    return { ...previous, pending, error: null };
  } catch (error) {
    const retryable = error.httpStatus === 429 || error.httpStatus >= 500 || error.retryAfterMs > 0 ||
      ["TimeoutError", "AbortError"].includes(error.name) || error.message === "Blackbaud request timed out" ||
      ["ETIMEDOUT", "ECONNRESET"].includes(error.code);
    // Keep the last verified page for transient failures; malformed results restart a fresh pass.
    return { ...previous, pending: retryable ? checkpoint : null,
      error: "Refresh could not verify the complete fund totals. Last successful totals are retained; try again later." };
  }
}
