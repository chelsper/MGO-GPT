export const ASSISTANCE_TYPES = Object.freeze({
  letter: "Letter or note",
  gift: "Personal gift",
  recognition: "Recognition or experience",
  visit: "Campus visit",
  leadership: "Leadership thank-you",
  impact: "Impact report",
  guidance: "Help me choose / other",
});
export const ASSISTANCE_STATUSES = ["Open", "In Progress", "Completed", "Declined"];
export const isStewardshipRequest = row => Boolean(row?.source_pending_action_id || row?.stewardship_request_key);
export const isPersonalGiftRequest = row => isStewardshipRequest(row) && row.request_type === "Stewardship: Personal gift";
export const validGiftItemId = value => value === null || (typeof value === "string" && /^[1-9]\d{0,17}$/.test(value));

export function assistanceDate(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31") throw new Error("Choose a valid needed-by date.");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid needed-by date.");
  return value;
}

export function assistanceDraft(body) {
  if (!body || Array.isArray(body) || typeof body !== "object" ||
      Object.keys(body).some(key => !["type", "instructions", "neededBy", "expectedUpdatedAt", "giftItemId"].includes(key))) throw new Error("Review the request fields and try again.");
  if (typeof body.expectedUpdatedAt !== "string" || body.expectedUpdatedAt.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}[T ]/.test(body.expectedUpdatedAt) || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) throw new Error("Reload this follow-up before submitting a request.");
  return { ...assistanceFields(body), expectedUpdatedAt: body.expectedUpdatedAt };
}

function assistanceFields(body) {
  if (!Object.hasOwn(ASSISTANCE_TYPES, body.type)) throw new Error("Choose the kind of assistance you need.");
  if (typeof body.instructions !== "string" || !body.instructions.trim() || body.instructions.length > 4000) throw new Error("Describe what you need in 1-4,000 characters.");
  if (Object.hasOwn(body, "giftItemId") && (!validGiftItemId(body.giftItemId) || (body.type !== "gift" && body.giftItemId !== null))) throw new Error("Choose an available gift for a personal-gift request, or leave it open for suggestions.");
  return { type: body.type, instructions: body.instructions.trim(), neededBy: assistanceDate(body.neededBy),
    ...(Object.hasOwn(body, "giftItemId") ? { giftItemId: body.giftItemId } : {}) };
}

export const validAssistanceKey = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export function directAssistanceDraft(body) {
  if (!body || Array.isArray(body) || typeof body !== "object" ||
      Object.keys(body).some(key => !["type", "instructions", "neededBy", "contextVersion", "giftItemId"].includes(key)) ||
      typeof body.contextVersion !== "string" || !/^[a-f0-9]{32}$/.test(body.contextVersion))
    throw new Error("Reload this donor's saved details before submitting a request.");
  return { ...assistanceFields(body), contextVersion: body.contextVersion };
}

export function assistanceId(value) {
  return /^[1-9]\d*$/.test(String(value || "")) && Number.isSafeInteger(Number(value));
}
