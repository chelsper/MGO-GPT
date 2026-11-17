export const directFlags = new Set(["Regular Gift", "Company MG-Pledge", "Company MG-Payment"]);
export const matchingFlags = new Set(["Constituent MG-Pledge", "Constituent MG-Payment"]);
export const softFlags = new Set(["Soft Credit Recipient", "Soft Credit Recipient Company for MG Pledge", "Soft Credit Recipient Company for MG Payment"]);
const uncomplicatedTypes = new Set(["onetimegift", "cash", "giftinkind", "other", "stockproperty", "recurringgiftpayment"]);
const signature = event => JSON.stringify([event.day, event.cents, event.type]);

export function combineLifetimeEvents(histories) {
  const combined = new Map();
  for (const history of histories) for (const event of history) {
    const key = `${event.giftId}:${event.credit}`, previous = combined.get(key);
    combined.set(key, { ...event, conflict: !!(event.conflict || previous?.conflict || (previous && signature(previous) !== signature(event))),
      recipientIds: [...new Set([...(previous?.recipientIds || []), ...(event.recipientIds || [])])] });
  }
  return combined;
}

// The calculation and saved-history inspector share this decision path. One
// gift may have several credit claims, but contributes at most once per row.
export function analyzeLifetimeGifts(history, { sources, fullRecognition, today }) {
  const groups = new Map(), reasons = new Set(), supportedEvents = [];
  for (const event of history) {
    if (!groups.has(event.giftId)) groups.set(event.giftId, []);
    groups.get(event.giftId).push(event);
  }
  const items = [];
  for (const [giftId, claims] of groups) {
    const own = claims.some(event => directFlags.has(event.credit));
    const notes = new Set(), blockers = new Set();
    let chosen = null;
    const credits = claims.map(event => {
      const direct = directFlags.has(event.credit), soft = softFlags.has(event.credit);
      const kind = direct ? "Direct gift" : soft ? "Soft credit" : matchingFlags.has(event.credit) ? "Employee matching credit" : "Unknown credit";
      let treatment;
      if (matchingFlags.has(event.credit)) treatment = "Excluded: employee matching credit is not the company's own gift.";
      else if (!direct && !soft) { blockers.add("An unrecognized credit flag needs review."); treatment = "Needs credit-flag review."; }
      else if (soft && !sources.includes("recognition_credit")) treatment = "Excluded: this society does not include recognition credit.";
      else if (soft && own) treatment = "Not added again: the direct gift is already represented.";
      else if (soft && !fullRecognition) {
        blockers.add("Recognition credit needs recipient-level allocation verification; this query is not using the approved Full amount to all rule.");
        treatment = "Needs recipient allocation verification.";
      } else {
        treatment = direct ? "Direct gift considered once." : "Full gift recognition considered once, not additional revenue.";
        if (chosen && signature(chosen) !== signature(event)) blockers.add("Repeated gift records conflict; reconcile amounts, dates, types or ownership.");
        chosen ||= event;
      }
      notes.add(treatment);
      return { kind, flag: event.credit, recipientIds: event.recipientIds || [], treatment };
    });
    const conflict = claims.some(event => event.conflict) || blockers.has("Repeated gift records conflict; reconcile amounts, dates, types or ownership.");
    if (conflict) blockers.add("Repeated gift records conflict; reconcile amounts, dates, types or ownership.");
    if (chosen) {
      if (!chosen.day || chosen.day > today) blockers.add("A gift date is missing, invalid or in the future.");
      if (chosen.cents === null || chosen.cents < 0) blockers.add("A missing, invalid or negative gift amount needs review.");
      if (!uncomplicatedTypes.has(chosen.type.toLowerCase().replace(/[^a-z0-9]/g, "")))
        blockers.add("Pledges, payments, write-offs or other complex gifts need linked history reconciliation.");
    }
    for (const reason of blockers) reasons.add(reason);
    const outcome = blockers.size ? "review" : chosen ? "counted" : "excluded";
    if (outcome === "counted") supportedEvents.push(chosen);
    if (claims.length > 1 || credits.some(credit => credit.recipientIds.length > 1)) notes.add("Shared credit is counted at most once for this recipient or household.");
    const representative = chosen || claims[0];
    items.push({ giftId, day: conflict ? null : representative.day, cents: conflict ? null : representative.cents,
      type: conflict ? "Conflicting gift records" : representative.type, outcome, credits, reasons: [...blockers], notes: [...notes] });
  }
  return { reasons: [...reasons], supportedEvents, items };
}
