import {
  assistanceDate,
  assistanceId,
  validAssistanceKey,
} from "./stewardshipAssistance";

export const FULFILLMENT_STAGES = Object.freeze({
  prepared: "Prepared / ready for hand-off",
  sent: "Sent / dispatched",
  received: "Received by the donor",
  completed: "Visit or other assistance completed",
});
export const fulfillmentToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function fulfillmentCommand(body, today = fulfillmentToday()) {
  const keys = [
    "requestId",
    "viewerKey",
    "version",
    "token",
    "stage",
    "date",
    "note",
    "confirmed",
    "stockQuantity",
    "itemId",
    "actionId",
    "followUp",
  ];
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !keys.includes(key)) ||
    !assistanceId(body.requestId) ||
    !assistanceId(body.viewerKey) ||
    !Number.isSafeInteger(body.version) ||
    body.version < 1 ||
    !validAssistanceKey(body.token) ||
    !Object.hasOwn(FULFILLMENT_STAGES, body.stage) ||
    body.confirmed !== true
  )
    throw new Error("Review what happened and confirm before saving.");
  if (!assistanceDate(body.date) || body.date > today)
    throw new Error("Choose the actual date, today or earlier.");
  if (
    typeof body.note !== "string" ||
    !body.note.trim() ||
    body.note.length > 2000
  )
    throw new Error("Add a short shared note (up to 2,000 characters).");
  if (
    !Number.isSafeInteger(body.stockQuantity) ||
    body.stockQuantity < 0 ||
    body.stockQuantity > 1000000 ||
    (body.stage !== "received" && body.stockQuantity !== 0)
  )
    throw new Error("Only newly received items can deduct stock here.");
  if (body.itemId != null && !assistanceId(body.itemId))
    throw new Error("Reload the saved item selection.");
  if (
    body.actionId != null &&
    (!assistanceId(body.actionId) || body.stage === "prepared")
  )
    throw new Error(
      "Use a valid completed NXT action system ID, not a lookup code.",
    );
  let followUp = null;
  if (body.followUp != null) {
    const f = body.followUp;
    if (
      typeof f !== "object" ||
      Array.isArray(f) ||
      Object.keys(f).some((key) => !["title", "date"].includes(key)) ||
      typeof f.title !== "string" ||
      !f.title.trim() ||
      f.title.length > 255 ||
      !assistanceDate(f.date) ||
      f.date < today ||
      body.stage === "prepared"
    )
      throw new Error(
        "Give the optional MGO follow-up a title and a date today or later.",
      );
    followUp = { title: f.title.trim(), date: f.date };
  }
  return {
    requestId: String(body.requestId),
    viewerKey: String(body.viewerKey),
    version: body.version,
    token: body.token.toLowerCase(),
    stage: body.stage,
    date: body.date,
    note: body.note.trim(),
    stockQuantity: body.stockQuantity,
    itemId: body.itemId == null ? null : String(body.itemId),
    actionId: body.actionId == null ? null : String(body.actionId),
    followUp,
  };
}

// Linking is a read-only check, not authorization to edit or recreate the action.
export function matchesFulfillmentAction(
  payload,
  { actionId, constituentId, date },
) {
  const row =
    payload?.value && !Array.isArray(payload.value) ? payload.value : payload;
  return (
    String(row?.id || "") === actionId &&
    String(row?.constituent_id || "") === constituentId &&
    row?.completed === true &&
    String(row?.completed_date || row?.date || "").slice(0, 10) === date
  );
}
