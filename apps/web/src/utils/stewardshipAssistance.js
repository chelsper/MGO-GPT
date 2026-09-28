export const ASSISTANCE_TYPES = Object.freeze({
  letter: "Letter or note",
  gift: "Personal gift",
  recognition: "Recognition or experience",
  guidance: "Help me choose / other",
});
export const ASSISTANCE_STATUSES = ["Open", "In Progress", "Completed", "Declined"];
export const isStewardshipRequest = row => Boolean(row?.source_pending_action_id);

export function assistanceDate(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31") throw new Error("Choose a valid needed-by date.");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid needed-by date.");
  return value;
}

export function assistanceDraft(body) {
  if (!body || Array.isArray(body) || typeof body !== "object" ||
      Object.keys(body).some(key => !["type", "instructions", "neededBy", "expectedUpdatedAt"].includes(key))) throw new Error("Review the request fields and try again.");
  if (!Object.hasOwn(ASSISTANCE_TYPES, body.type)) throw new Error("Choose the kind of assistance you need.");
  if (typeof body.instructions !== "string" || !body.instructions.trim() || body.instructions.length > 4000) throw new Error("Describe what you need in 1-4,000 characters.");
  if (typeof body.expectedUpdatedAt !== "string" || body.expectedUpdatedAt.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}[T ]/.test(body.expectedUpdatedAt) || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) throw new Error("Reload this follow-up before submitting a request.");
  return { type: body.type, instructions: body.instructions.trim(), neededBy: assistanceDate(body.neededBy), expectedUpdatedAt: body.expectedUpdatedAt };
}

export function assistanceId(value) {
  return /^[1-9]\d*$/.test(String(value || "")) && Number.isSafeInteger(Number(value));
}
