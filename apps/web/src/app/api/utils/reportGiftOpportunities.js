import { listBlackbaudOpportunities } from "./blackbaud";

export function isOpenNxtOpportunity(opportunity) {
  if (!opportunity?.id || opportunity.inactive === true || opportunity.inactive === "true") return false;
  const status = String(opportunity.status || "").trim().toLowerCase();
  if (!status || /closed|funded|declin|cancel|reject|lost|complete/.test(status)) return false;
  if (opportunity.funded_date || Number(opportunity.funded_amount?.value || 0) > 0) return false;
  return true;
}

const cache = new Map();
export async function getReportGiftOpportunities(ids, context) {
  const sortedIds = [...new Set(ids.map(String))].sort();
  const key = `${context.userId}:${context.authUserId}:${sortedIds.join(",")}`;
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  const value = listBlackbaudOpportunities({
    ...context,
    searchParams: { constituent_id: sortedIds },
    strictResponse: true,
  }).then((opportunities) => {
    const result = Object.fromEntries(sortedIds.map((id) => [id, []]));
    const seen = new Set();
    for (const opportunity of opportunities) {
      const constituentId = String(opportunity.constituent_id || "");
      if (!result[constituentId] || !isOpenNxtOpportunity(opportunity) || seen.has(String(opportunity.id))) continue;
      seen.add(String(opportunity.id));
      result[constituentId].push({
        id: String(opportunity.id),
        name: opportunity.name || "Untitled opportunity",
        status: opportunity.status,
        amount: opportunity.ask_amount?.value ?? opportunity.expected_amount?.value ?? null,
      });
    }
    return result;
  }).catch((error) => { cache.delete(key); throw error; });
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
  return value;
}

export function giftBelongsToConstituent(gift, constituentId) {
  const id = String(constituentId);
  return String(gift?.constituent_id || "") === id ||
    (Array.isArray(gift?.soft_credits) && gift.soft_credits.some((credit) => String(credit.constituent_id) === id));
}
