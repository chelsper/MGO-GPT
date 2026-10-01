export const receiptId = (value) =>
  typeof value === "string" && /^[1-9]\d{0,17}$/.test(value);
export const receiptDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= "1900-01-01" &&
  value <= "2200-12-31" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

export function receiptCommand(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const common = ["operation", "viewerKey", "requestId", "version"];
  const fields =
    body.operation === "record"
      ? [...common, "token", "itemId", "receivedOn", "note", "confirmed"]
      : body.operation === "void"
        ? [...common, "id", "reason"]
        : body.operation === "void_imported"
          ? ["operation", "viewerKey", "id", "reason"]
        : [];
  if (
    !fields.length ||
    Object.keys(body).some((key) => !fields.includes(key)) ||
    !receiptId(body.viewerKey) ||
    (body.operation !== "void_imported" && (!receiptId(body.requestId) ||
    !Number.isSafeInteger(body.version) || body.version < 1))
  )
    return null;
  if (body.operation === "record") {
    if (
      !receiptId(body.itemId) ||
      !receiptDate(body.receivedOn) ||
      body.confirmed !== true ||
      typeof body.token !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.token,
      ) ||
      typeof body.note !== "string" ||
      body.note.length > 2000
    )
      return null;
    return { ...body, token: body.token.toLowerCase(), note: body.note.trim() };
  }
  if (
    !receiptId(body.id) ||
    typeof body.reason !== "string" ||
    !body.reason.trim() ||
    body.reason.length > 1000
  )
    return null;
  return { ...body, reason: body.reason.trim() };
}

export function receiptFilters(params) {
  const filters = {
    search: (params.get("search") || "").trim(),
    includeVoided: params.get("includeVoided") === "true",
  };
  if (
    filters.search.length > 160 ||
    (params.has("includeVoided") &&
      !["true", "false"].includes(params.get("includeVoided")))
  )
    return null;
  for (const key of ["itemId", "constituentId", "requestId", "before"]) {
    const value = params.get(key);
    if (value !== null && !receiptId(value)) return null;
    filters[key] = value;
  }
  return filters;
}

export function formatReceivedDate(value) {
  const day = String(value || "").slice(0, 10);
  return receiptDate(day)
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date unavailable";
}
